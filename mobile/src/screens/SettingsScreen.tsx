import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, Platform } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { colors, radius, shadow } from '../theme';
import Avatar from '../components/Avatar';
import Icon from '../components/Icon';
import { getServerUrl, getUser, clearSession, UserProfile } from '../storage/settings';
import * as api from '../api/client';
import { voipClient } from '../voip/client';
import { unregisterCurrentToken } from '../push/push';
import CallUtils from '../native/CallUtils';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

export default function SettingsScreen({ navigation }: Props) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [serverUrl, setServerUrlState] = useState('');
  const [busy, setBusy] = useState(false);
  const [fullScreenGranted, setFullScreenGranted] = useState(true);

  useEffect(() => {
    (async () => {
      setUser(await getUser());
      setServerUrlState((await getServerUrl()) || '');
      if (Platform.OS === 'android') {
        setFullScreenGranted(await CallUtils.hasFullScreenIntentPermission());
      }
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

  const displayName = user?.display_name || user?.username || '';

  return (
    <View style={styles.container}>
      <View style={styles.profileCard}>
        <Avatar name={displayName} size={56} />
        <View style={styles.profileText}>
          <Text style={styles.profileName}>{displayName}</Text>
          {!!user?.phone_number && <Text style={styles.profilePhone}>{user.phone_number}</Text>}
          {!!user?.role && <Text style={styles.profileRole}>{user.role}</Text>}
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Server</Text>
        <Text style={styles.value}>{serverUrl}</Text>
      </View>

      {!fullScreenGranted && (
        <TouchableOpacity
          style={styles.warnCard}
          activeOpacity={0.85}
          onPress={() => CallUtils.openFullScreenIntentSettings()}
        >
          <Icon name="cellphone-arrow-down" size={20} color={colors.warn} />
          <View style={styles.warnText}>
            <Text style={styles.warnTitle}>Incoming calls won't wake your phone</Text>
            <Text style={styles.warnBody}>Android is blocking full-screen call alerts for this app. Tap to enable them.</Text>
          </View>
          <Icon name="chevron-right" size={18} color={colors.textFaint} />
        </TouchableOpacity>
      )}

      <TouchableOpacity style={styles.signOutBtn} activeOpacity={0.85} onPress={confirmSignOut} disabled={busy}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.signOutText}>Sign out</Text>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: 20 },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.xl,
    padding: 16,
    marginBottom: 12,
    ...shadow.card,
  },
  profileText: { flex: 1, minWidth: 0 },
  profileName: { color: colors.text, fontSize: 18, fontWeight: '600' },
  profilePhone: { color: colors.textMuted, fontSize: 14, marginTop: 2 },
  profileRole: { color: colors.accent, fontSize: 12, fontWeight: '600', marginTop: 4, textTransform: 'capitalize' },
  card: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: 16,
    marginBottom: 12,
  },
  label: { color: colors.textFaint, fontSize: 11.5, textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: '600' },
  value: { color: colors.text, fontSize: 15, fontWeight: '600', marginTop: 5 },
  warnCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(217, 119, 6, .10)',
    borderWidth: 1,
    borderColor: 'rgba(217, 119, 6, .3)',
    borderRadius: radius.lg,
    padding: 14,
    marginBottom: 12,
  },
  warnText: { flex: 1 },
  warnTitle: { color: colors.text, fontSize: 13.5, fontWeight: '700' },
  warnBody: { color: colors.textMuted, fontSize: 12, marginTop: 3, lineHeight: 16 },
  signOutBtn: {
    backgroundColor: colors.danger,
    borderRadius: radius.lg,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12,
  },
  signOutText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
