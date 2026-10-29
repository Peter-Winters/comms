import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { matrixLogin } from '@/lib/backends/matrix';
import { useApp, useColors } from '@/lib/store';

export default function SignIn() {
  const colors = useColors();
  const { signInMatrix } = useApp();
  const [homeserver, setHomeserver] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = homeserver.trim() && username.trim() && password && !busy;

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      signInMatrix(await matrixLogin(homeserver, username, password));
    } catch (e: any) {
      setError(e?.message ?? 'Could not sign in');
      setBusy(false);
    }
  }

  const input = [styles.input, { backgroundColor: colors.surface, color: colors.text }];

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={[styles.intro, { color: colors.textMuted }]}>
          Sign in to the Matrix homeserver that runs your bridges. On your local network this is usually
          something like http://192.168.1.20:8008.
        </Text>

        <Field label="Homeserver URL" colors={colors}>
          <TextInput
            style={input}
            value={homeserver}
            onChangeText={setHomeserver}
            placeholder="http://192.168.1.20:8008"
            placeholderTextColor={colors.textFaint}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
        </Field>
        <Field label="Username" colors={colors}>
          <TextInput
            style={input}
            value={username}
            onChangeText={setUsername}
            placeholder="admin"
            placeholderTextColor={colors.textFaint}
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="username"
          />
        </Field>
        <Field label="Password" colors={colors}>
          <TextInput
            style={input}
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            placeholderTextColor={colors.textFaint}
            secureTextEntry
            textContentType="password"
            onSubmitEditing={submit}
          />
        </Field>

        {error && <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>}

        <Pressable
          onPress={submit}
          disabled={!canSubmit}
          style={[styles.button, { backgroundColor: colors.accent, opacity: canSubmit ? 1 : 0.5 }]}>
          {busy ? (
            <ActivityIndicator color={colors.accentText} />
          ) : (
            <Text style={[styles.buttonText, { color: colors.accentText }]}>Sign in</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({
  label,
  colors,
  children,
}: {
  label: string;
  colors: ReturnType<typeof useColors>;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 16 },
  intro: { fontSize: 14, lineHeight: 20 },
  field: { gap: 6 },
  label: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 16 },
  error: { fontSize: 14 },
  button: { borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  buttonText: { fontSize: 17, fontWeight: '600' },
});
