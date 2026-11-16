import Ionicons from '@expo/vector-icons/Ionicons';
import { memo, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import ReanimatedSwipeable, {
  SwipeDirection,
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';

import { formatInboxTime, typingText } from '@/lib/format';
import { useTheme } from '@/lib/store';
import { isArchived, isUnread, type Chat } from '@/lib/types';
import { Avatar } from './avatar';
import { Text } from './themed';

type Props = {
  chat: Chat;
  showPreview: boolean;
  onPress: (chat: Chat) => void;
  onLongPress: (chat: Chat) => void;
  onToggleRead: (chat: Chat) => void;
  onToggleArchive: (chat: Chat) => void;
};

export const ChatRow = memo(function ChatRow({
  chat,
  showPreview,
  onPress,
  onLongPress,
  onToggleRead,
  onToggleArchive,
}: Props) {
  const { colors, radius } = useTheme();
  const swipeRef = useRef<SwipeableMethods>(null);
  const unread = isUnread(chat);
  const archived = isArchived(chat);
  const last = chat.lastMessage;

  let preview = '';
  if (last) {
    const who = last.fromMe ? 'You' : chat.isGroup ? last.senderName?.split(' ')[0] : undefined;
    preview = who ? `${who}: ${last.text}` : last.text;
  }

  return (
    <ReanimatedSwipeable
      ref={swipeRef}
      friction={1.5}
      leftThreshold={80}
      rightThreshold={80}
      overshootFriction={8}
      renderLeftActions={() => (
        <View style={[styles.swipeAction, styles.swipeLeft, { backgroundColor: colors.accent }]}>
          <Ionicons name={unread ? 'mail-open-outline' : 'mail-unread-outline'} size={24} color={colors.accentText} />
        </View>
      )}
      renderRightActions={() => (
        <View style={[styles.swipeAction, styles.swipeRight, { backgroundColor: colors.success }]}>
          <Ionicons name={archived ? 'arrow-undo-outline' : 'checkmark-done'} size={24} color={colors.accentText} />
        </View>
      )}
      onSwipeableOpen={(direction) => {
        swipeRef.current?.close();
        if (direction === SwipeDirection.RIGHT) onToggleRead(chat);
        else onToggleArchive(chat);
      }}>
      <Pressable
        onPress={() => onPress(chat)}
        onLongPress={() => onLongPress(chat)}
        delayLongPress={350}
        style={({ pressed }) => [
          styles.row,
          { backgroundColor: pressed ? colors.surface : colors.bg },
        ]}>
        <Avatar title={chat.title} image={chat.avatar} network={chat.network} isGroup={chat.isGroup} />
        <View style={styles.body}>
          <View style={styles.line}>
            <Text
              numberOfLines={1}
              style={[styles.title, { color: colors.text, fontWeight: unread ? '700' : '600' }]}>
              {chat.title}
            </Text>
            {chat.muted && <Ionicons name="notifications-off" size={13} color={colors.textFaint} />}
            {chat.pinned && <Ionicons name="pin" size={13} color={colors.textFaint} />}
            {last && (
              <Text style={[styles.time, { color: unread && !chat.muted ? colors.accent : colors.textFaint }]}>
                {formatInboxTime(last.ts)}
              </Text>
            )}
          </View>
          <View style={styles.line}>
            <Text
              numberOfLines={2}
              style={[
                styles.preview,
                { color: chat.typing ? colors.accent : unread ? colors.text : colors.textMuted },
              ]}>
              {chat.typing
                ? chat.isGroup
                  ? typingText(chat.typing)
                  : 'typing…'
                : showPreview
                  ? preview
                  : unread
                    ? 'New messages'
                    : ''}
            </Text>
            {unread && (
              <View
                style={[
                  styles.badge,
                  { backgroundColor: chat.muted ? colors.badgeMuted : colors.accent },
                  chat.unreadCount === 0 && styles.dot,
                  radius === 0 && { borderRadius: 0 },
                ]}>
                {chat.unreadCount > 0 && (
                  <Text style={[styles.badgeText, { color: colors.accentText }]}>{chat.unreadCount > 99 ? '99+' : chat.unreadCount}</Text>
                )}
              </View>
            )}
          </View>
        </View>
      </Pressable>
    </ReanimatedSwipeable>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 14 },
  body: { flex: 1, gap: 3 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { flex: 1, fontSize: 16 },
  time: { fontSize: 12, marginLeft: 4 },
  preview: { flex: 1, fontSize: 14, lineHeight: 19 },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: { minWidth: 12, width: 12, height: 12, borderRadius: 6, paddingHorizontal: 0 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  swipeAction: { width: 96, justifyContent: 'center' },
  swipeLeft: { alignItems: 'flex-start', paddingLeft: 32 },
  swipeRight: { alignItems: 'flex-end', paddingRight: 32 },
});
