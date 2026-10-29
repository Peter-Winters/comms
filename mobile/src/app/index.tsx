import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChatList } from '@/components/chat-list';
import { NetworkIcon } from '@/components/network-icon';
import { NETWORKS } from '@/lib/networks';
import { useColors, useSnapshot } from '@/lib/store';
import { isArchived, isUnread, sortChats, type NetworkId } from '@/lib/types';

type Filter = 'all' | 'unread' | NetworkId;

export default function Inbox() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { chats, status, statusDetail } = useSnapshot();
  const [filter, setFilter] = useState<Filter>('all');

  const { inbox, lowPriority, archived, networks } = useMemo(() => {
    const real = chats.filter((c) => !c.isBridgeControl);
    const active = real.filter((c) => !isArchived(c));
    const inbox = active.filter((c) => !c.lowPriority);
    return {
      inbox,
      lowPriority: active.filter((c) => c.lowPriority),
      archived: real.filter(isArchived),
      networks: [...new Set(inbox.map((c) => c.network))].sort(
        (a, b) => NETWORKS[a].name.localeCompare(NETWORKS[b].name),
      ),
    };
  }, [chats]);

  const visible = useMemo(() => {
    const filtered = inbox.filter((c) =>
      filter === 'all' ? true : filter === 'unread' ? isUnread(c) : c.network === filter,
    );
    return sortChats(filtered);
  }, [inbox, filter]);

  const unreadTotal = inbox.filter((c) => isUnread(c) && !c.muted).length;
  const lowUnread = lowPriority.filter(isUnread).length;

  const chip = (key: Filter, label: string, network?: NetworkId) => {
    const active = filter === key;
    return (
      <Pressable
        key={key}
        onPress={() => setFilter(active && key !== 'all' ? 'all' : key)}
        style={[
          styles.chip,
          { backgroundColor: active ? colors.text : colors.surface },
        ]}>
        {network && <NetworkIcon network={network} size={18} />}
        <Text style={[styles.chipText, { color: active ? colors.bg : colors.text }]}>{label}</Text>
      </Pressable>
    );
  };

  const header = (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {chip('all', 'All')}
        {chip('unread', unreadTotal > 0 ? `Unread · ${unreadTotal}` : 'Unread')}
        {networks.map((n) => chip(n, NETWORKS[n].name, n))}
      </ScrollView>
      {status !== 'ready' && !(status === 'syncing' && chats.length > 0) && (
        <View style={[styles.banner, { backgroundColor: colors.surface }]}>
          <Ionicons
            name={status === 'error' || status === 'offline' ? 'cloud-offline-outline' : 'sync-outline'}
            size={16}
            color={status === 'error' ? colors.danger : colors.textMuted}
          />
          <Text style={[styles.bannerText, { color: colors.textMuted }]}>
            {status === 'starting' || status === 'syncing'
              ? 'Syncing your chats…'
              : status === 'offline'
                ? `Reconnecting… ${statusDetail ?? ''}`
                : (statusDetail ?? 'Something went wrong')}
          </Text>
        </View>
      )}
    </View>
  );

  const folderRow = (name: 'low-priority' | 'archive', label: string, count: number, icon: 'arrow-down-circle-outline' | 'archive-outline', badge?: number) => (
    <Pressable
      onPress={() => router.push(`/folder/${name}`)}
      style={({ pressed }) => [styles.folder, pressed && { backgroundColor: colors.surface }]}>
      <View style={[styles.folderIcon, { backgroundColor: colors.surface }]}>
        <Ionicons name={icon} size={22} color={colors.textMuted} />
      </View>
      <Text style={[styles.folderLabel, { color: colors.text }]}>{label}</Text>
      {badge ? (
        <View style={[styles.folderBadge, { backgroundColor: colors.badgeMuted }]}>
          <Text style={styles.folderBadgeText}>{badge}</Text>
        </View>
      ) : (
        <Text style={{ color: colors.textFaint }}>{count}</Text>
      )}
      <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
    </Pressable>
  );

  const footer =
    filter === 'all' ? (
      <View style={{ paddingBottom: insets.bottom + 24, paddingTop: 8 }}>
        {lowPriority.length > 0 &&
          folderRow('low-priority', 'Low priority', lowPriority.length, 'arrow-down-circle-outline', lowUnread)}
        {archived.length > 0 && folderRow('archive', 'Archived', archived.length, 'archive-outline')}
      </View>
    ) : (
      <View style={{ height: insets.bottom + 24 }} />
    );

  return (
    <View style={[styles.container, { backgroundColor: colors.bg, paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <Text style={[styles.heading, { color: colors.text }]}>Inbox</Text>
        <Pressable hitSlop={8} onPress={() => router.push('/accounts')} style={styles.iconButton}>
          <Ionicons name="apps-outline" size={23} color={colors.text} />
        </Pressable>
        <Pressable hitSlop={8} onPress={() => router.push('/settings')} style={styles.iconButton}>
          <Ionicons name="settings-outline" size={23} color={colors.text} />
        </Pressable>
      </View>
      <Pressable
        onPress={() => router.push('/search')}
        style={[styles.search, { backgroundColor: colors.surface }]}>
        <Ionicons name="search" size={18} color={colors.textFaint} />
        <Text style={{ color: colors.textFaint, fontSize: 16 }}>Search chats and messages</Text>
      </Pressable>
      <ChatList
        chats={visible}
        header={header}
        footer={footer}
        bottomPadding={88}
        emptyText={
          filter === 'unread'
            ? "You're all caught up ✨"
            : status === 'ready'
              ? 'No chats yet. Connect an account to get started.'
              : 'Loading chats…'
        }
      />
      <Pressable
        accessibilityLabel="New chat"
        onPress={() => router.push('/new-chat')}
        style={({ pressed }) => [
          styles.fab,
          { backgroundColor: colors.accent, bottom: insets.bottom + 20, opacity: pressed ? 0.85 : 1 },
        ]}>
        <Ionicons name="create-outline" size={26} color={colors.accentText} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, gap: 8 },
  heading: { flex: 1, fontSize: 32, fontWeight: '800', letterSpacing: -0.5 },
  iconButton: { padding: 6 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
  },
  chips: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 18,
  },
  chipText: { fontSize: 14, fontWeight: '600' },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 10,
    borderRadius: 10,
  },
  bannerText: { flex: 1, fontSize: 13 },
  fab: {
    position: 'absolute',
    right: 20,
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  folder: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 10 },
  folderIcon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  folderLabel: { flex: 1, fontSize: 16, fontWeight: '600' },
  folderBadge: { minWidth: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  folderBadgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
});
