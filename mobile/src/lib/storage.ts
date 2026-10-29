import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import type { MatrixSession } from './backends/matrix';

export type StoredSession = { kind: 'demo' } | { kind: 'matrix'; session: MatrixSession };

export type Prefs = {
  theme: 'system' | 'light' | 'dark';
  /** Show a preview of message text in the inbox. */
  showPreviews: boolean;
};

export const DEFAULT_PREFS: Prefs = { theme: 'system', showPreviews: true };

const SESSION_KEY = 'comms.session';
const PREFS_KEY = 'comms.prefs';

// Access tokens go in the OS keychain/keystore; web (dev only) falls back to localStorage.
const secure = {
  get: (key: string) =>
    Platform.OS === 'web' ? Promise.resolve(globalThis.localStorage?.getItem(key) ?? null) : SecureStore.getItemAsync(key),
  set: (key: string, value: string) =>
    Platform.OS === 'web'
      ? Promise.resolve(globalThis.localStorage?.setItem(key, value))
      : SecureStore.setItemAsync(key, value),
  remove: (key: string) =>
    Platform.OS === 'web'
      ? Promise.resolve(globalThis.localStorage?.removeItem(key))
      : SecureStore.deleteItemAsync(key),
};

export async function loadSession(): Promise<StoredSession | null> {
  try {
    const raw = await secure.get(SESSION_KEY);
    return raw ? (JSON.parse(raw) as StoredSession) : null;
  } catch {
    return null;
  }
}

export async function saveSession(session: StoredSession | null) {
  try {
    if (session) await secure.set(SESSION_KEY, JSON.stringify(session));
    else await secure.remove(SESSION_KEY);
  } catch {}
}

export async function loadPrefs(): Promise<Prefs> {
  try {
    const raw = await AsyncStorage.getItem(PREFS_KEY);
    return raw ? { ...DEFAULT_PREFS, ...JSON.parse(raw) } : DEFAULT_PREFS;
  } catch {
    return DEFAULT_PREFS;
  }
}

export async function savePrefs(prefs: Prefs) {
  try {
    await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {}
}
