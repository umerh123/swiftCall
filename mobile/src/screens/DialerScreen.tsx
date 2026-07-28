import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { CompositeScreenProps } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MainTabParamList, RootStackParamList } from '../navigation/types';
import { colors } from '../theme';
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

  async function call() {
    const dest = digits.trim();
    if (!dest) return;
    if (connectionState !== TelnyxConnectionState.CONNECTED) {
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
    <View style={styles.container}>
      <TouchableOpacity style={styles.settingsBtn} onPress={() => navigation.navigate('Settings')}>
        <Text style={styles.settingsBtnText}>⚙</Text>
      </TouchableOpacity>

      <View style={styles.displayWrap}>
        <Text style={styles.display} numberOfLines={1} adjustsFontSizeToFit>
          {digits || ' '}
        </Text>
        {digits.length > 0 && (
          <TouchableOpacity onPress={() => setDigits((d) => d.slice(0, -1))} style={styles.backspace}>
            <Text style={styles.backspaceText}>⌫</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.pad}>
        {KEYS.map(([num, letters]) => (
          <TouchableOpacity
            key={num}
            style={styles.key}
            onPress={() => setDigits((d) => d + num)}
            onLongPress={() => num === '0' && setDigits((d) => d + '+')}
          >
            <Text style={styles.keyNum}>{num}</Text>
            {!!letters && <Text style={styles.keyLetters}>{letters}</Text>}
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity style={styles.callBtn} onPress={call}>
        <Text style={styles.callBtnText}>Call</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingTop: 16 },
  settingsBtn: { position: 'absolute', top: 16, right: 16, zIndex: 1, padding: 8 },
  settingsBtnText: { fontSize: 22, color: colors.textMuted },
  displayWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 80,
    marginTop: 32,
  },
  display: { fontSize: 36, color: colors.text, fontWeight: '300' },
  backspace: { position: 'absolute', right: 24, padding: 8 },
  backspaceText: { fontSize: 22, color: colors.textMuted },
  pad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  key: {
    width: '30%',
    aspectRatio: 1,
    margin: '1.5%',
    borderRadius: 999,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    maxHeight: 76,
  },
  keyNum: { fontSize: 26, color: colors.text, fontWeight: '500' },
  keyLetters: { fontSize: 10, color: colors.textMuted, letterSpacing: 1, marginTop: 2 },
  callBtn: {
    backgroundColor: colors.success,
    borderRadius: 999,
    width: 72,
    height: 72,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    marginBottom: 24,
  },
  callBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
