import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors } from './theme';

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Without this, any uncaught error thrown while rendering (a null
 * somewhere it wasn't expected, a bad response shape, anything) takes
 * the whole app down with it in a release build — there's no red-screen
 * dev overlay to fall back on like there is in development. This turns
 * that into a recoverable screen instead.
 */
export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.warn('Unhandled error caught by ErrorBoundary:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <View style={styles.container}>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.message}>{this.state.error.message}</Text>
          <TouchableOpacity style={styles.button} onPress={() => this.setState({ error: null })}>
            <Text style={styles.buttonText}>Try again</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { color: colors.text, fontSize: 20, fontWeight: '700', marginBottom: 8 },
  message: { color: colors.textMuted, fontSize: 14, textAlign: 'center', marginBottom: 24 },
  button: { backgroundColor: colors.accent, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 12 },
  buttonText: { color: '#fff', fontWeight: '600' },
});
