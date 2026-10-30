import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Text, TextInput } from '@/components/themed';
import { Avatar } from '@/components/avatar';
import { NetworkIcon } from '@/components/network-icon';
import type { Contact } from '@/lib/bridges';
import { NETWORKS } from '@/lib/networks';
import { useBackend, useColors, useSnapshot } from '@/lib/store';
import type { NetworkId } from '@/lib/types';

const PLACEHOLDERS: Partial<Record<NetworkId, string>> = {
  whatsapp: 'Name or phone number (+44…)',
  signal: 'Name or phone number (+44…)',
  gmessages: 'Name or phone number',
  gvoice: 'Name or phone number',
  telegram: 'Name, @username or phone number',
};

export default function NewChat() {
  const backend = useBackend();
  const colors = useColors();
  const { accounts } = useSnapshot();
  const [networks, setNetworks] = useState<NetworkId[] | null>(null);
  const [network, setNetwork] = useState<NetworkId | null>(null);
  const [contacts, setContacts] = useState<{ network: NetworkId; list: Contact[] } | null>(null);
  const [query, setQuery] = useState('');
  const [starting, setStarting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const candidateKey = accounts
    .filter((a) => a.available && backend.bridges.supports(a.network))
    .map((a) => a.network)
    .join(',');

  // Only networks with an active login can start chats.
  useEffect(() => {
    let cancelled = false;
    const candidates = candidateKey.split(',').filter(Boolean) as NetworkId[];
    Promise.all(
      candidates.map(async (n) => ((await backend.bridges.status(n).catch(() => null))?.logins.length ? n : null)),
    ).then((found) => {
      if (cancelled) return;
      const list = found.filter((n): n is NetworkId => !!n);
      setNetworks(list);
      setNetwork((current) => current ?? list[0] ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [backend, candidateKey]);

  useEffect(() => {
    if (!network) return;
    let cancelled = false;
    backend.bridges
      .contacts(network)
      .catch(() => [] as Contact[])
      .then((list) => {
        if (!cancelled) setContacts({ network, list });
      });
    return () => {
      cancelled = true;
    };
  }, [backend, network]);

  const loadingContacts = !!network && contacts?.network !== network;
  const q = query.trim();
  const visible = useMemo(() => {
    const list = contacts?.network === network ? contacts.list : [];
    if (!q) return list;
    const needle = q.toLowerCase();
    return list.filter(
      (c) => c.name?.toLowerCase().includes(needle) || c.identifiers?.some((i) => i.toLowerCase().includes(needle)),
    );
  }, [contacts, network, q]);

  async function start(identifier: string, existingRoom?: string) {
    if (!network) return;
    if (existingRoom) {
      router.replace({ pathname: '/chat/[id]', params: { id: existingRoom } });
      return;
    }
    setStarting(identifier);
    setError(null);
    try {
      const id = await backend.bridges.startChat(network, identifier);
      router.replace({ pathname: '/chat/[id]', params: { id } });
    } catch (e: any) {
      setError(e?.message ?? 'Could not start the chat');
      setStarting(null);
    }
  }

  if (networks === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.textMuted} />
      </View>
    );
  }

  if (networks.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={[styles.empty, { color: colors.textMuted }]}>
          Connect an account first, then you can start chats on it from here.
        </Text>
        <Pressable
          onPress={() => router.replace('/accounts')}
          style={[styles.cta, { backgroundColor: colors.accent }]}>
          <Text style={{ color: colors.accentText, fontWeight: '600' }}>Connect an account</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipBar} contentContainerStyle={styles.chips}>
        {networks.map((n) => {
          const active = n === network;
          return (
            <Pressable
              key={n}
              onPress={() => setNetwork(n)}
              style={[styles.chip, { backgroundColor: active ? colors.text : colors.surface }]}>
              <NetworkIcon network={n} size={18} />
              <Text style={{ color: active ? colors.bg : colors.text, fontWeight: '600' }}>{NETWORKS[n].name}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={[styles.search, { backgroundColor: colors.surface }]}>
        <Ionicons name="search" size={18} color={colors.textFaint} />
        <TextInput
          autoFocus
          value={query}
          onChangeText={setQuery}
          placeholder={(network && PLACEHOLDERS[network]) ?? 'Name or username'}
          placeholderTextColor={colors.textFaint}
          style={[styles.input, { color: colors.text }]}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="go"
          onSubmitEditing={() => q && start(q)}
        />
      </View>
      {error && <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>}

      <FlatList
        data={visible}
        keyExtractor={(c) => c.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListHeaderComponent={
          q ? (
            <Pressable
              onPress={() => start(q)}
              style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surface }]}>
              <View style={[styles.newIcon, { backgroundColor: colors.accent }]}>
                <Ionicons name="chatbubble-outline" size={20} color={colors.accentText} />
              </View>
              <Text style={[styles.flex, { color: colors.text, fontSize: 16 }]} numberOfLines={1}>
                Start chat with <Text style={{ fontWeight: '700' }}>{q}</Text>
              </Text>
              {starting === q && <ActivityIndicator color={colors.textMuted} />}
            </Pressable>
          ) : null
        }
        ListEmptyComponent={
          loadingContacts ? (
            <ActivityIndicator style={{ margin: 24 }} color={colors.textMuted} />
          ) : !q ? (
            <Text style={[styles.empty, { color: colors.textMuted }]}>
              Type a name, phone number or username to start a chat.
            </Text>
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => start(item.id, item.roomId)}
            style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surface }]}>
            <Avatar title={item.name ?? item.id} image={item.avatar} size={42} />
            <View style={styles.flex}>
              <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }} numberOfLines={1}>
                {item.name ?? item.id}
              </Text>
              {!!item.identifiers?.length && (
                <Text style={{ color: colors.textMuted, fontSize: 13 }} numberOfLines={1}>
                  {item.identifiers.map((i) => i.replace(/^[a-z]+:/, '')).join(' · ')}
                </Text>
              )}
            </View>
            {starting === item.id && <ActivityIndicator color={colors.textMuted} />}
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 },
  empty: { textAlign: 'center', fontSize: 15, lineHeight: 21, padding: 24 },
  cta: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 14 },
  chipBar: { flexGrow: 0, flexShrink: 0 },
  chips: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 18 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  input: { flex: 1, fontSize: 16, paddingVertical: 11 },
  error: { marginHorizontal: 16, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  newIcon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
});
