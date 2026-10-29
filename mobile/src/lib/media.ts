import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import { Linking, Platform } from 'react-native';

import type { MediaInfo, OutgoingMedia } from './types';

function extension(mime: string | undefined, fallback: string) {
  const sub = mime?.split('/')[1]?.split(';')[0];
  return sub === 'jpeg' ? 'jpg' : sub === 'quicktime' ? 'mov' : (sub ?? fallback);
}

function fromAsset(a: ImagePicker.ImagePickerAsset): OutgoingMedia {
  const isVideo = a.type === 'video';
  const mimeType = a.mimeType ?? (isVideo ? 'video/mp4' : 'image/jpeg');
  return {
    kind: isVideo ? 'video' : 'image',
    uri: a.uri,
    name: a.fileName ?? `${isVideo ? 'video' : 'photo'}-${Date.now()}.${extension(mimeType, isVideo ? 'mp4' : 'jpg')}`,
    mimeType,
    size: a.fileSize,
    width: a.width,
    height: a.height,
    duration: a.duration ?? undefined,
  };
}

export async function pickFromLibrary(): Promise<OutgoingMedia[]> {
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images', 'videos'],
    allowsMultipleSelection: true,
    selectionLimit: 10,
    quality: 0.85,
  });
  return res.canceled ? [] : res.assets.map(fromAsset);
}

export async function takePhoto(): Promise<OutgoingMedia[]> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) throw new Error('Camera permission is needed to take photos.');
  const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images', 'videos'], quality: 0.85 });
  return res.canceled ? [] : res.assets.map(fromAsset);
}

export async function pickFiles(): Promise<OutgoingMedia[]> {
  const res = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
  if (res.canceled) return [];
  return res.assets.map((a) => {
    const mimeType = a.mimeType ?? 'application/octet-stream';
    const kind = mimeType.startsWith('image/') ? 'image' : mimeType.startsWith('video/') ? 'video' : mimeType.startsWith('audio/') ? 'audio' : 'file';
    return { kind, uri: a.uri, name: a.name, mimeType, size: a.size };
  });
}

/** Downloads an (authenticated) attachment and hands it to the OS to open or share. */
export async function openAttachment(media: MediaInfo) {
  if (Platform.OS === 'web' || media.uri.startsWith('file:')) {
    if (media.uri.startsWith('file:')) await Sharing.shareAsync(media.uri, { mimeType: media.mimeType });
    else await Linking.openURL(media.uri);
    return;
  }
  const dir = new Directory(Paths.cache, 'attachments');
  if (!dir.exists) dir.create();
  const safeName = (media.name ?? 'attachment').replace(/[^\w.\- ]/g, '_');
  const target = new File(dir, `${Date.now()}-${safeName}`);
  const file = await File.downloadFileAsync(media.uri, target, { headers: media.headers, idempotent: true });
  await Sharing.shareAsync(file.uri, { mimeType: media.mimeType, dialogTitle: media.name });
}

export function formatBytes(n?: number) {
  if (!n) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function formatDuration(ms?: number) {
  if (!ms || !isFinite(ms)) return '0:00';
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
