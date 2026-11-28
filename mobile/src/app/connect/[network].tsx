import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Linking,
  Pressable,
  StyleSheet,
  View,
  type KeyboardTypeOptions,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import QRCode from 'react-native-qrcode-svg';

import { Text, TextInput } from '@/components/themed';
import { CookieLogin } from '@/components/cookie-login';
import { NetworkIcon } from '@/components/network-icon';
import { PhoneInput } from '@/components/phone-input';
import { ProvisioningError } from '@/lib/backends/matrix-bridges';
import type { InputField, LoginFlow, LoginStep } from '@/lib/bridges';
import { pairingHelp, phoneHelp } from '@/lib/connect-help';
import { NETWORKS } from '@/lib/networks';
import { useBackend, useColors } from '@/lib/store';
import type { NetworkId } from '@/lib/types';
import { webviewCookiesAvailable } from '../../../modules/webview-cookies';

type Phase =
  | { kind: 'loading' }
  | { kind: 'flows'; flows: LoginFlow[] }
  | { kind: 'step'; step: LoginStep }
  | { kind: 'working'; message: string }
  | { kind: 'done' }
  | { kind: 'error'; message: string };

/** The Meta bridge can also offer Instagram logins; Messenger shows only its own flows. */
function flowsFor(network: NetworkId, flows: LoginFlow[]) {
  if (network === 'messenger') return flows.filter((f) => !f.id.includes('instagram'));
  return flows;
}

const KEYBOARDS: Record<string, KeyboardTypeOptions> = {
  phone_number: 'phone-pad',
  email: 'email-address',
  '2fa_code': 'number-pad',
  url: 'url',
  domain: 'url',
};

