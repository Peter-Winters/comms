import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import type { Prefs } from '@/lib/storage';
import { useApp, useBackend, useColors, useSnapshot } from '@/lib/store';

const THEMES: { key: Prefs['theme']; label: string }[] = [
  { key: 'system', label: 'System' },
  { key: 'light', label: 'Light' },
  { key: 'dark', label: 'Dark' },
];

export default function Settings() {
  const colors = useColors();
  const backend = useBackend();
  const { prefs, setPrefs, signOut, push, retryPush } = useApp();
  const pushLabel =
    push.status === 'enabled'
      ? 'On'
      : push.status === 'denied'
        ? 'Blocked in system settings'
        : push.status === 'error'
          ? 'Not working, tap to retry'
          : push.reason;
  const { displayName, userId, accounts, status } = useSnapshot();
  const connectedCount = accounts.filter((a) => a.connected).length;

  const confirmSignOut = () => {
    const message =
      backend.kind === 'demo' ? 'Leave the demo?' : 'Sign out of this device? Your bridges keep running on the server.';
    if (Platform.OS === 'web') {
      if (globalThis.confirm?.(message)) signOut();
      return;
    }
    Alert.alert('Sign out', message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => signOut() },
    ]);
  };

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.container}>
      <View style={[styles.card, styles.profile, { backgroundColor: colors.surface }]}>
        <Avatar title={displayName || '?'} size={56} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.name, { color: colors.text }]}>{displayName}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 13 }} numberOfLines={1}>
            {backend.kind === 'demo' ? 'Demo mode — nothing leaves this device' : userId}
          </Text>
          <Text style={{ color: colors.textFaint, fontSize: 12, marginTop: 2 }}>
            {status === 'ready' ? 'Connected' : status}
          </Text>
        </View>
      </View>

      <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>Accounts</Text>
      <Pressable
        onPress={() => router.push('/accounts')}
        style={[styles.card, styles.item, { backgroundColor: colors.surface }]}>
        <Ionicons name="apps-outline" size={22} color={colors.text} />
        <Text style={[styles.itemLabel, { color: colors.text }]}>Chat networks</Text>
        <Text style={{ color: colors.textMuted }}>{connectedCount} connected</Text>
        <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
      </Pressable>

      <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>Notifications</Text>
      <Pressable
        onPress={() => (push.status === 'denied' ? Linking.openSettings() : retryPush())}
        style={[styles.card, styles.item, { backgroundColor: colors.surface }]}>
        <Ionicons name="notifications-outline" size={22} color={colors.text} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.itemLabel, { color: colors.text }]}>Push notifications</Text>
          <Text style={{ color: push.status === 'enabled' ? colors.success : colors.textMuted, fontSize: 13 }}>
            {pushLabel}
          </Text>
          {push.status === 'error' && (
            <Text style={{ color: colors.textFaint, fontSize: 12, marginTop: 2 }} numberOfLines={3}>
              {push.reason}
            </Text>
          )}
        </View>
      </Pressable>

      <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>Appearance</Text>
      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        <View style={styles.item}>
          <Ionicons name="contrast-outline" size={22} color={colors.text} />
          <Text style={[styles.itemLabel, { color: colors.text }]}>Theme</Text>
        </View>
        <View style={[styles.segment, { backgroundColor: colors.surfaceAlt }]}>
          {THEMES.map((t) => {
            const active = prefs.theme === t.key;
            return (
              <Pressable
                key={t.key}
                onPress={() => setPrefs({ theme: t.key })}
                style={[styles.segmentItem, active && { backgroundColor: colors.bg }]}>
                <Text style={{ color: active ? colors.text : colors.textMuted, fontWeight: '600' }}>{t.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <View style={[styles.item, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
          <Ionicons name="eye-outline" size={22} color={colors.text} />
          <Text style={[styles.itemLabel, { color: colors.text }]}>Message previews in inbox</Text>
          <Switch
            value={prefs.showPreviews}
            onValueChange={(v) => setPrefs({ showPreviews: v })}
            trackColor={{ true: colors.accent }}
          />
        </View>
      </View>

      <Pressable onPress={confirmSignOut} style={[styles.card, styles.item, { backgroundColor: colors.surface }]}>
        <Ionicons name="log-out-outline" size={22} color={colors.danger} />
        <Text style={[styles.itemLabel, { color: colors.danger }]}>
          {backend.kind === 'demo' ? 'Exit demo' : 'Sign out'}
        </Text>
      </Pressable>

      <Text style={[styles.footer, { color: colors.textFaint }]}>Comms 0.1 · Matrix + mautrix bridges</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 8, paddingBottom: 48 },
  card: { borderRadius: 14, overflow: 'hidden' },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 },
  name: { fontSize: 18, fontWeight: '700' },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 16,
    marginLeft: 4,
  },
  item: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 14 },
  itemLabel: { flex: 1, fontSize: 16 },
  segment: { flexDirection: 'row', marginHorizontal: 16, marginBottom: 14, borderRadius: 10, padding: 3 },
  segmentItem: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 8 },
  footer: { textAlign: 'center', fontSize: 12, marginTop: 24 },
});
