import { APP_NAME } from '@digital-madrasa/shared';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';
import { api } from '@/api';

/**
 * Push notification registration.
 *
 * The server side (migration 0025, `dispatch-notifications`) sends through
 * Expo's push service to whatever tokens are registered for an account. This
 * module obtains the device's token and registers it after sign-in, and
 * removes it before sign-out so a shared family phone stops receiving for
 * the account that left.
 *
 * Remote push is unavailable in Expo Go on Android since SDK 53, and on
 * simulators. There, and wherever permission is refused, registration quietly
 * does nothing: in-app notifications still work, and nothing else depends on
 * push. `expo-notifications` is loaded lazily so that Expo Go never evaluates
 * it (evaluating it there logs an error on Android).
 */

let registeredToken: string | null = null;

function pushSupported(): boolean {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') return false;
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return false;
  return Constants.isDevice === true;
}

function projectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId;
}

/** Registers this device for the signed-in account. Never throws. */
export async function registerDeviceForPush(): Promise<string | null> {
  if (!pushSupported()) return null;
  try {
    const Notifications = await import('expo-notifications');

    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });

    if (Platform.OS === 'android') {
      // The dispatcher sends on channel "default".
      await Notifications.setNotificationChannelAsync('default', {
        name: APP_NAME,
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      ({ status } = await Notifications.requestPermissionsAsync());
    }
    if (status !== 'granted') return null;

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: projectId() });
    await api.registerPushToken(token, Platform.OS === 'ios' ? 'ios' : 'android');
    registeredToken = token;
    return token;
  } catch (error) {
    // Push is a convenience; failing to register must not disturb sign-in.
    if (__DEV__) console.warn('[push] registration skipped:', error instanceof Error ? error.message : error);
    return null;
  }
}

/** Removes this device from the account. Call while still signed in. Never throws. */
export async function unregisterDeviceForPush(): Promise<void> {
  const token = registeredToken;
  registeredToken = null;
  if (!token) return;
  try {
    await api.unregisterPushToken(token);
  } catch {
    // The server disables dead tokens on its own; sign-out must proceed.
  }
}
