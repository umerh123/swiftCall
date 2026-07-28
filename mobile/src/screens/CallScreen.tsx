import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { colors } from '../theme';
import { TelnyxCallState } from '@telnyx/react-voice-commons-sdk';
import { useActiveCall } from '../voip/hooks';
import { logCall } from '../api/client';

type Props = NativeStackScreenProps<RootStackParamList, 'Call'>;

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60)
    .toString()
    .padStart(2, '0');
  const s = Math.floor(sec % 60)
    .toString()
    .padStart(2, '0');
  return `${m}:${s}`;
}

const STATE_LABEL: Record<string, string> = {
  RINGING: 'Ringing…',
  CONNECTING: 'Connecting…',
  ACTIVE: 'In call',
  HELD: 'On hold',
  ENDED: 'Call ended',
  FAILED: 'Call failed',
  DROPPED: 'Call dropped',
};

export default function CallScreen({ navigation }: Props) {
  const call = useActiveCall();
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [held, setHeld] = useState(false);

  useEffect(() => {
    if (!call) {
      navigation.goBack();
      return;
    }
    const subs = [
      call.duration$.subscribe(setDuration),
      call.isMuted$.subscribe(setMuted),
      call.isHeld$.subscribe(setHeld),
      call.callState$.subscribe((state) => {
        if (state === TelnyxCallState.ENDED || state === TelnyxCallState.FAILED || state === TelnyxCallState.DROPPED) {
          logCall(call.destination, call.isIncoming ? 'inbound' : 'outbound', state.toLowerCase(), call.currentDuration).catch(() => {});
          setTimeout(() => navigation.goBack(), 600);
        }
      }),
    ];
    return () => subs.forEach((s) => s.unsubscribe());
  }, [call]);

  if (!call) return null;

  const name = call.callerName || call.callerNumber || call.destination;

  return (
    <View style={styles.container}>
      <View style={styles.info}>
        <Text style={styles.name}>{name}</Text>
        <Text style={styles.status}>
          {call.currentState === TelnyxCallState.ACTIVE
            ? formatDuration(duration)
            : STATE_LABEL[call.currentState] || call.currentState}
        </Text>
      </View>

      {call.isIncoming && call.currentState === TelnyxCallState.RINGING ? (
        <View style={styles.incomingRow}>
          <TouchableOpacity
            style={[styles.roundBtn, styles.reject]}
            onPress={() => call.hangup().catch(() => {})}
          >
            <Text style={styles.roundBtnIcon}>✕</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.roundBtn, styles.accept]}
            onPress={() => call.answer().catch(() => {})}
          >
            <Text style={styles.roundBtnIcon}>✓</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <View style={styles.controlsRow}>
            <TouchableOpacity
              style={[styles.controlBtn, muted && styles.controlBtnActive]}
              onPress={() => call.toggleMute().catch(() => {})}
            >
              <Text style={styles.controlBtnText}>{muted ? 'Unmute' : 'Mute'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.controlBtn, held && styles.controlBtnActive]}
              onPress={() => (held ? call.resume() : call.hold()).catch(() => {})}
            >
              <Text style={styles.controlBtnText}>{held ? 'Resume' : 'Hold'}</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={[styles.roundBtn, styles.reject, styles.hangupSolo]}
            onPress={() => call.hangup().catch(() => {})}
          >
            <Text style={styles.roundBtnIcon}>✕</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, justifyContent: 'space-between', paddingVertical: 64 },
  info: { alignItems: 'center', marginTop: 40 },
  name: { color: colors.text, fontSize: 28, fontWeight: '600' },
  status: { color: colors.textMuted, fontSize: 16, marginTop: 8 },
  incomingRow: { flexDirection: 'row', justifyContent: 'space-evenly', marginBottom: 40 },
  controlsRow: { flexDirection: 'row', justifyContent: 'center', gap: 16 },
  controlBtn: {
    backgroundColor: colors.card,
    borderRadius: 999,
    paddingHorizontal: 24,
    paddingVertical: 14,
    marginHorizontal: 8,
  },
  controlBtnActive: { backgroundColor: colors.accent },
  controlBtnText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  hangupSolo: { alignSelf: 'center', marginTop: 32 },
  roundBtn: {
    width: 72,
    height: 72,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accept: { backgroundColor: colors.success },
  reject: { backgroundColor: colors.danger },
  roundBtnIcon: { color: '#fff', fontSize: 28, fontWeight: '700' },
});
