import { NativeModules, Platform } from 'react-native';
import crashlytics from '@react-native-firebase/crashlytics';
import { TelnyxConnectionState } from '@telnyx/react-voice-commons-sdk';
import { voipClient } from './client';
import { bootVoip } from './boot';

function log(msg: string) {
  try {
    crashlytics().log(`pushRecovery: ${msg}`);
  } catch {}
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** TelnyxVoiceApp's own push-launch handling reads this same native data
 *  ~100ms after mount and reliably throws before creating a client
 *  (confirmed via Crashlytics: "Cannot read property 'TelnyxRTC' of
 *  undefined") — almost certainly because native modules like NetInfo
 *  haven't finished registering with the bridge yet. Its read also
 *  destructively clears the data, so nothing downstream can retry with it.
 *
 *  This grabs the same data non-destructively as early as possible (before
 *  that 100ms timer), then waits long enough for the bridge to settle
 *  before making our own attempt at the exact same call the vendor SDK
 *  makes internally — the ONLY thing that can process it correctly is a
 *  client that embeds this push's voice_sdk_id *before* connecting, per
 *  the SDK's own comment in session-manager.ts: reusing/creating a plain
 *  connection first means the platform routes the call to a different,
 *  correctly-stamped client and this one sits on the wrong socket forever.
 *  That's why this must be the ONLY thing that logs in on a push-launched
 *  cold start — see LoginScreen, which skips its own bootVoip() whenever
 *  this is about to run. */
export async function recoverPushLaunchedCall(): Promise<void> {
  if (Platform.OS !== 'android') return;
  const bridge = NativeModules.VoicePnBridge;
  if (!bridge?.getPendingPushAction) return;

  let pending: { action?: string; metadata?: string } | null = null;
  try {
    pending = await bridge.getPendingPushAction();
  } catch (e) {
    log(`getPendingPushAction threw: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (!pending?.action || !pending?.metadata) {
    log('no pending push action found at startup');
    return;
  }
  if (pending.action === 'reject') {
    log('pending action is reject — nothing to reconnect for');
    return;
  }
  log(`captured pending push action early: ${pending.action}`);

  let metadata: unknown = pending.metadata;
  try {
    metadata = JSON.parse(pending.metadata);
  } catch {
    // Some payloads are already a plain string — handlePushNotification
    // handles either shape.
  }

  await wait(2500);

  if (voipClient.currentActiveCall) {
    log('call already active by the time recovery ran — nothing to do');
    return;
  }

  try {
    log('retrying handlePushNotification with the captured payload');
    await voipClient.handlePushNotification({
      action: pending.action,
      metadata,
      from_notification: true,
    });
    log('delayed handlePushNotification retry resolved without throwing');
  } catch (e) {
    log(`delayed retry failed: ${e instanceof Error ? e.message : String(e)}`);
    try {
      crashlytics().recordError(e instanceof Error ? e : new Error(String(e)));
    } catch {}
  }

  // Whichever way that went, don't leave the line dead for the next call —
  // this is only a plain reconnect (no voice_sdk_id), so it can't rescue
  // the specific call that triggered this launch, but it gets "Line ready"
  // back for the next one instead of requiring the person to reopen the app.
  await wait(500);
  if (
    voipClient.currentConnectionState !== TelnyxConnectionState.CONNECTED &&
    voipClient.currentConnectionState !== TelnyxConnectionState.CONNECTING &&
    !voipClient.currentActiveCall
  ) {
    log('still not connected after the delayed retry — falling back to bootVoip()');
    await bootVoip();
  }
}
