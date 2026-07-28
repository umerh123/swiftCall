import React, { useCallback, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl, Linking, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors, radius } from '../theme';
import Screen from '../components/Screen';
import Avatar from '../components/Avatar';
import Icon from '../components/Icon';
import EmptyState from '../components/EmptyState';
import * as api from '../api/client';

function formatWhen(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

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
    <Screen>
      <Text style={styles.header}>Voicemail</Text>
      <FlatList
        data={voicemails}
        keyExtractor={(v) => String(v.id)}
        contentContainerStyle={voicemails.length === 0 && styles.emptyList}
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
        ListEmptyComponent={<EmptyState icon="voicemail" label="No voicemails" />}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.row} activeOpacity={0.6} onPress={() => play(item)}>
            <View>
              <Avatar name={item.display} size={44} />
              {!item.listened && <View style={styles.dot} />}
            </View>
            <View style={styles.rowMain}>
              <Text style={[styles.name, !item.listened && styles.nameUnread]} numberOfLines={1}>{item.display}</Text>
              <Text style={styles.meta}>
                {formatWhen(item.created_at)} · {item.duration}s
              </Text>
            </View>
            <View style={styles.playBtn}>
              <Icon name="play" size={14} color={colors.accent} />
            </View>
            <TouchableOpacity onPress={() => remove(item)} style={styles.deleteBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Icon name="trash-can-outline" size={17} color={colors.danger} />
            </TouchableOpacity>
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
    paddingVertical: 10,
    gap: 12,
  },
  dot: {
    position: 'absolute',
    top: -1,
    right: -1,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.accent,
    borderWidth: 2,
    borderColor: colors.bg,
  },
  rowMain: { flex: 1, minWidth: 0 },
  name: { color: colors.textMuted, fontSize: 15.5, fontWeight: '600' },
  nameUnread: { color: colors.text },
  meta: { color: colors.textFaint, fontSize: 12.5, marginTop: 2 },
  playBtn: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    backgroundColor: colors.accentWash,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBtnText: { color: colors.accent, fontSize: 11 },
  deleteBtn: { padding: 6 },
  deleteBtnText: { color: colors.danger, fontSize: 15 },
});
