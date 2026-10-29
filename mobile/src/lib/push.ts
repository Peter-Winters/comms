import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { Backend } from './backends/backend';

export type PushState =
  | { status: 'unsupported'; reason: string }
  | { status: 'denied' }
  | { status: 'error'; reason: string }
  | { status: 'enabled' };

/** The chat currently on screen; its notifications aren't shown while the app is open. */
let visibleChatId: string | null = null;
export function setVisibleChat(id: string | null) {
  visibleChatId = id;
}

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async (n) => {
      const roomId = (n.request.content.data as { room_id?: string } | undefined)?.room_id;
      const show = roomId !== visibleChatId;
      return { shouldShowBanner: show, shouldShowList: show, shouldPlaySound: show, shouldSetBadge: true };
    },
  });
}

export function projectId(): string | undefined {
  return Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
}

/** Asks for permission, gets this device's Expo push token and registers it with the backend. */
export async function registerForPush(backend: Backend): Promise<PushState> {
  if (Platform.OS === 'web') return { status: 'unsupported', reason: 'Not available on web' };
  if (!Device.isDevice) return { status: 'unsupported', reason: 'Needs a real device' };
  if (!projectId()) return { status: 'unsupported', reason: 'App build has no EAS project ID' };

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('messages', {
      name: 'Messages',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 200, 100, 200],
      lightColor: '#6C5CE7',
    });
  }

  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return { status: 'denied' };

  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: projectId() });
    await backend.setPushToken(token);
    return { status: 'enabled' };
  } catch (e: any) {
    // Typically: Firebase isn't configured in this Android build (no google-services.json).
    return { status: 'error', reason: e?.message ?? String(e) };
  }
}

export function roomIdFromResponse(response: Notifications.NotificationResponse | null | undefined) {
  return (response?.notification.request.content.data as { room_id?: string } | undefined)?.room_id;
}
