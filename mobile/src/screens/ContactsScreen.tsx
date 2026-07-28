import React, { useCallback, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, TextInput, Alert } from 'react-native';
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
  BottomTabScreenProps<MainTabParamList, 'Contacts'>,
  NativeStackScreenProps<RootStackParamList>
>;

export default function ContactsScreen({ navigation }: Props) {
  const [contacts, setContacts] = useState<api.Contact[]>([]);
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
    <View style={styles.container}>
      <Text style={styles.header}>Contacts</Text>

      <View style={styles.addBox}>
        <TextInput
          style={styles.input}
          placeholder="Name (optional)"
          placeholderTextColor={colors.textMuted}
          value={name}
          onChangeText={setName}
        />
        <TextInput
          style={styles.input}
          placeholder="Phone number"
          placeholderTextColor={colors.textMuted}
          keyboardType="phone-pad"
          value={phone}
          onChangeText={setPhone}
        />
        <TouchableOpacity style={styles.addBtn} onPress={addContact} disabled={saving}>
          <Text style={styles.addBtnText}>Add contact</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={contacts}
        keyExtractor={(c) => String(c.id)}
        ListEmptyComponent={<Text style={styles.empty}>No contacts yet.</Text>}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <TouchableOpacity style={styles.rowMain} onPress={() => callContact(item)}>
              <Text style={styles.name}>{item.display}</Text>
              <Text style={styles.meta}>{item.phone}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.msgBtn}
              onPress={() => navigation.navigate('Thread', { phone: item.phone, display: item.display })}
            >
              <Text style={styles.msgBtnText}>✉</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.deleteBtn} onPress={() => removeContact(item)}>
              <Text style={styles.deleteBtnText}>✕</Text>
            </TouchableOpacity>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { color: colors.text, fontSize: 28, fontWeight: '700', padding: 20, paddingBottom: 8 },
  addBox: { paddingHorizontal: 20, marginBottom: 12, gap: 8 },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: colors.text,
  },
  addBtn: { backgroundColor: colors.accent, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  addBtnText: { color: '#fff', fontWeight: '600' },
  empty: { color: colors.textMuted, textAlign: 'center', marginTop: 40 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 8,
  },
  rowMain: { flex: 1 },
  name: { color: colors.text, fontSize: 16, fontWeight: '600' },
  meta: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  msgBtn: { padding: 8 },
  msgBtnText: { color: colors.accent, fontSize: 18 },
  deleteBtn: { padding: 8 },
  deleteBtnText: { color: colors.danger, fontSize: 16 },
});
