import crashlytics from '@react-native-firebase/crashlytics';
import { voipClient } from './client';

/** The push-launched "cold start, tap the notification, land on the call
 *  screen" path is entirely internal to TelnyxVoiceApp/SessionManager (see
 *  their handlePushNotification chain) — none of it is our code, so a
 *  failure there is invisible to us beyond "the app opened but never
 *  showed the call". This turns TelnyxVoiceApp's own processing-start/
 *  -complete callbacks, plus the connection/call state streams, into
 *  Crashlytics breadcrumbs, and forces a non-fatal report if processing
 *  starts but no call ever materializes — so the next report carries real
 *  data instead of another guess. */

let watchdog: ReturnType<typeof setTimeout> | null = null;

function log(msg: string) {
  try {
    crashlytics().log(`pushCall: ${msg}`);
  } catch {}
}

export function onPushProcessingStarted(): void {
  log('TelnyxVoiceApp: started processing an initial push notification');
  if (watchdog) clearTimeout(watchdog);
  watchdog = setTimeout(() => {
    const state = voipClient.currentConnectionState;
    const hasCall = !!voipClient.currentActiveCall;
    log(`watchdog: 6s after push processing started — connectionState=${state} hasActiveCall=${hasCall}`);
    if (!hasCall) {
      try {
        crashlytics().recordError(
          new Error(`Push-launched call never reached activeCall$ (connectionState=${state})`)
        );
      } catch {}
    }
  }, 6000);
}

export function onPushProcessingCompleted(): void {
  log('TelnyxVoiceApp: finished processing the initial push notification');
}

export function watchConnectionAndCallState(): () => void {
  const connSub = voipClient.connectionState$.subscribe((state) => {
    log(`connectionState -> ${state}`);
  });
  const callSub = voipClient.activeCall$.subscribe((call) => {
    log(`activeCall$ -> ${call ? `${call.callId} (${call.currentState})` : 'null'}`);
    if (call && watchdog) {
      clearTimeout(watchdog);
      watchdog = null;
    }
  });
  return () => {
    connSub.unsubscribe();
    callSub.unsubscribe();
  };
}
