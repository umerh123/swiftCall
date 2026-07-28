import { createTelnyxVoipClient, createCredentialConfig } from '@telnyx/react-voice-commons-sdk';
import { getRtcCredentials } from '../api/client';

export const voipClient = createTelnyxVoipClient({
  enableAppStateManagement: true,
  debug: __DEV__,
});

/** Fetches this account's SIP line from the backend and logs the Telnyx
 *  client into it, registering the given FCM token so Telnyx can push
 *  incoming calls to this device even when the app isn't running. */
export async function loginToVoip(fcmToken?: string): Promise<void> {
  const creds = await getRtcCredentials();
  if (!creds.ok || !creds.login || !creds.password) {
    throw new Error(creds.error || 'This account has no calling line set up yet.');
  }
  const config = createCredentialConfig(creds.login, creds.password, {
    pushNotificationDeviceToken: fcmToken,
    enableMissedCallNotifications: true,
  });
  await voipClient.login(config);
}
