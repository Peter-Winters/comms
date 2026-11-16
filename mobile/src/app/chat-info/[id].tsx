import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { MediaViewer } from '@/components/media-viewer';
import { Text } from '@/components/themed';
import { NETWORKS } from '@/lib/networks';
import { useBackend, useChat, useMessages, useTheme } from '@/lib/store';
import { isArchived, type ChatFlags, type Member, type Message } from '@/lib/types';

const GRID = 3;

export default function ChatInfo() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const backend = useBackend();
  const chat = useChat(id);
  const messages = useMessages(id);
  const theme = useTheme();
  const { colors } = theme;
  const [members, setMembers] = useState<Member[] | null>(null);
  const [viewing, setViewing] = useState<Message | null>(null);
  const [gridWidth, setGridWidth] = useState(0);

  const isGroup = !!chat?.isGroup;
  useEffect(() => {
    if (!isGroup) return;
    let cancelled = false;
    backend
      .getMembers(id)
      .then((list) => !cancelled && setMembers(list))
      .catch(() => !cancelled && setMembers([]));
    return () => {
      cancelled = true;
    };
  }, [backend, id, isGroup]);

  if (!chat) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <ActivityIndicator color={colors.textMuted} />
      </View>
    );
  }

  const network = NETWORKS[chat.network];
  const archived = isArchived(chat);
  // Newest first; only what's been loaded in this chat so far.
  const media = messages
    .filter((m) => (m.kind === 'image' || m.kind === 'video') && (m.image || m.media?.thumbnail))
    .reverse()
    .slice(0, 30);
  const tile = gridWidth ? (gridWidth - (GRID - 1) * 3) / GRID : 0;
  const card = [styles.card, { backgroundColor: colors.surface, borderRadius: 14 * theme.radius }];

  const toggle = (label: string, icon: React.ComponentProps<typeof Ionicons>['name'], value: boolean, flag: keyof ChatFlags) => (
    <View style={styles.row}>
      <Ionicons name={icon} size={21} color={colors.text} />
      <Text style={[styles.rowLabel, { color: colors.text }]}>{label}</Text>
      <Switch
        value={value}
        onValueChange={(v) => backend.setFlags(id, { [flag]: v })}
        trackColor={{ true: colors.accent }}
      />
    </View>
  );

  return (
    <>
      <Stack.Screen options={{ title: '' }} />
      <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.container}>
        <View style={styles.profile}>
          <Avatar title={chat.title} image={chat.avatar} network={chat.network} size={88} isGroup={chat.isGroup} />
          <Text style={[styles.title, { color: colors.text }]}>{chat.title}</Text>
          <Text style={{ color: colors.textMuted }}>
            {network.name}
            {chat.isGroup && chat.memberCount ? ` · ${chat.memberCount} members` : ''}
          </Text>
        </View>

        <View style={card}>
          {toggle('Pin to top', 'pin-outline', chat.pinned, 'pinned')}
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          {toggle('Mute notifications', 'notifications-off-outline', chat.muted, 'muted')}
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          {toggle('Low priority', 'arrow-down-circle-outline', chat.lowPriority, 'lowPriority')}
        </View>

        {media.length > 0 && (
          <>
            <Text style={[styles.section, { color: colors.textMuted }]}>Photos & videos</Text>
            <View style={styles.grid} onLayout={(e) => setGridWidth(e.nativeEvent.layout.width)}>
              {tile > 0 &&
                media.map((m) => {
                  const thumb = m.image ?? m.media?.thumbnail;
                  return (
                    <Pressable key={m.id} onPress={() => setViewing(m)}>
                      <Image
                        source={thumb ? { uri: thumb.uri, headers: thumb.headers } : undefined}
                        style={{ width: tile, height: tile, borderRadius: 6 * theme.radius, backgroundColor: colors.surfaceAlt }}
                        contentFit="cover"
                      />
                      {m.kind === 'video' && (
                        <Ionicons name="play" size={18} color="#fff" style={styles.tilePlay} />
                      )}
                    </Pressable>
                  );
                })}
            </View>
          </>
        )}

        {chat.isGroup && (
          <>
            <Text style={[styles.section, { color: colors.textMuted }]}>
              {members ? `${members.length + 1} members` : 'Members'}
            </Text>
            <View style={card}>
              {!members ? (
                <ActivityIndicator style={{ margin: 16 }} color={colors.textMuted} />
              ) : (
                [{ userId: 'me', name: 'You' } as Member, ...members].map((m, i) => (
                  <View key={m.userId}>
                    {i > 0 && <View style={[styles.divider, { backgroundColor: colors.border }]} />}
                    <View style={styles.row}>
                      <Avatar title={m.name} image={m.avatar} size={34} />
                      <Text style={[styles.rowLabel, { color: colors.text }]} numberOfLines={1}>
                        {m.name}
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </View>
          </>
        )}

        <Pressable
          onPress={async () => {
            await backend.setFlags(id, { archived: !archived });
            if (!archived) router.dismissTo('/');
          }}
          style={[card, styles.row]}>
          <Ionicons name={archived ? 'arrow-undo-outline' : 'archive-outline'} size={21} color={colors.text} />
          <Text style={[styles.rowLabel, { color: colors.text }]}>{archived ? 'Unarchive chat' : 'Archive chat'}</Text>
        </Pressable>
      </ScrollView>
      <MediaViewer message={viewing} onClose={() => setViewing(null)} />
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { padding: 16, gap: 8, paddingBottom: 48 },
  profile: { alignItems: 'center', gap: 6, paddingVertical: 12 },
  title: { fontSize: 22, fontWeight: '700', textAlign: 'center', marginTop: 6 },
  card: { overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 12 },
  rowLabel: { flex: 1, fontSize: 16 },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 16 },
  section: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 16,
    marginLeft: 4,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 3 },
  tilePlay: { position: 'absolute', left: 6, bottom: 6 },
});