export default function Connect() {
  const { network } = useLocalSearchParams<{ network: NetworkId }>();
  const info = NETWORKS[network];
  const backend = useBackend();
  const colors = useColors();
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [values, setValues] = useState<Record<string, string>>({});
  const [manualCookies, setManualCookies] = useState(false);

  const fail = useCallback(
    (e: unknown) => setPhase({ kind: 'error', message: (e as Error)?.message ?? 'Something went wrong' }),
    [],
  );

  const advance = useCallback(
    (step: LoginStep) => {
      setValues(Object.fromEntries((step.user_input?.fields ?? []).map((f) => [f.id, f.default_value ?? ''])));
      setManualCookies(false);
      if (step.type === 'complete') backend.beginImport(network);
      setPhase(step.type === 'complete' ? { kind: 'done' } : { kind: 'step', step });
    },
    [backend, network],
  );

  const start = useCallback(
    async (flowId: string) => {
      setPhase({ kind: 'working', message: 'Starting…' });
      try {
        advance(await backend.bridges.startLogin(network, flowId));
      } catch (e) {
        fail(e);
      }
    },
    [backend, network, advance, fail],
  );

  const [attempt, setAttempt] = useState(0);
  const retry = () => {
    setPhase({ kind: 'loading' });
    setAttempt((n) => n + 1);
  };

  useEffect(() => {
    let cancelled = false;
    backend.bridges.status(network).then((res) => {
      if (cancelled) return;
      const flows = flowsFor(network, res.flows);
      if (flows.length === 1) start(flows[0].id);
      else setPhase({ kind: 'flows', flows });
    }, fail);
    return () => {
      cancelled = true;
    };
  }, [backend, network, start, fail, attempt]);

  // "Display and wait" steps (QR codes, pairing codes) long-poll until the user acts on their phone.
  const step = phase.kind === 'step' ? phase.step : null;
  // While you're in WhatsApp typing a pairing code, Android cuts this app off from the network, so
  // the wait drops. The bridge keeps the login open, so wait until you're back and resume it.
  useEffect(() => {
    if (step?.type !== 'display_and_wait') return;
    let cancelled = false;
    const loginIds = async () => new Set((await backend.bridges.status(network)).logins.map((l) => l.id));
    (async () => {
      const before = await loginIds().catch(() => new Set<string>());
      // The login may have finished while the app was cut off; the bridge then has a new login.
      const linkedMeanwhile = async () => {
        const now = await loginIds().catch(() => new Set<string>());
        return [...now].some((id) => !before.has(id));
      };
      for (let drops = 0; !cancelled; drops++) {
        try {
          const next = await backend.bridges.submitStep(network, step);
          if (!cancelled) advance(next);
          return;
        } catch (e) {
          if (cancelled) return;
          if (drops > 0 && (await linkedMeanwhile())) return advance({ ...step, type: 'complete' });
          if (e instanceof ProvisioningError || drops >= 20) return fail(e);
          await untilForeground();
          await new Promise((r) => setTimeout(r, 1500));
          if (cancelled) return;
          if (await linkedMeanwhile()) return advance({ ...step, type: 'complete' });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [backend, network, step, advance, fail]);

  const submit = async (stepToSubmit: LoginStep, input: Record<string, string>) => {
    setPhase({ kind: 'working', message: 'Checking…' });
    try {
      advance(await backend.bridges.submitStep(network, stepToSubmit, input));
    } catch (e) {
      fail(e);
    }
  };

  const header = (
    <View style={styles.header}>
      <NetworkIcon network={network} size={56} />
      <Text style={[styles.title, { color: colors.text }]}>Connect {info.name}</Text>
    </View>
  );

  const button = (label: string, onPress: () => void, disabled = false) => (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, { backgroundColor: colors.accent, opacity: disabled ? 0.5 : 1 }]}>
      <Text style={[styles.buttonText, { color: colors.accentText }]}>{label}</Text>
    </Pressable>
  );

  const field = (f: InputField, onChange: (v: string) => void, value: string) => (
    <View key={f.id} style={styles.field}>
      <Text style={[styles.label, { color: colors.textMuted }]}>{f.name}</Text>
      {f.type === 'phone_number' && !!phoneHelp(network) && (
        <Text style={{ color: colors.textMuted, fontSize: 14, lineHeight: 20 }}>{phoneHelp(network)}</Text>
      )}
      {f.type === 'phone_number' && !f.options?.length ? (
        <PhoneInput onChange={onChange} />
      ) : f.options?.length ? (
        <View style={styles.options}>
          {f.options.map((o) => (
            <Pressable
              key={o}
              onPress={() => onChange(o)}
              style={[styles.option, { backgroundColor: value === o ? colors.accent : colors.surface }]}>
              <Text style={{ color: value === o ? colors.accentText : colors.text }}>{o}</Text>
            </Pressable>
          ))}
        </View>
      ) : (
        <TextInput
          value={value}
          onChangeText={onChange}
          secureTextEntry={f.type === 'password'}
          keyboardType={KEYBOARDS[f.type] ?? 'default'}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete={f.type === 'password' ? 'password' : f.type === 'phone_number' ? 'tel' : 'off'}
          placeholder={f.type === 'phone_number' ? '+44 7700 900123' : undefined}
          placeholderTextColor={colors.textFaint}
          style={[styles.input, { backgroundColor: colors.surface, color: colors.text }]}
        />
      )}
      {!!f.description && <Text style={[styles.help, { color: colors.textFaint }]}>{f.description}</Text>}
    </View>
  );

  let body: React.ReactNode = null;
  switch (phase.kind) {
    case 'loading':
    case 'working':
      body = (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.accent} />
          {phase.kind === 'working' && <Text style={{ color: colors.textMuted }}>{phase.message}</Text>}
        </View>
      );
      break;

    case 'error':
      body = (
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={44} color={colors.danger} />
          <Text style={[styles.message, { color: colors.text }]}>{phase.message}</Text>
          {button('Try again', retry)}
        </View>
      );
      break;

    case 'done':
      body = (
        <View style={styles.center}>
          <Ionicons name="checkmark-circle" size={64} color={colors.success} />
          <Text style={[styles.message, { color: colors.text }]}>
            {info.name} is connected. Your chats are being imported and will appear in your inbox together
            when they&apos;re ready.
          </Text>
          {button('Go to inbox', () => router.dismissTo('/'))}
        </View>
      );
      break;

    case 'flows':
      body = (
        <View style={{ gap: 10 }}>
          <Text style={[styles.instructions, { color: colors.textMuted }]}>How would you like to log in?</Text>
          {phase.flows.map((f) => (
            <Pressable
              key={f.id}
              onPress={() => start(f.id)}
              style={({ pressed }) => [styles.flow, { backgroundColor: pressed ? colors.surfaceAlt : colors.surface }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.flowName, { color: colors.text }]}>{f.name}</Text>
                {!!f.description && <Text style={{ color: colors.textMuted, fontSize: 13 }}>{f.description}</Text>}
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
            </Pressable>
          ))}
        </View>
      );
      break;

    case 'step': {
      const s = phase.step;
      const instructions = !!s.instructions && (
        <Text style={[styles.instructions, { color: colors.textMuted }]}>{s.instructions}</Text>
      );
      if (s.type === 'user_input') {
        const fields = s.user_input?.fields ?? [];
        body = (
          <View style={{ gap: 16 }}>
            {instructions}
            {fields.map((f) => field(f, (v) => setValues((p) => ({ ...p, [f.id]: v })), values[f.id] ?? ''))}
            {button('Continue', () => submit(s, values), fields.some((f) => !values[f.id]))}
          </View>
        );
      } else if (s.type === 'display_and_wait') {
        const d = s.display_and_wait!;
        const help = pairingHelp(network, d.type);
        body = (
          <View style={[styles.center, { gap: 20 }]}>
            {instructions}
            {d.type === 'qr' && d.data && (
              <View style={styles.qr}>
                <QRCode value={d.data} size={240} />
              </View>
            )}
            {d.type === 'code' && d.data && (
              <Pressable onPress={() => Clipboard.setStringAsync(d.data!)} style={{ alignItems: 'center', gap: 6 }}>
                <Text selectable style={[styles.code, { color: colors.text }]}>
                  {d.data}
                </Text>
                <Text style={{ color: colors.textFaint, fontSize: 12 }}>Tap to copy</Text>
              </Pressable>
            )}
            {d.type === 'emoji' && d.data && <Text style={{ fontSize: 64 }}>{d.data}</Text>}
            {help && (
              <View style={[styles.helpBox, { backgroundColor: colors.surface }]}>
                {help.steps.map((text, i) => (
                  <View key={i} style={styles.helpStep}>
                    <Text style={[styles.helpNumber, { color: colors.accentText, backgroundColor: colors.accent }]}>
                      {i + 1}
                    </Text>
                    <Text style={[styles.helpText, { color: colors.text }]}>{text}</Text>
                  </View>
                ))}
                {!!help.note && <Text style={[styles.help, { color: colors.textMuted }]}>{help.note}</Text>}
              </View>
            )}
            {help?.open &&
              button(help.open.label, async () => {
                if (d.type === 'code' && d.data) await Clipboard.setStringAsync(d.data);
                Linking.openURL(help.open!.url).catch(() => {});
              })}
            <View style={styles.waiting}>
              <ActivityIndicator color={colors.textMuted} />
              <Text style={{ color: colors.textMuted }}>Waiting for you to confirm on your phone…</Text>
            </View>
          </View>
        );
      } else if (s.type === 'cookies') {
        const cookieFields = s.cookies?.fields ?? [];
        const manual = manualCookies || !webviewCookiesAvailable;
        body = (
          <View style={{ gap: 16 }}>
            <Text style={[styles.instructions, { color: colors.textMuted }]}>
              {manual
                ? `Log in to ${info.name} in a browser, then copy these cookie values from its developer tools.`
                : `You’ll log in on ${info.name}’s own website. Your password goes only to ${info.name}; Comms keeps the session the site gives back.`}
            </Text>
            {manual ? (
              <>
                {cookieFields.map((f) =>
                  field({ id: f.id, name: f.id, type: 'token' }, (v) => setValues((p) => ({ ...p, [f.id]: v })), values[f.id] ?? ''),
                )}
                {button(
                  'Continue',
                  () => submit(s, values),
                  cookieFields.some((f) => f.required !== false && !values[f.id]),
                )}
              </>
            ) : (
              // Closing the in-app browser falls back to manual entry.
              <CookieLogin step={s} onCaptured={(v) => submit(s, v)} onCancel={() => setManualCookies(true)} />
            )}
          </View>
        );
      }
      break;
    }
  }

  return (
    <>
      <Stack.Screen options={{ title: info.name }} />
      <KeyboardAwareScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled" bottomOffset={24}>
        {header}
        {body}
      </KeyboardAwareScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 24, flexGrow: 1 },
  header: { alignItems: 'center', gap: 12, marginTop: 8 },
  title: { fontSize: 22, fontWeight: '700' },
  center: { alignItems: 'center', gap: 16, paddingVertical: 12 },
  message: { fontSize: 16, lineHeight: 22, textAlign: 'center' },
  instructions: { fontSize: 15, lineHeight: 21, textAlign: 'center' },
  button: { alignSelf: 'stretch', borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  buttonText: { fontSize: 16, fontWeight: '600' },
  flow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 14 },
  flowName: { fontSize: 16, fontWeight: '600', marginBottom: 2 },
  field: { gap: 6 },
  label: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 16 },
  help: { fontSize: 12 },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16 },
  qr: { backgroundColor: '#fff', padding: 16, borderRadius: 16 },
  code: { fontSize: 34, fontWeight: '700', letterSpacing: 4, fontFamily: 'monospace' },
  waiting: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  helpBox: { alignSelf: 'stretch', gap: 12, padding: 16, borderRadius: 14 },
  helpStep: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  helpNumber: {
    width: 22,
    height: 22,
    borderRadius: 11,
    overflow: 'hidden',
    textAlign: 'center',
    lineHeight: 22,
    fontSize: 13,
    fontWeight: '700',
  },
  helpText: { flex: 1, fontSize: 15, lineHeight: 21 },
});

/** Resolves once the app is on screen again. */
function untilForeground() {
  return new Promise<void>((resolve) => {
    if (AppState.currentState === 'active') return resolve();
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      sub.remove();
      resolve();
    });
  });
}
