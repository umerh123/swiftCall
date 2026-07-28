import { getFcmToken, requestMicrophonePermission, requestNotificationPermission } from '../push/push';
import { loginToVoip } from './client';

let inFlight: Promise<void> | null = null;

/**
 * The one and only place that ever calls voipClient.login(). Telnyx's SDK
 * has its own internal auto-reconnect that also tries to log in — running
 * both at once is a documented "double login" race in their own docs, and
 * it's what was crashing this app. TelnyxVoiceApp's auto-reconnect is
 * disabled in App.tsx specifically so this is the only login path, and the
 * inFlight guard stops cold-launch and app-resume from calling this at the
 * same time as each other too.
 */
export async function bootVoip(): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      await requestNotificationPermission();
      await requestMicrophonePermission();
      const fcmToken = await getFcmToken();
      await loginToVoip(fcmToken ?? undefined);
    } catch (e) {
      // Non-fatal — the person can still use messages/contacts even if
      // their calling line isn't connected yet.
      console.warn('VoIP boot failed:', e);
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}
