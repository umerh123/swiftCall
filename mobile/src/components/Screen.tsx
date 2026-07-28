import React from 'react';
import { StyleSheet, ViewStyle } from 'react-native';
import { SafeAreaView, Edge } from 'react-native-safe-area-context';
import { colors } from '../theme';

interface Props {
  children: React.ReactNode;
  style?: ViewStyle;
  edges?: Edge[];
}

/** Every top-level tab screen renders without a header (headerShown: false),
 *  so nothing else accounts for the status bar — without this, content
 *  starts underneath it (the settings icon overlapping the clock). */
export default function Screen({ children, style, edges = ['top'] }: Props) {
  return <SafeAreaView style={[styles.container, style]} edges={edges}>{children}</SafeAreaView>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
});
