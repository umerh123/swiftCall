import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, radius } from '../theme';
import Icon from './Icon';

interface Props {
  icon: string;
  label: string;
}

export default function EmptyState({ icon, label }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.badge}>
        <Icon name={icon} size={26} color={colors.textFaint} />
      </View>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  badge: {
    width: 64,
    height: 64,
    borderRadius: radius.xxl,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { color: colors.textMuted, fontSize: 14, fontWeight: '500' },
});
