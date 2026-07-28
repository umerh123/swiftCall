import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { colors } from '../theme';
import { getServerUrl, getUser, clearSession, UserProfile } from '../storage/settings';
import * as api from '../api/client';
import { voipClient } from '../voip/client';
import { getFcmToken, unregisterCurrentToken } from '../push/push';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

export default function SettingsScreen({ navigation }: Props) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [serverUrl, setServerUrlState] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      setUser(await getUser());
      setServerUrlState((await getServerUrl()) || '');
    })();
  }, []);

  async function signOut() {
    setBusy(true);
    try {
      await unregisterCurrentToken().catch(() => {});
      await api.logout().catch(() => {});
      await voipClient.logout().catch(() => {});
      await clearSession();
      navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
    } finally {
      setBusy(false);
    }
  }

  function confirmSignOut() {
    Alert.alert('Sign out', 'You will need your username and password to sign back in.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: signOut },
    ]);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Settings</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Signed in as</Text>
        <Text style={styles.value}>{user?.display_name || user?.username}</Text>
        {!!user?.phone_number && <Text style={styles.sub}>{user.phone_number}</Text>}
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Server</Text>
        <Text style={styles.value}>{serverUrl}</Text>
      </View>

      <TouchableOpacity style={styles.signOutBtn} onPress={confirmSignOut} disabled={busy}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.signOutText}>Sign out</Text>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: 20 },
  header: { color: colors.text, fontSize: 28, fontWeight: '700', marginBottom: 20 },
  card: { backgroundColor: colors.card, borderRadius: 12, padding: 16, marginBottom: 12 },
  label: { color: colors.textMuted, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  value: { color: colors.text, fontSize: 17, fontWeight: '600', marginTop: 4 },
  sub: { color: colors.textMuted, fontSize: 14, marginTop: 2 },
  signOutBtn: {
    backgroundColor: colors.danger,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 24,
  },
  signOutText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
