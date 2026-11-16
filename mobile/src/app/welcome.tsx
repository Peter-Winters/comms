import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/themed';
import { NetworkIcon } from '@/components/network-icon';
import { CONNECTABLE_NETWORKS } from '@/lib/networks';
import { useApp, useColors } from '@/lib/store';

export default function Welcome() {
  const colors = useColors();
  const { signInDemo } = useApp();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={styles.hero}>
        <View style={styles.cluster}>
          {CONNECTABLE_NETWORKS.slice(0, 8).map((n) => (
            <NetworkIcon key={n} network={n} size={44} />
          ))}
        </View>
        <Text style={[styles.title, { color: colors.text }]}>Comms</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>
          Every chat app, one inbox.{'\n'}WhatsApp, Signal, Telegram, Instagram, Messenger, SMS, Discord, Slack and more.
        </Text>
      </View>

      <View style={styles.actions}>
        <Pressable
          onPress={() => router.push('/signin')}
          style={({ pressed }) => [styles.primary, { backgroundColor: colors.accent, opacity: pressed ? 0.85 : 1 }]}>
          <Text style={[styles.primaryText, { color: colors.accentText }]}>Connect your server</Text>
        </Pressable>
        <Pressable
          onPress={signInDemo}
          style={({ pressed }) => [styles.secondary, { backgroundColor: colors.surface, opacity: pressed ? 0.85 : 1 }]}>
          <Text style={[styles.secondaryText, { color: colors.text }]}>Try the demo</Text>
        </Pressable>
        <Text style={[styles.footnote, { color: colors.textFaint }]}>
          Comms connects to a Matrix homeserver running chat bridges. See server/README.md to set one up.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'space-between', padding: 24 },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  cluster: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
    maxWidth: 260,
    marginBottom: 24,
  },
  title: { fontSize: 40, fontWeight: '800', letterSpacing: -1 },
  subtitle: { fontSize: 16, lineHeight: 23, textAlign: 'center', maxWidth: 320 },
  actions: { gap: 12 },
  primary: { borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  primaryText: { fontSize: 17, fontWeight: '600' },
  secondary: { borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  secondaryText: { fontSize: 17, fontWeight: '600' },
  footnote: { fontSize: 12, textAlign: 'center', marginTop: 8, lineHeight: 17 },
});
