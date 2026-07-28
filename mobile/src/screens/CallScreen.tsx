import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { colors, radius } from '../theme';
import Avatar from '../components/Avatar';
import Screen from '../components/Screen';
import Icon from '../components/Icon';
import { TelnyxCallState } from '@telnyx/react-voice-commons-sdk';
import { useActiveCall } from '../voip/hooks';
import { logCall } from '../api/client';

type Props = NativeStackScreenProps<RootStackParamList, 'Call'>;

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60).toString().padStart(2, '0');
  const s = Math.floor(sec % 60).toString().padStart(2, '0');
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
  const isRinging = call.isIncoming && call.currentState === TelnyxCallState.RINGING;

  return (
    <Screen edges={['top', 'bottom']} style={styles.container}>
      <View style={styles.info}>
        <View style={[styles.avatarRing, call.currentState === TelnyxCallState.ACTIVE && styles.avatarRingLive]}>
          <Avatar name={name} size={104} />
        </View>
        <Text style={styles.name}>{name}</Text>
        <Text style={styles.status}>
          {call.currentState === TelnyxCallState.ACTIVE
            ? formatDuration(duration)
            : STATE_LABEL[call.currentState] || call.currentState}
        </Text>
      </View>

      {isRinging ? (
        <View style={styles.incomingRow}>
          <View style={styles.incomingCol}>
            <TouchableOpacity
              style={[styles.roundBtn, styles.reject]}
              activeOpacity={0.85}
              onPress={() => call.hangup().catch(() => {})}
            >
              <Icon name="phone-hangup" size={28} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.incomingLabel}>Decline</Text>
          </View>
          <View style={styles.incomingCol}>
            <TouchableOpacity
              style={[styles.roundBtn, styles.accept]}
              activeOpacity={0.85}
              onPress={() => call.answer().catch(() => {})}
            >
              <Icon name="phone" size={26} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.incomingLabel}>Answer</Text>
          </View>
        </View>
      ) : (
        <View style={styles.activeControls}>
          <View style={styles.controlsRow}>
            <View style={styles.controlCol}>
              <TouchableOpacity
                style={[styles.controlBtn, muted && styles.controlBtnActive]}
                activeOpacity={0.8}
                onPress={() => call.toggleMute().catch(() => {})}
              >
                <Icon name={muted ? 'microphone-off' : 'microphone'} size={22} color={muted ? '#fff' : colors.text} />
              </TouchableOpacity>
              <Text style={styles.controlLabel}>{muted ? 'Unmute' : 'Mute'}</Text>
            </View>
            <View style={styles.controlCol}>
              <TouchableOpacity
                style={[styles.controlBtn, held && styles.controlBtnActive]}
                activeOpacity={0.8}
                onPress={() => (held ? call.resume() : call.hold()).catch(() => {})}
              >
                <Icon name={held ? 'play' : 'pause'} size={22} color={held ? '#fff' : colors.text} />
              </TouchableOpacity>
              <Text style={styles.controlLabel}>{held ? 'Resume' : 'Hold'}</Text>
            </View>
          </View>
          <TouchableOpacity
            style={[styles.roundBtn, styles.reject, styles.hangupSolo]}
            activeOpacity={0.85}
            onPress={() => call.hangup().catch(() => {})}
          >
            <Icon name="phone-hangup" size={28} color="#fff" />
          </TouchableOpacity>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { justifyContent: 'space-between', paddingVertical: 32 },
  info: { alignItems: 'center', marginTop: 56 },
  avatarRing: {
    padding: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  avatarRingLive: { borderColor: colors.accentWash },
  name: { color: colors.text, fontSize: 26, fontWeight: '600', marginTop: 20, letterSpacing: -0.3 },
  status: { color: colors.textMuted, fontSize: 15, marginTop: 8, fontVariant: ['tabular-nums'] },
  incomingRow: { flexDirection: 'row', justifyContent: 'space-evenly', marginBottom: 48 },
  incomingCol: { alignItems: 'center', gap: 10 },
  incomingLabel: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  activeControls: { alignItems: 'center' },
  controlsRow: { flexDirection: 'row', justifyContent: 'center', gap: 28 },
  controlCol: { alignItems: 'center', gap: 8 },
  controlBtn: {
    width: 58,
    height: 58,
    borderRadius: radius.pill,
    backgroundColor: colors.raised,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlBtnActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  controlBtnIcon: { fontSize: 20 },
  controlLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
  hangupSolo: { alignSelf: 'center', marginTop: 36 },
  roundBtn: {
    width: 68,
    height: 68,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 6,
  },
  accept: { backgroundColor: colors.success },
  reject: { backgroundColor: colors.danger },
  roundBtnIcon: { color: '#fff', fontSize: 26, fontWeight: '700' },
});
