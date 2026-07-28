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
import { colors } from '../theme';
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
        // If the app was launched by tapping an incoming-call notification,
        // Telnyx's native layer is already logging in to handle that call —
        // calling bootVoip() here too would be the exact "double login"
        // race their SDK docs warn about, so skip it in that one case.
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
        <Text style={styles.title}>Console</Text>
        <Text style={styles.subtitle}>Your line is private. Sign in to open it.</Text>

        <Text style={styles.label}>Server address</Text>
        <TextInput
          style={styles.input}
          placeholder="https://yourdomain.com/dialer"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          value={serverUrl}
          onChangeText={setServerUrlField}
        />

        <Text style={styles.label}>Username</Text>
        <TextInput
          style={styles.input}
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          value={username}
          onChangeText={setUsername}
        />

        <Text style={styles.label}>Password</Text>
        <TextInput
          style={styles.input}
          placeholderTextColor={colors.textMuted}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        <TouchableOpacity style={styles.button} onPress={onSubmit} disabled={busy}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sign in</Text>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 24, paddingTop: 96 },
  title: { color: colors.text, fontSize: 32, fontWeight: '700', marginBottom: 8 },
  subtitle: { color: colors.textMuted, fontSize: 15, marginBottom: 32 },
  label: { color: colors.textMuted, fontSize: 13, marginBottom: 6, marginTop: 16 },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 16,
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 28,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
