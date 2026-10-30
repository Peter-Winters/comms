import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useColorScheme } from 'react-native';

import type { Palette } from '@/theme/colors';
import { makeTheme, type Theme } from '@/theme/themes';
import type { Backend, BackendSnapshot } from './backends/backend';
import { DemoBackend } from './backends/demo';
import { MatrixBackend, type MatrixSession } from './backends/matrix';
import { registerForPush, type PushState } from './push';
import { DEFAULT_PREFS, loadPrefs, loadSession, savePrefs, saveSession, type Prefs, type StoredSession } from './storage';
import type { Message } from './types';

type AppContextValue = {
  loaded: boolean;
  backend: Backend | null;
  prefs: Prefs;
  setPrefs: (patch: Partial<Prefs>) => void;
  signInDemo: () => void;
  signInMatrix: (session: MatrixSession) => void;
  signOut: () => Promise<void>;
  push: PushState;
  retryPush: () => void;
};

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [loaded, setLoaded] = useState(false);
  const [backend, setBackend] = useState<Backend | null>(null);
  const [prefs, setPrefsState] = useState<Prefs>(DEFAULT_PREFS);
  const [push, setPush] = useState<PushState>({ status: 'unsupported', reason: 'Not signed in' });
  const [pushAttempt, setPushAttempt] = useState(0);

  const activate = useCallback((stored: StoredSession | null) => {
    setBackend((prev) => {
      prev?.stop();
      if (!stored) return null;
      const next: Backend =
        stored.kind === 'demo'
          ? new DemoBackend()
          : new MatrixBackend(stored.session, () => {
              // Token revoked elsewhere: drop the session so the user signs in again.
              saveSession(null);
              setBackend((current) => {
                current?.stop();
                return null;
              });
            });
      next.start();
      return next;
    });
  }, []);

  useEffect(() => {
    Promise.all([loadSession(), loadPrefs()]).then(([session, p]) => {
      setPrefsState(p);
      activate(session);
      setLoaded(true);
    });
  }, [activate]);

  // Register for push whenever we have a real account (retryable from Settings).
  useEffect(() => {
    if (!backend || backend.kind === 'demo') return;
    let cancelled = false;
    registerForPush(backend).then((state) => {
      if (!cancelled) setPush(state);
    });
    return () => {
      cancelled = true;
    };
  }, [backend, pushAttempt]);

  const value = useMemo<AppContextValue>(
    () => ({
      loaded,
      backend,
      prefs,
      setPrefs: (patch) =>
        setPrefsState((prev) => {
          const next = { ...prev, ...patch };
          savePrefs(next);
          return next;
        }),
      signInDemo: () => {
        const s: StoredSession = { kind: 'demo' };
        saveSession(s);
        activate(s);
      },
      signInMatrix: (session) => {
        const s: StoredSession = { kind: 'matrix', session };
        saveSession(s);
        activate(s);
      },
      signOut: async () => {
        await backend?.logout();
        await saveSession(null);
        activate(null);
      },
      push: backend?.kind === 'demo' ? { status: 'unsupported', reason: 'Not available in the demo' } : push,
      retryPush: () => setPushAttempt((n) => n + 1),
    }),
    [loaded, backend, prefs, activate, push],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}

/** The active backend. Only use on screens that are reachable while signed in. */
export function useBackend(): Backend {
  const { backend } = useApp();
  if (!backend) throw new Error('No active backend');
  return backend;
}

const EMPTY_SNAPSHOT: BackendSnapshot = {
  status: 'starting',
  userId: '',
  displayName: '',
  chats: [],
  accounts: [],
  importing: [],
};
const noopSubscribe = () => () => {};

function useSubscribe() {
  const { backend } = useApp();
  return useMemo(
    () => (backend ? (listener: () => void) => backend.subscribe(listener) : noopSubscribe),
    [backend],
  );
}

export function useSnapshot(): BackendSnapshot {
  const { backend } = useApp();
  return useSyncExternalStore(useSubscribe(), () => backend?.getSnapshot() ?? EMPTY_SNAPSHOT);
}

export function useChat(chatId: string) {
  const { chats } = useSnapshot();
  return chats.find((c) => c.id === chatId);
}

const NO_MESSAGES: Message[] = [];

export function useMessages(chatId: string): Message[] {
  const { backend } = useApp();
  return useSyncExternalStore(useSubscribe(), () => backend?.getMessages(chatId) ?? NO_MESSAGES);
}

export function useTheme(): Theme {
  const scheme = useColorScheme();
  const { prefs } = useApp();
  const isDark = prefs.theme === 'system' ? scheme === 'dark' : prefs.theme === 'dark';
  return useMemo(() => makeTheme(prefs.themeStyle, isDark), [prefs.themeStyle, isDark]);
}

export function useColors(): Palette {
  return useTheme().colors;
}

export function useIsDark() {
  return useTheme().dark;
}
