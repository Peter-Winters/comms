import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { openAttachment } from '@/lib/media';
import type { Message } from '@/lib/types';

type Props = { message: Message | null; onClose: () => void };

/** Full-screen photo or video. */
export function MediaViewer({ message, onClose }: Props) {
  const insets = useSafeAreaInsets();
  if (!message?.media) return null;
  const media = message.media;
  return (
    <Modal visible animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.backdrop}>
        {message.kind === 'video' ? (
          <Video uri={media.uri} headers={media.headers} />
        ) : (
          <Image
            source={{ uri: media.uri, headers: media.headers }}
            placeholder={message.image ? { uri: message.image.uri, headers: message.image.headers } : undefined}
            style={styles.fill}
            contentFit="contain"
          />
        )}
        <View style={[styles.bar, { top: insets.top + 8 }]}>
          <Pressable hitSlop={12} onPress={onClose} style={styles.button}>
            <Ionicons name="close" size={26} color="#fff" />
          </Pressable>
          <Pressable hitSlop={12} onPress={() => openAttachment(media)} style={styles.button}>
            <Ionicons name="share-outline" size={24} color="#fff" />
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function Video({ uri, headers }: { uri: string; headers?: Record<string, string> }) {
  const player = useVideoPlayer({ uri, headers }, (p) => p.play());
  return <VideoView player={player} style={styles.fill} nativeControls contentFit="contain" />;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#000', justifyContent: 'center' },
  fill: { width: '100%', height: '100%' },
  bar: { position: 'absolute', left: 12, right: 12, flexDirection: 'row', justifyContent: 'space-between' },
  button: { backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 20, padding: 6 },
});
