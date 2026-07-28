import React, { useCallback, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl, TextInput, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { CompositeScreenProps } from '@react-navigation/native';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MainTabParamList, RootStackParamList } from '../navigation/types';
import { colors } from '../theme';
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
    <View style={styles.container}>
      <Text style={styles.header}>Messages</Text>

      <View style={styles.newRow}>
        <TextInput
          style={styles.newInput}
          placeholder="New message to…"
          placeholderTextColor={colors.textMuted}
          keyboardType="phone-pad"
          value={newNumber}
          onChangeText={setNewNumber}
          onSubmitEditing={openNew}
        />
        <TouchableOpacity style={styles.newBtn} onPress={openNew}>
          <Text style={styles.newBtnText}>Go</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={threads}
        keyExtractor={(t) => t.phone}
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
        ListEmptyComponent={<Text style={styles.empty}>No messages yet.</Text>}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.row}
            onPress={() => navigation.navigate('Thread', { phone: item.phone, display: item.display })}
          >
            <View style={styles.rowMain}>
              <Text style={styles.name}>{item.display}</Text>
              <Text style={styles.preview} numberOfLines={1}>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { color: colors.text, fontSize: 28, fontWeight: '700', padding: 20, paddingBottom: 8 },
  newRow: { flexDirection: 'row', paddingHorizontal: 20, marginBottom: 12, gap: 8 },
  newInput: {
    flex: 1,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: colors.text,
  },
  newBtn: { backgroundColor: colors.accent, borderRadius: 10, paddingHorizontal: 18, justifyContent: 'center' },
  newBtnText: { color: '#fff', fontWeight: '600' },
  empty: { color: colors.textMuted, textAlign: 'center', marginTop: 40 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowMain: { flex: 1 },
  name: { color: colors.text, fontSize: 16, fontWeight: '600' },
  preview: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  badge: {
    backgroundColor: colors.accent,
    borderRadius: 999,
    minWidth: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
});
