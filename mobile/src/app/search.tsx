import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text, TextInput } from '@/components/themed';
import { Avatar } from '@/components/avatar';
import { formatInboxTime } from '@/lib/format';
import { NETWORKS } from '@/lib/networks';
import { useBackend, useColors } from '@/lib/store';
import type { SearchResult } from '@/lib/types';

export default function Search() {
  const backend = useBackend();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<{ q: string; results: SearchResult[] }>({ q: '', results: [] });
  const q = query.trim();
  const busy = !!q && found.q !== q;
  // Keep showing the previous results while the next query is in flight.
  const results = q ? found.results : [];

  useEffect(() => {
    if (!q) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      const r = await backend.search(q).catch(() => []);
      if (!cancelled) setFound({ q, results: r });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [backend, q]);

  return (
    <View style={[styles.container, { backgroundColor: colors.bg, paddingTop: insets.top + 8 }]}>
      <View style={styles.bar}>
        <View style={[styles.field, { backgroundColor: colors.surface }]}>
          <Ionicons name="search" size={18} color={colors.textFaint} />
          <TextInput
            autoFocus
            value={query}
            onChangeText={setQuery}
            placeholder="Search chats and messages"
            placeholderTextColor={colors.textFaint}
            style={[styles.input, { color: colors.text }]}
            returnKeyType="search"
            autoCorrect={false}
          />
          {busy && <ActivityIndicator size="small" color={colors.textFaint} />}
        </View>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text style={{ color: colors.accent, fontSize: 16 }}>Cancel</Text>
        </Pressable>
      </View>

      <FlatList
        data={results}
        keyExtractor={(r, i) => (r.type === 'chat' ? `c-${r.chat.id}` : `m-${r.message.id}-${i}`)}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListEmptyComponent={
          q && !busy ? (
            <Text style={[styles.empty, { color: colors.textMuted }]}>No results for “{q}”</Text>
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.replace({ pathname: '/chat/[id]', params: { id: item.chat.id } })}
            style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surface }]}>
            <Avatar title={item.chat.title} image={item.chat.avatar} network={item.chat.network} size={44} />
            <View style={styles.flex}>
              <View style={styles.line}>
                <Text numberOfLines={1} style={[styles.title, { color: colors.text }]}>
                  {item.chat.title}
                </Text>
                {item.type === 'message' && (
                  <Text style={{ color: colors.textFaint, fontSize: 12 }}>{formatInboxTime(item.message.ts)}</Text>
                )}
              </View>
              <Text numberOfLines={2} style={{ color: colors.textMuted, fontSize: 14 }}>
                {item.type === 'chat'
                  ? NETWORKS[item.chat.network].name
                  : `${item.message.fromMe ? 'You' : item.message.senderName}: ${item.message.text}`}
              </Text>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 8 },
  field: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  input: { flex: 1, fontSize: 16, paddingVertical: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, fontSize: 16, fontWeight: '600' },
  empty: { textAlign: 'center', marginTop: 48, fontSize: 15 },
});
