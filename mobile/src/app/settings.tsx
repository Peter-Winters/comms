import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { Text } from '@/components/themed';
import { Avatar } from '@/components/avatar';
import type { Prefs } from '@/lib/storage';
import { useApp, useBackend, useSnapshot, useTheme } from '@/lib/store';
import { makeTheme, THEME_STYLES, type ThemeStyle } from '@/theme/themes';

const MODES: { key: Prefs['theme']; label: string }[] = [
  { key: 'system', label: 'Auto' },
  { key: 'light', label: 'Day' },
  { key: 'dark', label: 'Night' },
];

/** A thumbnail of a theme drawn in its own colours, shapes and font. */
function ThemePreview({ style, dark, selected, onPress }: { style: ThemeStyle; dark: boolean; selected: boolean; onPress: () => void }) {
  const current = useTheme();
  const t = makeTheme(style, dark);
  const c = t.colors;
  const info = THEME_STYLES.find((x) => x.key === style)!;
  const font = t.font ? { fontFamily: t.font.family, fontSize: 13 * t.font.scale, fontWeight: 'normal' as const } : { fontSize: 13, fontWeight: '600' as const };
  const bar = (mine: boolean, width: number) => (
    <View
      style={{
        alignSelf: mine ? 'flex-end' : 'flex-start',
        width,
        height: 12,
        borderRadius: 6 * t.radius,
        backgroundColor: mine ? c.bubbleMine : t.theirBubble === 'plain' ? c.surfaceAlt : c.bubbleTheirs,
        borderWidth: !mine && t.theirBubble === 'outline' ? 1.5 : 0,
        borderColor: c.border,
      }}
    />
  );
  return (
    <Pressable onPress={onPress} style={styles.previewWrap}>
      <View
        style={[
          styles.preview,
          {
            backgroundColor: c.bg,
            borderRadius: 12 * Math.max(current.radius, 0.3),
            borderColor: selected ? current.colors.accent : current.colors.border,
            borderWidth: selected ? 2.5 : 1,
          },
        ]}>
        <View style={styles.previewHeader}>
          <View
            style={{
              width: 14,
              height: 14,
              borderRadius: t.radius === 0 ? 1 : 7,
              backgroundColor: t.colorful ? '#F79009' : c.surfaceAlt,
            }}
          />
          <Text style={[font, { color: c.text }]}>Aa</Text>
        </View>
        {bar(false, 44)}
        {bar(true, 36)}
        {bar(false, 30)}
      </View>
      <Text style={{ color: current.colors.text, fontWeight: '600', marginTop: 6 }}>{info.label}</Text>
      <Text style={{ color: current.colors.textMuted, fontSize: 11, textAlign: 'center' }} numberOfLines={2}>
        {info.description}
      </Text>
    </Pressable>
  );
}

export default function Settings() {
  const theme = useTheme();
  const { colors } = theme;
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
      <View style={[styles.card, { borderRadius: 14 * theme.radius }, styles.profile, { backgroundColor: colors.surface }]}>
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
        style={[styles.card, { borderRadius: 14 * theme.radius }, styles.item, { backgroundColor: colors.surface }]}>
        <Ionicons name="apps-outline" size={22} color={colors.text} />
        <Text style={[styles.itemLabel, { color: colors.text }]}>Chat networks</Text>
        <Text style={{ color: colors.textMuted }}>{connectedCount} connected</Text>
        <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
      </Pressable>

      <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>Notifications</Text>
      <Pressable
        onPress={() => (push.status === 'denied' ? Linking.openSettings() : retryPush())}
        style={[styles.card, { borderRadius: 14 * theme.radius }, styles.item, { backgroundColor: colors.surface }]}>
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
      <View style={[styles.card, { borderRadius: 14 * theme.radius }, { backgroundColor: colors.surface }]}>
        <View style={styles.item}>
          <Ionicons name="color-palette-outline" size={22} color={colors.text} />
          <Text style={[styles.itemLabel, { color: colors.text }]}>Theme</Text>
        </View>
        <View style={styles.previews}>
          {THEME_STYLES.map((t) => (
            <ThemePreview
              key={t.key}
              style={t.key}
              dark={theme.dark}
              selected={prefs.themeStyle === t.key}
              onPress={() => setPrefs({ themeStyle: t.key })}
            />
          ))}
        </View>
        <View style={[styles.item, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
          <Ionicons name="contrast-outline" size={22} color={colors.text} />
          <Text style={[styles.itemLabel, { color: colors.text }]}>Day or night</Text>
        </View>
        <View style={[styles.segment, { borderRadius: 10 * theme.radius }, { backgroundColor: colors.surfaceAlt }]}>
          {MODES.map((t) => {
            const active = prefs.theme === t.key;
            return (
              <Pressable
                key={t.key}
                onPress={() => setPrefs({ theme: t.key })}
                style={[styles.segmentItem, { borderRadius: 8 * theme.radius }, active && { backgroundColor: colors.bg }]}>
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

      <Pressable onPress={confirmSignOut} style={[styles.card, { borderRadius: 14 * theme.radius }, styles.item, { backgroundColor: colors.surface }]}>
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
  card: { overflow: 'hidden' },
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
  previews: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingBottom: 14 },
  previewWrap: { flex: 1, alignItems: 'center' },
  preview: { alignSelf: 'stretch', height: 104, padding: 10, gap: 7, overflow: 'hidden' },
  previewHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  segment: { flexDirection: 'row', marginHorizontal: 16, marginBottom: 14, padding: 3 },
  segmentItem: { flex: 1, alignItems: 'center', paddingVertical: 8 },
  footer: { textAlign: 'center', fontSize: 12, marginTop: 24 },
});
