import { useEffect, useState } from 'react';
import { Call, TelnyxConnectionState } from '@telnyx/react-voice-commons-sdk';
import { voipClient } from './client';

/** useTelnyxVoice()'s connectionState field is always undefined in this SDK
 *  version (TelnyxVoiceProvider never sets it) — subscribe to the client's
 *  own observable directly instead. */
export function useConnectionState(): TelnyxConnectionState {
  const [state, setState] = useState(voipClient.currentConnectionState);
  useEffect(() => {
    const sub = voipClient.connectionState$.subscribe(setState);
    return () => sub.unsubscribe();
  }, []);
  return state;
}

export function useActiveCall(): Call | null {
  const [call, setCall] = useState<Call | null>(voipClient.currentActiveCall);
  useEffect(() => {
    const sub = voipClient.activeCall$.subscribe(setCall);
    return () => sub.unsubscribe();
  }, []);
  return call;
}
