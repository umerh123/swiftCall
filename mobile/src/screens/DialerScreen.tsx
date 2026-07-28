import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { CompositeScreenProps } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MainTabParamList, RootStackParamList } from '../navigation/types';
import { colors, radius, shadow } from '../theme';
import Screen from '../components/Screen';
import { TelnyxConnectionState } from '@telnyx/react-voice-commons-sdk';
import { voipClient } from '../voip/client';
import { useConnectionState } from '../voip/hooks';

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

export default function DialerScreen({ navigation }: Props) {
  const [digits, setDigits] = useState('');
  const connectionState = useConnectionState();
  const connected = connectionState === TelnyxConnectionState.CONNECTED;

  async function call() {
    const dest = digits.trim();
    if (!dest) return;
    if (!connected) {
      Alert.alert('Not connected', 'Your calling line is still connecting — try again in a moment.');
      return;
    }
    try {
      await voipClient.newCall(dest);
      navigation.navigate('Call');
    } catch (e: any) {
      Alert.alert('Could not call', e?.message || 'Something went wrong.');
    }
  }

  return (
    <Screen>
      <View style={styles.topBar}>
        <View style={styles.statusPill}>
          <View style={[styles.lamp, connected && styles.lampReady]} />
          <Text style={styles.statusText}>{connected ? 'Ready' : 'Connecting…'}</Text>
        </View>
        <TouchableOpacity
          style={styles.settingsBtn}
          onPress={() => navigation.navigate('Settings')}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.settingsBtnText}>⚙</Text>
        </TouchableOpacity>
      </View>

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
            <Text style={styles.backspaceText}>⌫</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.pad}>
        {KEYS.map(([num, letters]) => (
          <TouchableOpacity
            key={num}
            style={styles.key}
            activeOpacity={0.7}
            onPress={() => setDigits((d) => d + num)}
            onLongPress={() => num === '0' && setDigits((d) => d + '+')}
          >
            <Text style={styles.keyNum}>{num}</Text>
            <Text style={styles.keyLetters}>{letters || ' '}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity
        style={[styles.callBtn, !digits && styles.callBtnDisabled]}
        onPress={call}
        activeOpacity={0.85}
        disabled={!digits}
      >
        <Text style={styles.callBtnIcon}>{'☎'}</Text>
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
    paddingTop: 12,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.pill,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  lamp: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.textGhost },
  lampReady: {
    backgroundColor: colors.success,
    shadowColor: colors.success,
    shadowOpacity: 0.7,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
  },
  statusText: { color: colors.textMuted, fontSize: 12.5, fontWeight: '600' },
  settingsBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsBtnText: { fontSize: 17, color: colors.textMuted },
  displayWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 72,
    marginTop: 28,
    paddingHorizontal: 60,
  },
  display: {
    fontSize: 38,
    color: colors.text,
    fontWeight: '300',
    letterSpacing: 0.5,
    fontVariant: ['tabular-nums'],
  },
  backspace: { position: 'absolute', right: 24, padding: 8 },
  backspaceText: { fontSize: 22, color: colors.textMuted },
  pad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    paddingHorizontal: 22,
    marginTop: 8,
  },
  key: {
    width: '28%',
    aspectRatio: 1,
    margin: '2.66%',
    borderRadius: radius.pill,
    backgroundColor: colors.raised,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    alignItems: 'center',
    justifyContent: 'center',
    maxHeight: 74,
    ...shadow.card,
  },
  keyNum: { fontSize: 25, color: colors.text, fontWeight: '500' },
  keyLetters: { fontSize: 10, color: colors.textFaint, letterSpacing: 1.5, marginTop: 3 },
  callBtn: {
    backgroundColor: colors.success,
    borderRadius: radius.pill,
    width: 64,
    height: 64,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 22,
    marginBottom: 20,
    shadowColor: colors.success,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 6,
  },
  callBtnDisabled: { backgroundColor: colors.raised, shadowOpacity: 0 },
  callBtnIcon: { color: '#fff', fontSize: 26 },
});
