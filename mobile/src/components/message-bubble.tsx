import FontAwesome6 from '@expo/vector-icons/FontAwesome6';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { memo } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { colorFor, contactName, formatTime } from '@/lib/format';
import { formatBytes, formatDuration, openAttachment } from '@/lib/media';
import { useTheme } from '@/lib/store';
import type { Message } from '@/lib/types';
import { AudioBubble } from './audio-bubble';
import { Avatar } from './avatar';
import { GifPlayer } from './gif-player';
import { PollCard } from './poll-card';
import { RichText } from './rich-text';
import { Text } from './themed';

type Props = {
  message: Message;
  isGroup: boolean;
  firstInGroup: boolean;
  lastInGroup: boolean;
  onLongPress: (message: Message) => void;
  /** Shows who reacted to a message. */
  onShowReactions: (message: Message) => void;
  onVote: (message: Message, optionIds: string[]) => void;
  onOpenMedia: (message: Message) => void;
  /** Scrolls to the message a reply quotes. */
  onJumpTo?: (messageId: string) => void;
  /** Briefly emphasised, e.g. after jumping to it from a reply. */
  highlighted?: boolean;
};

const MAX_IMAGE = 240;
const REEL_WIDTH = 190;

export const MessageBubble = memo(function MessageBubble({
  message: m,
  isGroup,
  firstInGroup,
  lastInGroup,
  onLongPress,
  onShowReactions,
  onVote,
  onOpenMedia,
  onJumpTo,
  highlighted,
}: Props) {
  const { colors, radius, theirBubble, avatars, colorful } = useTheme();
  const mine = m.fromMe;
  const corner = (n: number) => n * radius;
  const fg = mine ? colors.bubbleMineText : colors.bubbleTheirsText;
  const showAvatar = isGroup && !mine && avatars;

  let imageSize: { width: number; height: number } | undefined;
  if (m.image) {
    const w = m.image.width ?? MAX_IMAGE;
    const h = m.image.height ?? MAX_IMAGE;
    const scale = Math.min(1, MAX_IMAGE / Math.max(w, h));
    imageSize = { width: Math.max(80, w * scale), height: Math.max(80, h * scale) };
  }

  const share = m.share;
  const shareThumb = m.image ?? m.media?.thumbnail;
  const fromFacebook = share?.url.includes('facebook.com');
  const openShare = () => share && Linking.openURL(share.url).catch(() => {});
  const shareCard = share && (() => {
    const w = m.image?.width ?? m.media?.width ?? 9;
    const h = m.image?.height ?? m.media?.height ?? 16;
    const size = { width: REEL_WIDTH, height: Math.min(REEL_WIDTH * (h / w), REEL_WIDTH * 1.8) };
    return (
      <View>
        <View style={[size, styles.video, { borderRadius: corner(15) }]}>
          {shareThumb && (
            <Image
              source={{ uri: shareThumb.uri, headers: shareThumb.headers }}
              style={[size, { borderRadius: corner(15) }]}
              contentFit="cover"
              transition={150}
            />
          )}
          {share.label !== 'Post' && (
            <View style={[styles.play, radius === 0 && { borderRadius: 0 }]}>
              <Ionicons name="play" size={28} color="#fff" />
            </View>
          )}
          <View style={[styles.shareTag, { borderRadius: corner(10) }]}>
            <FontAwesome6 name={fromFacebook ? 'facebook' : 'instagram'} size={12} color="#fff" brand />
            <Text style={styles.shareTagText}>{share.label}</Text>
          </View>
        </View>
        <Pressable onPress={openShare} hitSlop={6} style={styles.shareFooter}>
          <Text style={[styles.shareFooterText, { color: fg }]}>
            Open in {fromFacebook ? 'Facebook' : 'Instagram'}
          </Text>
          <Ionicons name="open-outline" size={14} color={fg} />
        </Pressable>
      </View>
    );
  })();

  const body = (() => {
    if (m.kind === 'encrypted') {
      return (
        <View style={styles.inlineRow}>
          <Ionicons name="lock-closed" size={13} color={fg} style={{ opacity: 0.7 }} />
          <Text style={[styles.text, styles.italic, { color: fg, opacity: 0.8 }]}>{m.text}</Text>
        </View>
      );
    }
    if (m.kind === 'deleted' || m.kind === 'unavailable') {
      const [label, ...caption] = m.text.split('\n');
      return (
        <View>
          <View style={styles.inlineRow}>
            <Ionicons
              name={m.kind === 'deleted' ? 'ban-outline' : 'image-outline'}
              size={15}
              color={fg}
              style={{ opacity: 0.6 }}
            />
            <Text style={[styles.text, styles.italic, { color: fg, opacity: 0.7 }]}>
              {m.kind === 'deleted' ? (mine ? 'You deleted this message' : 'This message was deleted') : label}
            </Text>
          </View>
          {caption.length > 0 && <Text style={[styles.text, { color: fg, marginTop: 4 }]}>{caption.join('\n')}</Text>}
        </View>
      );
    }
    if (m.kind === 'poll' && m.poll) {
      return <PollCard poll={m.poll} color={fg} onVote={(ids) => onVote(m, ids)} />;
    }
    if (m.kind === 'file' && m.media?.contact) {
      return (
        <View style={styles.fileRow}>
          <View
            style={[
              styles.fileIcon,
              { borderRadius: corner(20), backgroundColor: mine ? 'rgba(255,255,255,0.2)' : colors.surfaceAlt },
            ]}>
            <Ionicons name="person" size={20} color={fg} />
          </View>
          <View style={{ flexShrink: 1 }}>
            <Text style={[styles.fileName, { color: fg }]} numberOfLines={2}>
              {contactName(m.media.name)}
            </Text>
            <Text style={[styles.fileMeta, { color: fg }]}>Contact · tap to save</Text>
          </View>
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
      if (m.media?.gif) {
        return (
          <View style={[size, styles.video, { borderRadius: corner(15) }]}>
            <GifPlayer media={m.media} style={size} />
            <Text style={[styles.gifTag, { borderRadius: corner(6) }]}>GIF</Text>
          </View>
        );
      }
      return (
        <View style={[size, styles.video, { borderRadius: corner(15) }]}>
          {m.media?.thumbnail && (
            <Image source={{ uri: m.media.thumbnail.uri, headers: m.media.thumbnail.headers }} style={[size, { borderRadius: corner(15) }]} contentFit="cover" />
          )}
          <View style={styles.play}>
            <Ionicons name="play" size={28} color="#fff" />
          </View>
          {!!m.media?.duration && <Text style={styles.videoTime}>{formatDuration(m.media.duration)}</Text>}
        </View>
      );
    }
    const text = m.kind === 'emote' ? `* ${m.senderName} ${m.text}` : m.text;
    const preview = m.linkPreview;
    const openPreview = () => preview && Linking.openURL(preview.url).catch(() => {});
    return (
      <View>
        <RichText
          spans={m.kind === 'emote' ? undefined : m.rich}
          text={text}
          mentions={m.mentions}
          style={[styles.text, { color: fg }, m.kind === 'emote' && styles.italic]}
          mentionColor={mine ? fg : colors.accent}
          selectable
        />
        {preview && (
          <Pressable
            onPress={openPreview}
            style={[
              styles.preview,
              { borderRadius: corner(10), backgroundColor: mine ? 'rgba(255,255,255,0.15)' : colors.surfaceAlt },
            ]}>
            {preview.image && (
              <Image
                source={{ uri: preview.image.uri, headers: preview.image.headers }}
                style={styles.previewImage}
                contentFit="cover"
              />
            )}
            <View style={styles.previewText}>
              {!!preview.title && (
                <Text style={[styles.previewTitle, { color: fg }]} numberOfLines={2}>
                  {preview.title}
                </Text>
              )}
              {!!preview.description && (
                <Text style={[styles.previewDesc, { color: fg }]} numberOfLines={2}>
                  {preview.description}
                </Text>
              )}
              <Text style={[styles.previewSite, { color: fg }]}>{preview.site}</Text>
            </View>
          </Pressable>
        )}
      </View>
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
          <Text style={[styles.sender, { color: colorful ? colorFor(m.senderName) : colors.textMuted }]}>{m.senderName}</Text>
        )}
        <Pressable
          onPress={
            share && m.kind !== 'video'
              ? openShare
              : m.kind === 'image' || m.kind === 'video'
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
              borderRadius: corner(18),
            },
            mine
              ? { borderBottomRightRadius: corner(lastInGroup ? 6 : 18), borderTopRightRadius: corner(firstInGroup ? 18 : 6) }
              : { borderBottomLeftRadius: corner(lastInGroup ? 6 : 18), borderTopLeftRadius: corner(firstInGroup ? 18 : 6) },
            !mine && theirBubble === 'outline' && { borderWidth: 1.5, borderColor: colors.border },
            !mine && theirBubble === 'plain' && styles.plainBubble,
            (m.image || m.kind === 'video') && !m.replyTo ? styles.imageBubble : null,
            highlighted && { borderWidth: 2, borderColor: colors.accent },
          ]}>
          {m.replyTo && (
            <Pressable
              onPress={() => m.replyTo && onJumpTo?.(m.replyTo.id)}
              style={[styles.quote, { borderLeftColor: mine ? 'rgba(255,255,255,0.6)' : colors.accent }]}>
              {!!m.replyTo.senderName && (
                <Text style={[styles.quoteSender, { color: fg }]} numberOfLines={1}>
                  {m.replyTo.senderName}
                </Text>
              )}
              <Text style={[styles.quoteText, { color: fg }]} numberOfLines={2}>
                {m.replyTo.text}
              </Text>
            </Pressable>
          )}
          {shareCard ? (
            shareCard
          ) : m.image && imageSize ? (
            <Image
              source={{ uri: m.image.uri, headers: m.image.headers }}
              style={[imageSize, { borderRadius: corner(15) }]}
              contentFit="cover"
              transition={150}
            />
          ) : (
            body
          )}
          {(m.kind === 'image' || m.kind === 'video') && !!m.text && (
            <RichText
              spans={m.rich}
              text={m.text}
              mentions={m.mentions}
              style={[styles.text, styles.caption, { color: fg }]}
              mentionColor={mine ? fg : colors.accent}
            />
          )}
        </Pressable>
        {m.reactions.length > 0 && (
          <View style={[styles.reactions, mine ? styles.columnMine : styles.columnTheirs]}>
            {m.reactions.map((r) => (
              <Pressable
                key={r.key}
                onPress={() => onShowReactions(m)}
                style={[
                  styles.reaction,
                  {
                    borderRadius: corner(12),
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
  plainBubble: { paddingHorizontal: 2, paddingVertical: 2 },
  text: { fontSize: 16, lineHeight: 21 },
  italic: { fontStyle: 'italic' },
  gifTag: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
    paddingHorizontal: 5,
    paddingVertical: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    overflow: 'hidden',
  },
  preview: { marginTop: 8, overflow: 'hidden', maxWidth: 260 },
  previewImage: { width: '100%', aspectRatio: 1.91 },
  previewText: { padding: 9, gap: 2 },
  previewTitle: { fontSize: 14, fontWeight: '700' },
  previewDesc: { fontSize: 13, opacity: 0.8 },
  previewSite: { fontSize: 12, opacity: 0.6, marginTop: 2 },
  inlineRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  caption: { paddingHorizontal: 10, paddingTop: 6, paddingBottom: 3 },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 2, maxWidth: 260 },
  fileIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  fileName: { fontSize: 15, fontWeight: '600' },
  fileMeta: { fontSize: 12, opacity: 0.75, marginTop: 2 },
  video: { backgroundColor: '#111', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  play: {
    position: 'absolute',
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareTag: {
    position: 'absolute',
    top: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  shareTagText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  shareFooter: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingTop: 7, paddingBottom: 4 },
  shareFooterText: { fontSize: 13, fontWeight: '600' },
  videoTime: { position: 'absolute', right: 8, bottom: 6, color: '#fff', fontSize: 12, fontWeight: '600' },
  quote: { borderLeftWidth: 3, paddingLeft: 8, marginBottom: 6, opacity: 0.85 },
  quoteSender: { fontSize: 12, fontWeight: '700' },
  quoteText: { fontSize: 13 },
  reactions: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: -4 },
  reaction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  reactionKey: { fontSize: 13 },
  reactionCount: { fontSize: 12, fontWeight: '600' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3, marginHorizontal: 4 },
  time: { fontSize: 11 },
});
