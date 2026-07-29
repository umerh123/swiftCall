import 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import { AppState, Alert, Platform, StatusBar } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { enableScreens } from 'react-native-screens';
import { TelnyxConnectionState, TelnyxVoiceApp } from '@telnyx/react-voice-commons-sdk';
import { voipClient } from './src/voip/client';
import { bootVoip } from './src/voip/boot';
import { navigationRef } from './src/navigation/navigationRef';
import RootNavigator from './src/navigation/RootNavigator';
import { watchTokenRefresh } from './src/push/push';
import { getToken } from './src/storage/settings';
import { colors } from './src/theme';
import ErrorBoundary from './src/ErrorBoundary';
import { startRingGuard } from './src/voip/ringGuard';
import CallUtils from './src/native/CallUtils';

enableScreens();

function App() {
  useEffect(() => {
    // Every incoming call — whether the socket was already open or the app
    // just reconnected because a push notification woke it up — surfaces
    // here, so this is the one place that needs to jump to the call screen.
    const sub = voipClient.activeCall$.subscribe((call) => {
      if (call && navigationRef.isReady()) {
        navigationRef.navigate('Call');
      }
    });
    const unwatch = watchTokenRefresh();
    const stopRingGuard = startRingGuard();

    // Android 14+ silently downgrades incoming-call notifications to a
    // normal heads-up banner instead of waking the screen unless this is
    // explicitly granted — there's no way to request it like a normal
    // runtime permission, only send the person to the one Settings screen
    // that has the toggle, so ask plainly instead of hoping they find the
    // banner in Settings on their own.
    if (Platform.OS === 'android') {
      getToken().then(async (token) => {
        if (!token) return;
        const granted = await CallUtils.hasFullScreenIntentPermission();
        if (granted) return;
        Alert.alert(
          'Turn on full-screen calls',
          "Android is blocking this app from waking your screen for incoming calls. Without it, calls will only show a quiet notification. Tap Enable, then turn on \"Full screen notifications\" for SwiftCall.",
          [
            { text: 'Not now', style: 'cancel' },
            { text: 'Enable', onPress: () => CallUtils.openFullScreenIntentSettings() },
          ]
        );
      });
    }

    // TelnyxVoiceApp's own auto-reconnect is disabled below (it and our
    // bootVoip() both calling voipClient.login() at once is exactly the
    // "double login" race Telnyx's docs warn about), so reconnecting after
    // the app was backgrounded — which logs it out, see LoginScreen — is
    // on us too. Cold launch is handled separately, by LoginScreen.
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      if (voipClient.currentConnectionState === TelnyxConnectionState.CONNECTED) return;
      getToken().then((token) => {
        if (token) bootVoip();
      });
    });

    return () => {
      sub.unsubscribe();
      unwatch();
      stopRingGuard();
      appStateSub.remove();
    };
  }, []);

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
        <SafeAreaProvider>
          <StatusBar barStyle="light-content" backgroundColor={colors.bg} />
          <TelnyxVoiceApp voipClient={voipClient} enableAutoReconnect={false} debug={__DEV__}>
            <NavigationContainer ref={navigationRef}>
              <RootNavigator />
            </NavigationContainer>
          </TelnyxVoiceApp>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}

export default App;
