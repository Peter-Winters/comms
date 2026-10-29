import Ionicons from '@expo/vector-icons/Ionicons';
import { useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import type { LoginStep } from '@/lib/bridges';
import { useColors } from '@/lib/store';
import { clearWebviewCookies, getWebviewCookies } from '../../modules/webview-cookies';

type Props = {
  step: LoginStep;
  onCaptured: (values: Record<string, string>) => void;
  onCancel: () => void;
};

/**
 * Lets the user log in to the network's own website, then collects the session cookies (and
 * any local-storage values) the bridge asked for. This is how Beeper connects Instagram,
 * Messenger and Slack without ever handling the password.
 */
export function CookieLogin({ step, onCaptured, onCancel }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const web = useRef<WebView>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const spec = step.cookies!;
  const pattern = spec.wait_for_url_pattern ? new RegExp(spec.wait_for_url_pattern) : null;
  const localStorageKeys = spec.fields.flatMap((f) => f.sources.filter((s) => s.type === 'local_storage').map((s) => s.name));
  const [storage, setStorage] = useState<Record<string, string>>({});

  const submitted = useRef(false);
  const collect = (fromStorage = storage) => {
    if (submitted.current) return;
    const values: Record<string, string> = {};
    const lacking: string[] = [];
    for (const field of spec.fields) {
      let value: string | undefined;
      for (const source of field.sources) {
        if (source.type === 'cookie') {
          const domain = source.cookie_domain ?? hostOf(spec.url);
          value = getWebviewCookies(`https://${domain.replace(/^\./, '')}`)[source.name] ?? getWebviewCookies(spec.url)[source.name];
        } else if (source.type === 'local_storage') {
          value = fromStorage[source.name];
        }
        if (value) break;
      }
      if (value) values[field.id] = value;
      else if (field.required !== false) lacking.push(field.id);
    }
    setMissing(lacking);
    if (lacking.length === 0) {
      submitted.current = true;
      onCaptured(values);
    }
  };

  // Reads requested localStorage keys from the page and posts them back to us.
  const storageScript = localStorageKeys.length
    ? `(function(){var o={};${JSON.stringify(localStorageKeys)}.forEach(function(k){var v=localStorage.getItem(k);if(v)o[k]=v;});window.ReactNativeWebView.postMessage(JSON.stringify({storage:o}));})();true;`
    : '';

  const onMessage = (e: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(e.nativeEvent.data);
      if (data.storage) {
        setStorage(data.storage);
        collect(data.storage);
      }
    } catch {}
  };

  const attempt = () => {
    if (storageScript) web.current?.injectJavaScript(storageScript);
    else collect();
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onCancel}>
      <View style={[styles.container, { backgroundColor: colors.bg, paddingTop: insets.top }]}>
        <View style={[styles.bar, { borderBottomColor: colors.border }]}>
          <Pressable hitSlop={10} onPress={onCancel}>
            <Ionicons name="close" size={26} color={colors.text} />
          </Pressable>
          <Text numberOfLines={1} style={[styles.host, { color: colors.text }]}>
            {hostOf(spec.url)}
          </Text>
          {loading ? <ActivityIndicator color={colors.textMuted} /> : <View style={{ width: 20 }} />}
        </View>
        <Text style={[styles.hint, { color: colors.textMuted, backgroundColor: colors.surface }]}>
          Log in as normal. Comms picks up the login automatically once you reach your inbox.
          {missing.length > 0 ? `\nStill waiting for: ${missing.join(', ')}` : ''}
        </Text>
        <WebView
          ref={web}
          source={{ uri: spec.url }}
          userAgent={spec.user_agent}
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          incognito={false}
          onLoadStart={() => setLoading(true)}
          onLoadEnd={() => setLoading(false)}
          onMessage={onMessage}
          onNavigationStateChange={(nav) => {
            if (pattern?.test(nav.url) && !nav.loading) attempt();
          }}
          style={{ flex: 1 }}
        />
        <View style={[styles.footer, { paddingBottom: insets.bottom + 10, borderTopColor: colors.border }]}>
          <Pressable
            onPress={() => {
              clearWebviewCookies();
              web.current?.reload();
            }}
            style={[styles.button, { backgroundColor: colors.surface }]}>
            <Text style={{ color: colors.text, fontWeight: '600' }}>Start over</Text>
          </Pressable>
          <Pressable onPress={attempt} style={[styles.button, { backgroundColor: colors.accent, flex: 1 }]}>
            <Text style={{ color: colors.accentText, fontWeight: '600' }}>I’m logged in</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function hostOf(url: string) {
  return url.replace(/^[a-z]+:\/\//i, '').split(/[/?#]/)[0];
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  host: { flex: 1, fontSize: 15, fontWeight: '600', textAlign: 'center' },
  hint: { fontSize: 13, lineHeight: 18, padding: 12 },
  footer: { flexDirection: 'row', gap: 10, paddingHorizontal: 14, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  button: { paddingHorizontal: 18, paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
});
