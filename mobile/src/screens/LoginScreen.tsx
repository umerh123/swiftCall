import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { colors, radius, shadow } from '../theme';
import Icon from '../components/Icon';
import { TelnyxVoipClient } from '@telnyx/react-voice-commons-sdk';
import * as api from '../api/client';
import { getServerUrl, setServerUrl, setToken, setUser, getUser, getToken } from '../storage/settings';
import { bootVoip } from '../voip/boot';

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

export default function LoginScreen({ navigation }: Props) {
  const [serverUrl, setServerUrlField] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const [url, token, user] = await Promise.all([getServerUrl(), getToken(), getUser()]);
      if (url) setServerUrlField(url);
      if (token && user) {
        // A push-launched cold start is handled entirely by
        // pushCallRecovery.ts (started from App.tsx, before this even
        // resolves) instead of here — it needs to be the ONLY thing that
        // logs in for that case. A client created by bootVoip() first
        // would take priority and permanently block the call this launch
        // was for from ever being delivered (see that file for why).
        const launchedFromPush = await TelnyxVoipClient.isLaunchedFromPushNotification();
        if (!launchedFromPush) {
          await bootVoip();
        }
        navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
        return;
      }
      setLoading(false);
    })();
  }, []);

  async function onSubmit() {
    const url = serverUrl.trim().replace(/\/+$/, '');
    if (!/^https:\/\//.test(url)) {
      Alert.alert('Server address', 'Enter the full address, starting with https://');
      return;
    }
    if (!username.trim() || !password) {
      Alert.alert('Sign in', 'Enter your username and password.');
      return;
    }

    setBusy(true);
    try {
      await setServerUrl(url);
      const res = await api.login(username.trim(), password, `Android — ${Platform.OS}`);
      await setToken(res.token);
      await setUser(res.user);
      await bootVoip();
      navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
    } catch (e: any) {
      Alert.alert('Could not sign in', e?.message || 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.mark}>
          <Icon name="phone" size={22} color={colors.text} />
        </View>
        <Text style={styles.title}>Console</Text>
        <Text style={styles.subtitle}>Your line is private. Sign in to open it.</Text>

        <View style={styles.card}>
          <Text style={styles.label}>Server address</Text>
          <TextInput
            style={styles.input}
            placeholder="https://yourdomain.com/dialer"
            placeholderTextColor={colors.textFaint}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            value={serverUrl}
            onChangeText={setServerUrlField}
          />

          <Text style={styles.label}>Username</Text>
          <TextInput
            style={styles.input}
            placeholderTextColor={colors.textFaint}
            autoCapitalize="none"
            autoCorrect={false}
            value={username}
            onChangeText={setUsername}
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            placeholderTextColor={colors.textFaint}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />

          <TouchableOpacity style={styles.button} onPress={onSubmit} disabled={busy} activeOpacity={0.85}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sign in</Text>}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 24, paddingTop: 88, flexGrow: 1 },
  mark: {
    width: 52,
    height: 52,
    borderRadius: radius.lg,
    backgroundColor: colors.raised,
    borderWidth: 1,
    borderColor: colors.lineHot,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    ...shadow.card,
  },
  title: { color: colors.text, fontSize: 30, fontWeight: '700', letterSpacing: -0.5, marginBottom: 6 },
  subtitle: { color: colors.textMuted, fontSize: 14.5, marginBottom: 28 },
  card: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.xl,
    padding: 20,
    ...shadow.card,
  },
  label: { color: colors.textFaint, fontSize: 11.5, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 7, marginTop: 16 },
  input: {
    backgroundColor: colors.raised,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 15.5,
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 26,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
