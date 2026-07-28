import React, { useCallback, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl, Linking, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors } from '../theme';
import * as api from '../api/client';

export default function VoicemailScreen() {
  const [voicemails, setVoicemails] = useState<api.Voicemail[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.listVoicemails();
      setVoicemails(res.voicemails);
    } catch {
      // ignore — pull to retry
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function play(vm: api.Voicemail) {
    try {
      const url = await api.voicemailAudioUrl(vm.id);
      await Linking.openURL(url);
      if (!vm.listened) {
        api.markVoicemailRead(vm.id).catch(() => {});
        setVoicemails((list) => list.map((v) => (v.id === vm.id ? { ...v, listened: 1 } : v)));
      }
    } catch (e: any) {
      Alert.alert('Could not play', e?.message || 'Something went wrong.');
    }
  }

  function remove(vm: api.Voicemail) {
    Alert.alert('Delete voicemail', `Remove this voicemail from ${vm.display}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteVoicemail(vm.id);
            await load();
          } catch (e: any) {
            Alert.alert('Could not delete', e?.message || 'Something went wrong.');
          }
        },
      },
    ]);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Voicemail</Text>
      <FlatList
        data={voicemails}
        keyExtractor={(v) => String(v.id)}
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
        ListEmptyComponent={<Text style={styles.empty}>No voicemails.</Text>}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.row} onPress={() => play(item)}>
            {!item.listened && <View style={styles.dot} />}
            <View style={styles.rowMain}>
              <Text style={styles.name}>{item.display}</Text>
              <Text style={styles.meta}>
                {new Date(item.created_at).toLocaleString()} · {item.duration}s
              </Text>
            </View>
            <TouchableOpacity onPress={() => remove(item)} style={styles.deleteBtn}>
              <Text style={styles.deleteBtnText}>✕</Text>
            </TouchableOpacity>
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
    gap: 10,
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent },
  rowMain: { flex: 1 },
  name: { color: colors.text, fontSize: 16, fontWeight: '600' },
  meta: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  deleteBtn: { padding: 8 },
  deleteBtnText: { color: colors.danger, fontSize: 16 },
});
