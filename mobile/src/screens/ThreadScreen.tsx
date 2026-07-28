import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { colors, radius } from '../theme';
import * as api from '../api/client';

type Props = NativeStackScreenProps<RootStackParamList, 'Thread'>;

export default function ThreadScreen({ route, navigation }: Props) {
  const { phone } = route.params;
  const [messages, setMessages] = useState<api.MessageRecord[]>([]);
  const [display, setDisplay] = useState(route.params.display);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList>(null);

  useEffect(() => {
    navigation.setOptions({ title: display });
  }, [display]);

  const load = useCallback(async () => {
    try {
      const res = await api.getThread(phone);
      setMessages(res.messages);
      setDisplay(res.display);
    } catch {
      // ignore — the person can pull to retry (see MessagesScreen list)
    }
  }, [phone]);

  useFocusEffect(
    useCallback(() => {
      load();
      const interval = setInterval(load, 5000);
      return () => clearInterval(interval);
    }, [load])
  );

  async function send() {
    const body = text.trim();
    if (!body || sending) return;
    setText('');
    setSending(true);
    try {
      await api.sendMessage(phone, body);
      await load();
    } catch (e: any) {
      Alert.alert('Could not send', e?.message || 'Something went wrong.');
    } finally {
      setSending(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => String(m.id)}
        contentContainerStyle={styles.list}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        renderItem={({ item }) => (
          <View style={[styles.bubbleRow, item.direction === 'outbound' && styles.bubbleRowOut]}>
            <View style={[styles.bubble, item.direction === 'outbound' ? styles.bubbleOut : styles.bubbleIn]}>
              <Text style={styles.bubbleText}>{item.body}</Text>
            </View>
          </View>
        )}
      />
      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          placeholder="Message"
          placeholderTextColor={colors.textMuted}
          value={text}
          onChangeText={setText}
          multiline
        />
        <TouchableOpacity style={styles.sendBtn} onPress={send} disabled={sending}>
          <Text style={styles.sendBtnText}>Send</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  list: { padding: 16, flexGrow: 1 },
  bubbleRow: { flexDirection: 'row', marginBottom: 6 },
  bubbleRowOut: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '78%', borderRadius: radius.xl, paddingHorizontal: 14, paddingVertical: 9 },
  bubbleIn: { backgroundColor: colors.bubbleIn, borderBottomLeftRadius: 4 },
  bubbleOut: { backgroundColor: colors.bubbleOut, borderBottomRightRadius: 4 },
  bubbleText: { color: colors.text, fontSize: 15, lineHeight: 20 },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.panel,
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: colors.raised,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.xl,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: colors.text,
    maxHeight: 120,
  },
  sendBtn: { backgroundColor: colors.accent, borderRadius: radius.xl, paddingHorizontal: 16, paddingVertical: 10 },
  sendBtnText: { color: '#fff', fontWeight: '600' },
});
