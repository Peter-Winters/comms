import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { Text } from '@/components/themed';
import { openChat } from '@/components/chat-list';
import { NetworkIcon } from '@/components/network-icon';
import type { BridgeLogin } from '@/lib/bridges';
import { NETWORKS } from '@/lib/networks';
import { useBackend, useColors, useSnapshot } from '@/lib/store';
import type { Account, NetworkId } from '@/lib/types';

type Logins = Partial<Record<NetworkId, BridgeLogin[] | 'error'>>;

function confirm(title: string, message: string, action: string, onConfirm: () => void) {
  if (Platform.OS === 'web') {
    if (globalThis.confirm?.(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: action, style: 'destructive', onPress: onConfirm },
  ]);
}

export default function Accounts() {
  const backend = useBackend();
  const colors = useColors();
  const { accounts } = useSnapshot();
  const [logins, setLogins] = useState<Logins>({});
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<NetworkId | null>(null);

  const native = (n: NetworkId) => backend.bridges.supports(n);

  // `accounts` changes on every sync; key the refresh on which networks exist instead.
  const availableKey = accounts
    .filter((a) => a.available)
    .map((a) => a.network)
    .join(',');

  const refresh = useCallback(async () => {
    const targets = (availableKey.split(',').filter(Boolean) as NetworkId[]).filter((n) =>
      backend.bridges.supports(n),
    );
    const results = await Promise.all(
      targets.map(async (n) => {
        try {
          return [n, (await backend.bridges.status(n)).logins] as const;
        } catch {
          return [n, 'error'] as const;
        }
      }),
    );
    setLogins(Object.fromEntries(results));
  }, [backend, availableKey]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const isConnected = (a: Account) => {
    const l = logins[a.network];
    return native(a.network) && Array.isArray(l) ? l.length > 0 : a.connected;
  };

  const connected = accounts.filter((a) => a.available && isConnected(a));
  const available = accounts.filter((a) => a.available && !isConnected(a));
  const unavailable = accounts.filter((a) => !a.available);

  async function connectViaChat(network: NetworkId) {
    setBusy(network);
    try {
      const chatId = await backend.connectNetwork(network);
      if (chatId) openChat(chatId);
    } catch (e: any) {
      Alert.alert('Could not connect', e?.message ?? 'Something went wrong');
    } finally {
      setBusy(null);
    }
  }

  const connect = (network: NetworkId) =>
    native(network)
      ? router.push({ pathname: '/connect/[network]', params: { network } })
      : connectViaChat(network);

  const logout = (network: NetworkId, login: BridgeLogin) =>
    confirm(
      `Log out of ${NETWORKS[network].name}?`,
      `${login.name} will be disconnected. Its chats stay in Comms but stop updating.`,
      'Log out',
      async () => {
        setBusy(network);
        try {
          await backend.bridges.logout(network, login.id);
        } catch (e: any) {
          Alert.alert('Could not log out', e?.message ?? 'Something went wrong');
        }
        await refresh();
        setBusy(null);
      },
    );

  const stateBadge = (login: BridgeLogin) => {
    const ok = !login.state || login.state === 'CONNECTED';
    const label = ok ? 'Connected' : login.state === 'BAD_CREDENTIALS' ? 'Needs login' : login.state!.replace(/_/g, ' ').toLowerCase();
    return (
      <Text style={{ color: ok ? colors.success : colors.warning, fontSize: 13 }} numberOfLines={1}>
        {label}
        {!ok && login.stateMessage ? ` · ${login.stateMessage}` : ''}
      </Text>
    );
  };

  const row = (a: Account) => {
    const info = NETWORKS[a.network];
    const l = logins[a.network];
    const nativeLogins = native(a.network) && Array.isArray(l) ? l : null;
    return (
      <View key={a.network} style={[styles.row, { borderBottomColor: colors.border }]}>
        <NetworkIcon network={a.network} size={40} />
        <View style={styles.flex}>
          <Text style={[styles.name, { color: a.available ? colors.text : colors.textFaint }]}>{info.name}</Text>
          {nativeLogins && nativeLogins.length > 0 ? (
            nativeLogins.map((login) => (
              <View key={login.id} style={styles.login}>
                <View style={styles.flex}>
                  <Text style={{ color: colors.textMuted, fontSize: 13 }} numberOfLines={1}>
                    {login.name}
                  </Text>
                  {stateBadge(login)}
                </View>
                {login.state === 'BAD_CREDENTIALS' && (
                  <Pressable hitSlop={8} onPress={() => connect(a.network)}>
                    <Text style={{ color: colors.accent, fontWeight: '600' }}>Reconnect</Text>
                  </Pressable>
                )}
                <Pressable hitSlop={8} onPress={() => logout(a.network, login)}>
                  <Text style={{ color: colors.danger, fontWeight: '600' }}>Log out</Text>
                </Pressable>
              </View>
            ))
          ) : (
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>
              {!a.available
                ? 'Bridge not installed on your server'
                : a.connected
                  ? (a.label ?? 'Connected')
                  : native(a.network) || backend.kind === 'demo'
                    ? 'Not connected'
                    : (a.label ?? 'Not connected')}
            </Text>
          )}
        </View>
        {busy === a.network ? (
          <ActivityIndicator color={colors.textMuted} />
        ) : a.available && !isConnected(a) ? (
          <Pressable onPress={() => connect(a.network)} style={[styles.button, { backgroundColor: colors.accent }]}>
            <Text style={{ color: colors.accentText, fontWeight: '600' }}>Connect</Text>
          </Pressable>
        ) : a.available && nativeLogins && native(a.network) ? (
          <Pressable hitSlop={8} onPress={() => connect(a.network)}>
            <Ionicons name="add-circle-outline" size={24} color={colors.textMuted} />
          </Pressable>
        ) : null}
        {a.controlChatId && (
          <Pressable hitSlop={8} onPress={() => openChat(a.controlChatId!)}>
            <Ionicons name="chatbubble-ellipses-outline" size={22} color={colors.textMuted} />
          </Pressable>
        )}
      </View>
    );
  };

  const section = (title: string, items: Account[], note?: string) =>
    items.length > 0 && (
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>{title}</Text>
        {note && <Text style={[styles.note, { color: colors.textFaint }]}>{note}</Text>}
        {items.map(row)}
      </View>
    );

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ paddingBottom: 48 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await refresh();
            setRefreshing(false);
          }}
        />
      }>
      {section('Connected', connected)}
      {section('Add an account', available)}
      {section('Unavailable', unavailable, 'Enable these bridges in server/.env and re-run setup to use them.')}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  section: { marginTop: 24 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    marginBottom: 6,
  },
  note: { fontSize: 13, paddingHorizontal: 16, marginBottom: 6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  login: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 4 },
  name: { fontSize: 16, fontWeight: '600' },
  button: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 16 },
});
