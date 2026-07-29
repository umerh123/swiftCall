import crashlytics from '@react-native-firebase/crashlytics';
import { getFcmToken, requestMicrophonePermission, requestNotificationPermission } from '../push/push';
import { loginToVoip } from './client';
import { loadCallerNumber } from './callerId';

let inFlight: Promise<void> | null = null;
let lastError: string | null = null;

/** So the UI can show *why* it's not connecting instead of a "Connecting…"
 *  pill that spins forever with no explanation — bootVoip() swallows its
 *  own errors deliberately (a setup problem shouldn't block the rest of
 *  the app), so this is the only way that reason surfaces anywhere. */
export function getLastVoipError(): string | null {
  return lastError;
}

// Breadcrumbs attach to the *next* crash report Crashlytics sends, even a
// hard native one this code never gets a chance to catch — so the report at
// least says which of these steps was last to start.
function step(name: string) {
  try {
    crashlytics().log(`bootVoip: ${name}`);
  } catch {
    // Crashlytics not initialized yet — never let logging itself be why this fails.
  }
}

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
      step('loading caller number');
      await loadCallerNumber();
      step('requesting notification permission');
      await requestNotificationPermission();
      step('requesting microphone permission');
      await requestMicrophonePermission();
      step('fetching FCM token');
      const fcmToken = await getFcmToken();
      step('calling voipClient.login()');
      await loginToVoip(fcmToken ?? undefined);
      step('voipClient.login() resolved');
      lastError = null;
    } catch (e) {
      // Non-fatal — the person can still use messages/contacts even if
      // their calling line isn't connected yet.
      console.warn('VoIP boot failed:', e);
      lastError = e instanceof Error ? e.message : String(e);
      try {
        crashlytics().recordError(e instanceof Error ? e : new Error(String(e)));
      } catch {}
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}
