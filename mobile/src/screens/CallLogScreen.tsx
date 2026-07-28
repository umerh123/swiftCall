import React, { useCallback, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { CompositeScreenProps } from '@react-navigation/native';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MainTabParamList, RootStackParamList } from '../navigation/types';
import { colors } from '../theme';
import * as api from '../api/client';
import { voipClient } from '../voip/client';
import { TelnyxConnectionState } from '@telnyx/react-voice-commons-sdk';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Recents'>,
  NativeStackScreenProps<RootStackParamList>
>;

const DIRECTION_ICON: Record<string, string> = { inbound: '↙', outbound: '↗' };

export default function CallLogScreen({ navigation }: Props) {
  const [calls, setCalls] = useState<api.CallRecord[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.listCalls();
      setCalls(res.calls);
    } catch (e: any) {
      // Quietly ignore on this screen — the person will notice on retry.
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function callBack(phone: string) {
    if (voipClient.currentConnectionState !== TelnyxConnectionState.CONNECTED) {
      Alert.alert('Not connected', 'Your calling line is still connecting — try again in a moment.');
      return;
    }
    try {
      await voipClient.newCall(phone);
      navigation.navigate('Call');
    } catch (e: any) {
      Alert.alert('Could not call', e?.message || 'Something went wrong.');
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Recents</Text>
      <FlatList
        data={calls}
        keyExtractor={(c) => String(c.id)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.textMuted} />}
        ListEmptyComponent={<Text style={styles.empty}>No calls yet.</Text>}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.row} onPress={() => callBack(item.phone)}>
            <Text style={styles.dirIcon}>{DIRECTION_ICON[item.direction] || ''}</Text>
            <View style={styles.rowMain}>
              <Text style={styles.name}>{item.display}</Text>
              <Text style={styles.meta}>
                {item.status} · {new Date(item.created_at).toLocaleString()}
              </Text>
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { color: colors.text, fontSize: 28, fontWeight: '700', padding: 20, paddingBottom: 8 },
  empty: { color: colors.textMuted, textAlign: 'center', marginTop: 40 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dirIcon: { color: colors.textMuted, fontSize: 18, width: 28 },
  rowMain: { flex: 1 },
  name: { color: colors.text, fontSize: 16, fontWeight: '600' },
  meta: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
});
