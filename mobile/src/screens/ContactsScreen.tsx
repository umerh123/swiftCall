import React, { useCallback, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, TextInput, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { CompositeScreenProps } from '@react-navigation/native';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MainTabParamList, RootStackParamList } from '../navigation/types';
import { colors, radius, shadow } from '../theme';
import Screen from '../components/Screen';
import Avatar from '../components/Avatar';
import Icon from '../components/Icon';
import * as api from '../api/client';
import { voipClient } from '../voip/client';
import { TelnyxConnectionState } from '@telnyx/react-voice-commons-sdk';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Contacts'>,
  NativeStackScreenProps<RootStackParamList>
>;

export default function ContactsScreen({ navigation }: Props) {
  const [contacts, setContacts] = useState<api.Contact[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.listContacts();
      setContacts(res.contacts);
    } catch {
      // ignore — the list will pick up on next focus
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function addContact() {
    if (!phone.trim()) {
      Alert.alert('Add contact', 'Enter a phone number.');
      return;
    }
    setSaving(true);
    try {
      await api.saveContact(phone.trim(), name.trim(), '');
      setName('');
      setPhone('');
      setShowAdd(false);
      await load();
    } catch (e: any) {
      Alert.alert('Could not save', e?.message || 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  }

  function removeContact(c: api.Contact) {
    Alert.alert('Delete contact', `Remove ${c.display}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteContact(c.phone);
            await load();
          } catch (e: any) {
            Alert.alert('Could not delete', e?.message || 'Something went wrong.');
          }
        },
      },
    ]);
  }

  async function callContact(c: api.Contact) {
    if (voipClient.currentConnectionState !== TelnyxConnectionState.CONNECTED) {
      Alert.alert('Not connected', 'Your calling line is still connecting — try again in a moment.');
      return;
    }
    try {
      await voipClient.newCall(c.phone);
      navigation.navigate('Call');
    } catch (e: any) {
      Alert.alert('Could not call', e?.message || 'Something went wrong.');
    }
  }

  return (
    <Screen>
      <View style={styles.headerRow}>
        <Text style={styles.header}>Contacts</Text>
        <TouchableOpacity style={styles.addToggle} activeOpacity={0.8} onPress={() => setShowAdd((v) => !v)}>
          <Icon name={showAdd ? 'close' : 'plus'} size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {showAdd && (
        <View style={styles.addBox}>
          <TextInput
            style={styles.input}
            placeholder="Name (optional)"
            placeholderTextColor={colors.textFaint}
            value={name}
            onChangeText={setName}
          />
          <TextInput
            style={styles.input}
            placeholder="Phone number"
            placeholderTextColor={colors.textFaint}
            keyboardType="phone-pad"
            value={phone}
            onChangeText={setPhone}
          />
          <TouchableOpacity style={styles.addBtn} activeOpacity={0.85} onPress={addContact} disabled={saving}>
            <Text style={styles.addBtnText}>Save contact</Text>
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        data={contacts}
        keyExtractor={(c) => String(c.id)}
        contentContainerStyle={contacts.length === 0 && styles.emptyList}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Icon name="account-outline" size={34} color={colors.textFaint} />
            <Text style={styles.emptyText}>No contacts yet</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <TouchableOpacity style={styles.rowMain} activeOpacity={0.6} onPress={() => callContact(item)}>
              <Avatar name={item.display} size={44} />
              <View style={styles.rowText}>
                <Text style={styles.name} numberOfLines={1}>{item.display}</Text>
                <Text style={styles.meta}>{item.phone}</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => navigation.navigate('Thread', { phone: item.phone, display: item.display })}
            >
              <Text style={styles.iconBtnText}>✉</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconBtn} onPress={() => removeContact(item)}>
              <Text style={[styles.iconBtnText, styles.deleteText]}>✕</Text>
            </TouchableOpacity>
          </View>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8 },
  header: { color: colors.text, fontSize: 28, fontWeight: '700', letterSpacing: -0.5 },
  addToggle: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addToggleText: { color: '#fff', fontSize: 20, fontWeight: '600', lineHeight: 22 },
  addBox: {
    marginHorizontal: 20,
    marginBottom: 12,
    padding: 14,
    gap: 8,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    ...shadow.card,
  },
  input: {
    backgroundColor: colors.raised,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: colors.text,
  },
  addBtn: { backgroundColor: colors.accent, borderRadius: radius.md, paddingVertical: 12, alignItems: 'center' },
  addBtnText: { color: '#fff', fontWeight: '600' },
  emptyList: { flexGrow: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyIcon: { fontSize: 32, opacity: 0.4 },
  emptyText: { color: colors.textMuted, fontSize: 14 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    gap: 4,
  },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, minWidth: 0 },
  rowText: { flex: 1, minWidth: 0 },
  name: { color: colors.text, fontSize: 15.5, fontWeight: '600' },
  meta: { color: colors.textFaint, fontSize: 13, marginTop: 2 },
  iconBtn: { width: 34, height: 34, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  iconBtnText: { color: colors.accent, fontSize: 16 },
  deleteText: { color: colors.danger },
});
