import * as Notifications from 'expo-notifications';
import { DarkTheme, DefaultTheme, router, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';

import { roomIdFromResponse } from '@/lib/push';
import { AppProvider, useApp, useColors, useIsDark } from '@/lib/store';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
        <AppProvider>
          <Navigator />
        </AppProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}

/** Opens the chat a tapped notification belongs to, including when it launched the app. */
function useNotificationRouting(enabled: boolean) {
  useEffect(() => {
    if (!enabled || Platform.OS === 'web') return;
    const open = (roomId: string | undefined) => {
      if (roomId) router.push({ pathname: '/chat/[id]', params: { id: roomId } });
    };
    Notifications.getLastNotificationResponseAsync().then((response) => {
      open(roomIdFromResponse(response));
      Notifications.clearLastNotificationResponse();
    });
    const sub = Notifications.addNotificationResponseReceivedListener((response) =>
      open(roomIdFromResponse(response)),
    );
    return () => sub.remove();
  }, [enabled]);
}

function Navigator() {
  const { loaded, backend } = useApp();
  const colors = useColors();
  const dark = useIsDark();

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync();
  }, [loaded]);

  useNotificationRouting(loaded && !!backend);

  if (!loaded) return null;

  const base = dark ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...base,
    colors: {
      ...base.colors,
      primary: colors.accent,
      background: colors.bg,
      card: colors.bg,
      text: colors.text,
      border: colors.border,
    },
  };

  return (
    <ThemeProvider value={navTheme}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShadowVisible: false,
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.text,
          headerBackButtonDisplayMode: 'minimal',
          contentStyle: { backgroundColor: colors.bg },
        }}>
        <Stack.Protected guard={!!backend}>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="chat/[id]" />
          <Stack.Screen name="folder/[name]" />
          <Stack.Screen name="search" options={{ headerShown: false, animation: 'fade' }} />
          <Stack.Screen name="new-chat" options={{ title: 'New chat', presentation: 'modal' }} />
          <Stack.Screen name="accounts" options={{ title: 'Accounts' }} />
          <Stack.Screen name="connect/[network]" options={{ title: 'Connect' }} />
          <Stack.Screen name="settings" options={{ title: 'Settings' }} />
        </Stack.Protected>
        <Stack.Protected guard={!backend}>
          <Stack.Screen name="welcome" options={{ headerShown: false }} />
          <Stack.Screen name="signin" options={{ title: 'Connect your server' }} />
        </Stack.Protected>
      </Stack>
    </ThemeProvider>
  );
}
