import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, Animated, Easing, Pressable } from 'react-native';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { CompositeScreenProps, useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MainTabParamList, RootStackParamList } from '../navigation/types';
import { colors, radius } from '../theme';
import Screen from '../components/Screen';
import Icon from '../components/Icon';
import { TelnyxConnectionState } from '@telnyx/react-voice-commons-sdk';
import { voipClient } from '../voip/client';
import { useConnectionState } from '../voip/hooks';
import { bootVoip, getLastVoipError } from '../voip/boot';
import { normalizePhoneNumber } from '../utils/phone';
import CallUtils from '../native/CallUtils';
import { getCallerNumber } from '../voip/callerId';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Dialer'>,
  NativeStackScreenProps<RootStackParamList>
>;

const KEYS: [string, string][] = [
  ['1', ''],
  ['2', 'ABC'],
  ['3', 'DEF'],
  ['4', 'GHI'],
  ['5', 'JKL'],
  ['6', 'MNO'],
  ['7', 'PQRS'],
  ['8', 'TUV'],
  ['9', 'WXYZ'],
  ['*', ''],
  ['0', '+'],
  ['#', ''],
];

function PulsingDot({ color }: { color: string }) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 700, easing: Easing.in(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  return (
    <View style={styles.lampWrap}>
      <Animated.View
        style={[
          styles.lampHalo,
          { backgroundColor: color, opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] }), transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.4] }) }] },
        ]}
      />
      <View style={[styles.lamp, { backgroundColor: color }]} />
    </View>
  );
}

function DialKey({ num, letters, onPress, onLongPress }: { num: string; letters: string; onPress: () => void; onLongPress?: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;
  const pressIn = () => Animated.spring(scale, { toValue: 0.9, useNativeDriver: true, speed: 40, bounciness: 0 }).start();
  const pressOut = () => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 18, bounciness: 9 }).start();

  return (
    <Pressable style={styles.keyWrap} onPress={onPress} onLongPress={onLongPress} onPressIn={pressIn} onPressOut={pressOut}>
      <Animated.View style={[styles.key, { transform: [{ scale }] }]}>
        <Text style={styles.keyNum}>{num}</Text>
        <Text style={styles.keyLetters}>{letters || ' '}</Text>
      </Animated.View>
    </Pressable>
  );
}

export default function DialerScreen({ navigation }: Props) {
  const [digits, setDigits] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const connectionState = useConnectionState();
  const connected = connectionState === TelnyxConnectionState.CONNECTED;
  const connecting = connectionState === TelnyxConnectionState.CONNECTING;

  useFocusEffect(
    React.useCallback(() => {
      setError(getLastVoipError());
    }, [connectionState])
  );

  async function retry() {
    setRetrying(true);
    setError(null);
    await bootVoip();
    setError(getLastVoipError());
    setRetrying(false);
  }

  async function call() {
    const dest = normalizePhoneNumber(digits);
    if (!dest) return;
    if (!connected) {
      Alert.alert('Not connected', 'Your calling line is still connecting — try again in a moment.');
      return;
    }
    try {
      const myNumber = getCallerNumber();
      await voipClient.newCall(dest, undefined, myNumber || undefined);
      navigation.navigate('Call');
    } catch (e: any) {
      Alert.alert('Could not call', e?.message || 'Something went wrong.');
    }
  }

  const showError = !connected && !connecting && !!error;
  const statusColor = connected ? colors.success : showError ? colors.danger : colors.accent;

  return (
    <Screen>
      <View style={styles.topBar}>
        <Text style={styles.wordmark}>Console</Text>
        <TouchableOpacity
          style={styles.settingsBtn}
          onPress={() => navigation.navigate('Settings')}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Icon name="cog-outline" size={19} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={styles.statusPill}
        disabled={connected || retrying}
        onPress={showError ? retry : undefined}
        activeOpacity={showError ? 0.7 : 1}
      >
        {retrying ? (
          <Text style={styles.statusText}>Retrying…</Text>
        ) : (
          <>
            {connecting ? <PulsingDot color={statusColor} /> : <View style={[styles.lamp, { backgroundColor: statusColor }]} />}
            <Text style={styles.statusText}>
              {connected ? 'Line ready' : showError ? 'Tap to retry' : 'Connecting…'}
            </Text>
          </>
        )}
      </TouchableOpacity>

      {showError && (
        <TouchableOpacity style={styles.errorBanner} onPress={retry} activeOpacity={0.8}>
          <Icon name="alert-circle-outline" size={16} color={colors.danger} />
          <Text style={styles.errorText} numberOfLines={2}>{error}</Text>
        </TouchableOpacity>
      )}

      <View style={styles.displayWrap}>
        <Text style={styles.display} numberOfLines={1} adjustsFontSizeToFit>
          {digits || ' '}
        </Text>
        {digits.length > 0 && (
          <TouchableOpacity
            onPress={() => setDigits((d) => d.slice(0, -1))}
            onLongPress={() => setDigits('')}
            style={styles.backspace}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Icon name="backspace-outline" size={21} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.pad}>
        {KEYS.map(([num, letters]) => (
          <DialKey
            key={num}
            num={num}
            letters={letters}
            onPress={() => {
              CallUtils.playDtmfTone(num);
              setDigits((d) => d + num);
            }}
            onLongPress={() => num === '0' && setDigits((d) => d + '+')}
          />
        ))}
      </View>

      <TouchableOpacity
        style={[styles.callBtn, !digits && styles.callBtnDisabled]}
        onPress={call}
        activeOpacity={0.85}
        disabled={!digits}
      >
        <Icon name="phone" size={24} color="#fff" />
      </TouchableOpacity>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  wordmark: { color: colors.textFaint, fontSize: 13, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' },
  settingsBtn: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 8,
    marginTop: 18,
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
  },
  lampWrap: { width: 8, height: 8, alignItems: 'center', justifyContent: 'center' },
  lampHalo: { position: 'absolute', width: 8, height: 8, borderRadius: 4 },
  lamp: { width: 7, height: 7, borderRadius: 4 },
  statusText: { color: colors.textMuted, fontSize: 12.5, fontWeight: '600' },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 20,
    marginTop: 12,
    padding: 11,
    borderRadius: radius.md,
    backgroundColor: colors.dangerWash,
    borderWidth: 1,
    borderColor: 'rgba(220,38,38,.3)',
  },
  errorText: { flex: 1, color: '#FFD4DA', fontSize: 12.5, lineHeight: 17 },
  displayWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 68,
    marginTop: 24,
    paddingHorizontal: 60,
  },
  display: {
    fontSize: 36,
    color: colors.text,
    fontWeight: '300',
    letterSpacing: 1,
    fontVariant: ['tabular-nums'],
  },
  backspace: { position: 'absolute', right: 24, padding: 8 },
  pad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    paddingHorizontal: 24,
    marginTop: 4,
  },
  keyWrap: {
    width: '27%',
    aspectRatio: 1,
    margin: '3%',
    maxHeight: 72,
  },
  key: {
    flex: 1,
    borderRadius: radius.xxl,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyNum: { fontSize: 24, color: colors.text, fontWeight: '500' },
  keyLetters: { fontSize: 9.5, color: colors.textFaint, letterSpacing: 1.8, marginTop: 3 },
  callBtn: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    width: 60,
    height: 60,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    marginBottom: 18,
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 6,
  },
  callBtnDisabled: { backgroundColor: colors.panel, shadowOpacity: 0 },
});
