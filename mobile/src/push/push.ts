import { PermissionsAndroid, Platform } from 'react-native';
import messaging from '@react-native-firebase/messaging';
import { registerPushToken, unregisterPushToken } from '../api/client';

/** Android 13+ requires this at runtime or no notification (call or SMS)
 *  will ever be shown, silently. */
export async function requestNotificationPermission(): Promise<void> {
  if (Platform.OS === 'android' && Platform.Version >= 33) {
    await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
  }
}

/** The manifest declaring RECORD_AUDIO isn't enough on its own — Android
 *  still requires this runtime prompt before any code touches the
 *  microphone. Without it, the native WebRTC layer Telnyx's SDK starts
 *  during login can hard-crash the app instead of just failing softly. */
export async function requestMicrophonePermission(): Promise<void> {
  if (Platform.OS === 'android') {
    await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
  }
}

/** Gets this device's FCM token and hands it to our own backend (for
 *  SMS/voicemail pushes) — Telnyx's own copy of the same token is
 *  registered separately, at login, via voip/client.ts. */
export async function getFcmToken(): Promise<string | null> {
  try {
    const token = await messaging().getToken();
    if (token) await registerPushToken(token).catch(() => {});
    return token;
  } catch {
    return null;
  }
}

export function watchTokenRefresh(): () => void {
  return messaging().onTokenRefresh((token) => {
    registerPushToken(token).catch(() => {});
  });
}

/** Called on sign-out — without this, a stale token would keep getting a
 *  signed-out device pushed to after it's no longer in use. */
export async function unregisterCurrentToken(): Promise<void> {
  try {
    const token = await messaging().getToken();
    if (token) await unregisterPushToken(token);
  } catch {
    // best-effort
  }
}
