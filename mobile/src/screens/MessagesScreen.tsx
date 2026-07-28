import React, { useCallback, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl, TextInput } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { CompositeScreenProps } from '@react-navigation/native';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MainTabParamList, RootStackParamList } from '../navigation/types';
import { colors, radius } from '../theme';
import Screen from '../components/Screen';
import Avatar from '../components/Avatar';
import * as api from '../api/client';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Messages'>,
  NativeStackScreenProps<RootStackParamList>
>;

export default function MessagesScreen({ navigation }: Props) {
  const [threads, setThreads] = useState<api.ThreadSummary[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [newNumber, setNewNumber] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await api.listThreads();
      setThreads(res.threads);
    } catch {
      // ignore — retry on next focus/pull
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  function openNew() {
    const phone = newNumber.trim();
    if (!phone) return;
    setNewNumber('');
    navigation.navigate('Thread', { phone, display: phone });
  }

  return (
    <Screen>
      <Text style={styles.header}>Messages</Text>

      <View style={styles.newRow}>
        <TextInput
          style={styles.newInput}
          placeholder="New message to…"
          placeholderTextColor={colors.textFaint}
          keyboardType="phone-pad"
          value={newNumber}
          onChangeText={setNewNumber}
          onSubmitEditing={openNew}
          returnKeyType="go"
        />
        <TouchableOpacity style={styles.newBtn} onPress={openNew} activeOpacity={0.8}>
          <Text style={styles.newBtnText}>Go</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={threads}
        keyExtractor={(t) => t.phone}
        contentContainerStyle={threads.length === 0 && styles.emptyList}
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
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>💬</Text>
            <Text style={styles.emptyText}>No messages yet</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.row}
            activeOpacity={0.6}
            onPress={() => navigation.navigate('Thread', { phone: item.phone, display: item.display })}
          >
            <Avatar name={item.display} size={44} />
            <View style={styles.rowMain}>
              <View style={styles.rowTop}>
                <Text style={[styles.name, item.unread > 0 && styles.nameUnread]} numberOfLines={1}>
                  {item.display}
                </Text>
              </View>
              <Text style={[styles.preview, item.unread > 0 && styles.previewUnread]} numberOfLines={1}>
                {item.last_direction === 'outbound' ? 'You: ' : ''}
                {item.last_body}
              </Text>
            </View>
            {item.unread > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{item.unread}</Text>
              </View>
            )}
          </TouchableOpacity>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { color: colors.text, fontSize: 28, fontWeight: '700', padding: 20, paddingBottom: 8, letterSpacing: -0.5 },
  newRow: { flexDirection: 'row', paddingHorizontal: 20, marginBottom: 12, gap: 8 },
  newInput: {
    flex: 1,
    backgroundColor: colors.raised,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: colors.text,
  },
  newBtn: { backgroundColor: colors.accent, borderRadius: radius.lg, paddingHorizontal: 18, justifyContent: 'center' },
  newBtnText: { color: '#fff', fontWeight: '600' },
  emptyList: { flexGrow: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyIcon: { fontSize: 32, opacity: 0.4 },
  emptyText: { color: colors.textMuted, fontSize: 14 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 12,
  },
  rowMain: { flex: 1, minWidth: 0 },
  rowTop: { flexDirection: 'row', alignItems: 'baseline' },
  name: { color: colors.textMuted, fontSize: 15.5, fontWeight: '600', flex: 1 },
  nameUnread: { color: colors.text },
  preview: { color: colors.textFaint, fontSize: 13, marginTop: 2 },
  previewUnread: { color: colors.textMuted },
  badge: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    minWidth: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
});
