import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { memo } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { colorFor, formatTime } from '@/lib/format';
import { formatBytes, formatDuration, openAttachment } from '@/lib/media';
import { useColors } from '@/lib/store';
import type { Message } from '@/lib/types';
import { AudioBubble } from './audio-bubble';
import { Avatar } from './avatar';

type Props = {
  message: Message;
  isGroup: boolean;
  firstInGroup: boolean;
  lastInGroup: boolean;
  onLongPress: (message: Message) => void;
  onReact: (message: Message, key: string) => void;
  onOpenMedia: (message: Message) => void;
};

const URL_RE = /(https?:\/\/[^\s]+)/g;
const MAX_IMAGE = 240;

export const MessageBubble = memo(function MessageBubble({
  message: m,
  isGroup,
  firstInGroup,
  lastInGroup,
  onLongPress,
  onReact,
  onOpenMedia,
}: Props) {
  const colors = useColors();
  const mine = m.fromMe;
  const fg = mine ? colors.bubbleMineText : colors.bubbleTheirsText;
  const showAvatar = isGroup && !mine;

  let imageSize: { width: number; height: number } | undefined;
  if (m.image) {
    const w = m.image.width ?? MAX_IMAGE;
    const h = m.image.height ?? MAX_IMAGE;
    const scale = Math.min(1, MAX_IMAGE / Math.max(w, h));
    imageSize = { width: Math.max(80, w * scale), height: Math.max(80, h * scale) };
  }

  const body = (() => {
    if (m.kind === 'encrypted') {
      return (
        <View style={styles.inlineRow}>
          <Ionicons name="lock-closed" size={13} color={fg} style={{ opacity: 0.7 }} />
          <Text style={[styles.text, styles.italic, { color: fg, opacity: 0.8 }]}>{m.text}</Text>
        </View>
      );
    }
    if (m.kind === 'file') {
      return (
        <View style={styles.fileRow}>
          <View style={[styles.fileIcon, { backgroundColor: mine ? 'rgba(255,255,255,0.2)' : colors.surfaceAlt }]}>
            <Ionicons name="document-text-outline" size={22} color={fg} />
          </View>
          <View style={{ flexShrink: 1 }}>
            <Text style={[styles.fileName, { color: fg }]} numberOfLines={2}>
              {m.media?.name ?? 'File'}
            </Text>
            {!!m.media?.size && <Text style={[styles.fileMeta, { color: fg }]}>{formatBytes(m.media.size)}</Text>}
          </View>
        </View>
      );
    }
    if (m.kind === 'audio' && m.media) {
      return (
        <AudioBubble
          media={m.media}
          color={fg}
          trackColor={mine ? 'rgba(255,255,255,0.3)' : colors.surfaceAlt}
        />
      );
    }
    if (m.kind === 'video') {
      const w = m.media?.width ?? 16;
      const h = m.media?.height ?? 9;
      const scale = Math.min(1, MAX_IMAGE / Math.max(w, h));
      const size = { width: Math.max(160, w * scale), height: Math.max(120, h * scale) };
      return (
        <View style={[size, styles.video]}>
          {m.media?.thumbnail && (
            <Image source={{ uri: m.media.thumbnail.uri, headers: m.media.thumbnail.headers }} style={[size, styles.image]} contentFit="cover" />
          )}
          <View style={styles.play}>
            <Ionicons name="play" size={28} color="#fff" />
          </View>
          {!!m.media?.duration && <Text style={styles.videoTime}>{formatDuration(m.media.duration)}</Text>}
        </View>
      );
    }
    const text = m.kind === 'emote' ? `* ${m.senderName} ${m.text}` : m.text;
    return (
      <Text style={[styles.text, { color: fg }, m.kind === 'emote' && styles.italic]} selectable>
        {text.split(URL_RE).map((part, i) =>
          i % 2 === 1 ? (
            <Text key={i} style={styles.link} onPress={() => Linking.openURL(part)}>
              {part}
            </Text>
          ) : (
            part
          ),
        )}
      </Text>
    );
  })();

  const status =
    m.status === 'sending' ? (
      <Ionicons name="time-outline" size={12} color={colors.textFaint} />
    ) : m.status === 'read' ? (
      <Ionicons name="checkmark-done" size={14} color={colors.accent} />
    ) : m.status === 'sent' ? (
      <Ionicons name="checkmark" size={14} color={colors.textFaint} />
    ) : m.status === 'failed' ? (
      <Ionicons name="alert-circle" size={14} color={colors.danger} />
    ) : null;

  return (
    <View style={[styles.row, mine ? styles.rowMine : styles.rowTheirs, { marginTop: firstInGroup ? 10 : 2 }]}>
      {showAvatar && (
        <View style={styles.avatarSlot}>
          {lastInGroup && <Avatar title={m.senderName} size={28} />}
        </View>
      )}
      <View style={[styles.column, mine ? styles.columnMine : styles.columnTheirs]}>
        {isGroup && !mine && firstInGroup && (
          <Text style={[styles.sender, { color: colorFor(m.senderName) }]}>{m.senderName}</Text>
        )}
        <Pressable
          onPress={
            m.kind === 'image' || m.kind === 'video'
              ? () => onOpenMedia(m)
              : m.kind === 'file' && m.media
                ? () => openAttachment(m.media!).catch(() => {})
                : undefined
          }
          onLongPress={() => onLongPress(m)}
          delayLongPress={300}
          style={[
            styles.bubble,
            {
              backgroundColor: mine ? colors.bubbleMine : colors.bubbleTheirs,
              opacity: m.status === 'sending' ? 0.7 : 1,
            },
            mine
              ? { borderBottomRightRadius: lastInGroup ? 6 : 18, borderTopRightRadius: firstInGroup ? 18 : 6 }
              : { borderBottomLeftRadius: lastInGroup ? 6 : 18, borderTopLeftRadius: firstInGroup ? 18 : 6 },
            (m.image || m.kind === 'video') && !m.replyTo ? styles.imageBubble : null,
          ]}>
          {m.replyTo && (
            <View style={[styles.quote, { borderLeftColor: mine ? 'rgba(255,255,255,0.6)' : colors.accent }]}>
              {!!m.replyTo.senderName && (
                <Text style={[styles.quoteSender, { color: fg }]} numberOfLines={1}>
                  {m.replyTo.senderName}
                </Text>
              )}
              <Text style={[styles.quoteText, { color: fg }]} numberOfLines={2}>
                {m.replyTo.text}
              </Text>
            </View>
          )}
          {m.image && imageSize ? (
            <Image
              source={{ uri: m.image.uri, headers: m.image.headers }}
              style={[imageSize, styles.image]}
              contentFit="cover"
              transition={150}
            />
          ) : (
            body
          )}
          {(m.kind === 'image' || m.kind === 'video') && !!m.text && (
            <Text style={[styles.text, styles.caption, { color: fg }]}>{m.text}</Text>
          )}
        </Pressable>
        {m.reactions.length > 0 && (
          <View style={[styles.reactions, mine ? styles.columnMine : styles.columnTheirs]}>
            {m.reactions.map((r) => (
              <Pressable
                key={r.key}
                onPress={() => onReact(m, r.key)}
                style={[
                  styles.reaction,
                  {
                    backgroundColor: r.mine ? colors.accent + '33' : colors.surface,
                    borderColor: r.mine ? colors.accent : colors.border,
                  },
                ]}>
                <Text style={styles.reactionKey}>{r.key}</Text>
                {r.count > 1 && <Text style={[styles.reactionCount, { color: colors.textMuted }]}>{r.count}</Text>}
              </Pressable>
            ))}
          </View>
        )}
        {lastInGroup && (
          <View style={[styles.meta, mine ? styles.columnMine : styles.columnTheirs]}>
            <Text style={[styles.time, { color: colors.textFaint }]}>
              {formatTime(m.ts)}
              {m.edited ? ' · edited' : ''}
            </Text>
            {mine && status}
          </View>
        )}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', paddingHorizontal: 12, alignItems: 'flex-end' },
  rowMine: { justifyContent: 'flex-end' },
  rowTheirs: { justifyContent: 'flex-start' },
  avatarSlot: { width: 28, marginRight: 8, marginBottom: 20 },
  column: { maxWidth: '78%' },
  columnMine: { alignItems: 'flex-end', alignSelf: 'flex-end' },
  columnTheirs: { alignItems: 'flex-start', alignSelf: 'flex-start' },
  sender: { fontSize: 12, fontWeight: '600', marginBottom: 3, marginLeft: 12 },
  bubble: { borderRadius: 18, paddingHorizontal: 13, paddingVertical: 8 },
  imageBubble: { padding: 3 },
  image: { borderRadius: 15 },
  text: { fontSize: 16, lineHeight: 21 },
  italic: { fontStyle: 'italic' },
  link: { textDecorationLine: 'underline' },
  inlineRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  caption: { paddingHorizontal: 10, paddingTop: 6, paddingBottom: 3 },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 2, maxWidth: 260 },
  fileIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  fileName: { fontSize: 15, fontWeight: '600' },
  fileMeta: { fontSize: 12, opacity: 0.75, marginTop: 2 },
  video: { borderRadius: 15, backgroundColor: '#111', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  play: {
    position: 'absolute',
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoTime: { position: 'absolute', right: 8, bottom: 6, color: '#fff', fontSize: 12, fontWeight: '600' },
  quote: { borderLeftWidth: 3, paddingLeft: 8, marginBottom: 6, opacity: 0.85 },
  quoteSender: { fontSize: 12, fontWeight: '700' },
  quoteText: { fontSize: 13 },
  reactions: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: -4 },
  reaction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  reactionKey: { fontSize: 13 },
  reactionCount: { fontSize: 12, fontWeight: '600' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3, marginHorizontal: 4 },
  time: { fontSize: 11 },
});
