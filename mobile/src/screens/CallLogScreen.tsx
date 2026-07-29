import React, { useCallback, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { CompositeScreenProps } from '@react-navigation/native';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MainTabParamList, RootStackParamList } from '../navigation/types';
import { colors, radius } from '../theme';
import Screen from '../components/Screen';
import Avatar from '../components/Avatar';
import Icon from '../components/Icon';
import EmptyState from '../components/EmptyState';
import * as api from '../api/client';
import { voipClient } from '../voip/client';
import { TelnyxConnectionState } from '@telnyx/react-voice-commons-sdk';
import { normalizePhoneNumber } from '../utils/phone';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Recents'>,
  NativeStackScreenProps<RootStackParamList>
>;

const DIRECTION_ICON: Record<string, string> = { inbound: 'arrow-bottom-left', outbound: 'arrow-top-right' };
const STATUS_COLOR: Record<string, string> = { failed: colors.danger, missed: colors.danger, completed: colors.textMuted };

function formatWhen(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

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
      await voipClient.newCall(normalizePhoneNumber(phone));
      navigation.navigate('Call');
    } catch (e: any) {
      Alert.alert('Could not call', e?.message || 'Something went wrong.');
    }
  }

  return (
    <Screen>
      <Text style={styles.header}>Recents</Text>
      <FlatList
        data={calls}
        keyExtractor={(c) => String(c.id)}
        contentContainerStyle={calls.length === 0 && styles.emptyList}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
            tintColor={colors.textMuted}
          />
        }
        ListEmptyComponent={<EmptyState icon="history" label="No calls yet" />}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.row} activeOpacity={0.6} onPress={() => callBack(item.phone)}>
            <View>
              <Avatar name={item.display} size={44} />
              <View style={styles.dirBadge}>
                <Icon
                  name={DIRECTION_ICON[item.direction] || 'phone'}
                  size={10}
                  color={item.status === 'failed' || item.status === 'missed' ? colors.danger : colors.textMuted}
                />
              </View>
            </View>
            <View style={styles.rowMain}>
              <Text style={styles.name} numberOfLines={1}>{item.display}</Text>
              <Text style={[styles.meta, item.status in STATUS_COLOR && { color: STATUS_COLOR[item.status] }]}>
                {item.status}
              </Text>
            </View>
            <Text style={styles.time}>{formatWhen(item.created_at)}</Text>
            <View style={styles.callAgainBtn}>
              <Icon name="phone-outline" size={16} color={colors.accent} />
            </View>
          </TouchableOpacity>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { color: colors.text, fontSize: 28, fontWeight: '700', padding: 20, paddingBottom: 8, letterSpacing: -0.5 },
  emptyList: { flexGrow: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  emptyText: { color: colors.textMuted, fontSize: 14 },
  separator: { height: 1, backgroundColor: colors.lineSoft, marginLeft: 76 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 12,
  },
  dirBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: radius.pill,
    backgroundColor: colors.panel,
    borderWidth: 2,
    borderColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowMain: { flex: 1, minWidth: 0 },
  name: { color: colors.text, fontSize: 15.5, fontWeight: '600' },
  meta: { color: colors.textFaint, fontSize: 12.5, marginTop: 2, textTransform: 'capitalize' },
  time: { color: colors.textFaint, fontSize: 12, marginRight: 4 },
  callAgainBtn: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    backgroundColor: colors.accentWash,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
