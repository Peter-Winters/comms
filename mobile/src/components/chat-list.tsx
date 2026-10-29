import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useCallback, useState, type ReactElement } from 'react';
import { FlatList, Platform, StyleSheet, Text, View } from 'react-native';

import { NETWORKS } from '@/lib/networks';
import { useApp, useBackend, useColors } from '@/lib/store';
import { isArchived, isUnread, type Chat } from '@/lib/types';
import { ActionSheet, type SheetAction } from './action-sheet';
import { Avatar } from './avatar';
import { ChatRow } from './chat-row';

export function openChat(id: string) {
  router.push({ pathname: '/chat/[id]', params: { id } });
}

type Props = {
  chats: Chat[];
  header?: ReactElement;
  footer?: ReactElement;
  emptyText: string;
  /** Extra space at the end of the list, e.g. to clear a floating button. */
  bottomPadding?: number;
};

export function ChatList({ chats, header, footer, emptyText, bottomPadding = 0 }: Props) {
  const backend = useBackend();
  const { prefs } = useApp();
  const colors = useColors();
  const [selected, setSelected] = useState<Chat | null>(null);

  const onPress = useCallback((chat: Chat) => openChat(chat.id), []);
  const onLongPress = useCallback((chat: Chat) => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelected(chat);
  }, []);
  const onToggleRead = useCallback(
    (chat: Chat) =>
      isUnread(chat) ? backend.markRead(chat.id) : backend.setFlags(chat.id, { markedUnread: true }),
    [backend],
  );
  const onToggleArchive = useCallback(
    (chat: Chat) => backend.setFlags(chat.id, { archived: !isArchived(chat) }),
    [backend],
  );

  const actions: SheetAction[] = selected
    ? [
        {
          label: selected.pinned ? 'Unpin' : 'Pin',
          icon: selected.pinned ? 'pin-outline' : 'pin',
          onPress: () => backend.setFlags(selected.id, { pinned: !selected.pinned }),
        },
        {
          label: isUnread(selected) ? 'Mark as read' : 'Mark as unread',
          icon: isUnread(selected) ? 'mail-open-outline' : 'mail-unread-outline',
          onPress: () => onToggleRead(selected),
        },
        {
          label: selected.muted ? 'Unmute' : 'Mute',
          icon: selected.muted ? 'notifications-outline' : 'notifications-off-outline',
          onPress: () => backend.setFlags(selected.id, { muted: !selected.muted }),
        },
        {
          label: selected.lowPriority ? 'Move to inbox' : 'Move to low priority',
          icon: selected.lowPriority ? 'file-tray-outline' : 'arrow-down-circle-outline',
          onPress: () => backend.setFlags(selected.id, { lowPriority: !selected.lowPriority }),
        },
        {
          label: isArchived(selected) ? 'Unarchive' : 'Archive',
          icon: isArchived(selected) ? 'arrow-undo-outline' : 'archive-outline',
          onPress: () => onToggleArchive(selected),
        },
      ]
    : [];

  return (
    <>
      <FlatList
        data={chats}
        keyExtractor={(c) => c.id}
        renderItem={({ item }) => (
          <ChatRow
            chat={item}
            showPreview={prefs.showPreviews}
            onPress={onPress}
            onLongPress={onLongPress}
            onToggleRead={onToggleRead}
            onToggleArchive={onToggleArchive}
          />
        )}
        ListHeaderComponent={header}
        ListFooterComponent={footer}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>{emptyText}</Text>
          </View>
        }
        contentContainerStyle={{ paddingBottom: bottomPadding }}
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="on-drag"
      />
      <ActionSheet
        visible={!!selected}
        onClose={() => setSelected(null)}
        actions={actions}
        header={
          selected && (
            <View style={styles.sheetHeader}>
              <Avatar title={selected.title} image={selected.avatar} network={selected.network} size={40} />
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={[styles.sheetTitle, { color: colors.text }]}>
                  {selected.title}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 13 }}>{NETWORKS[selected.network].name}</Text>
              </View>
            </View>
          )
        }
      />
    </>
  );
}

const styles = StyleSheet.create({
  empty: { padding: 48, alignItems: 'center' },
  emptyText: { fontSize: 15, textAlign: 'center' },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 24, paddingBottom: 12 },
  sheetTitle: { fontSize: 16, fontWeight: '600' },
});
