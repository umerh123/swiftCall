import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { avatarColor, initials } from '../theme';

interface Props {
  name: string;
  size?: number;
}

export default function Avatar({ name, size = 44 }: Props) {
  return (
    <View
      style={[
        styles.avatar,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: avatarColor(name),
        },
      ]}
    >
      <Text style={[styles.text, { fontSize: size * 0.36 }]}>{initials(name)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 3,
  },
  text: { color: '#fff', fontWeight: '700', letterSpacing: 0.2 },
});
