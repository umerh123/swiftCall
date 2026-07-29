import { TelnyxCallState } from '@telnyx/react-voice-commons-sdk';
import { voipClient } from './client';
import CallUtils from '../native/CallUtils';

/** The native side starts the ringtone the moment a call-push arrives, but
 *  only stops it on an explicit answer/reject/missed-call push or a hard
 *  45s ceiling — if the caller cancels before any of those happen, nothing
 *  tells it to stop. This mirrors every call-state change onto the native
 *  ringtone so it can never outlive the call it's ringing for. */
export function startRingGuard(): () => void {
  let callStateSub: { unsubscribe(): void } | null = null;

  const sub = voipClient.activeCall$.subscribe((call) => {
    callStateSub?.unsubscribe();
    callStateSub = null;

    if (!call) {
      // No ringing/connecting/active/held call left to track — whatever
      // was ringing is over one way or another.
      CallUtils.stopRingtone();
      CallUtils.dismissIncomingCallNotification();
      return;
    }

    callStateSub = call.callState$.subscribe((state) => {
      if (state !== TelnyxCallState.RINGING) {
        CallUtils.stopRingtone();
        CallUtils.dismissIncomingCallNotification();
      }
    });
  });

  return () => {
    sub.unsubscribe();
    callStateSub?.unsubscribe();
  };
}
