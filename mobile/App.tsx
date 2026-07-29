import 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import { AppState, StatusBar } from 'react-native';
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
import { onPushProcessingStarted, onPushProcessingCompleted, watchConnectionAndCallState } from './src/voip/pushCallDiagnostics';
import { recoverPushLaunchedCall } from './src/voip/pushCallRecovery';

enableScreens();

function App() {
  useEffect(() => {
    // Started first, before anything else in this effect — the whole point
    // is to read the pending push data before TelnyxVoiceApp's own ~100ms
    // timer does (see pushCallRecovery.ts for why that timer reliably
    // fails). Fire-and-forget: it owns its own login attempt and fallback.
    recoverPushLaunchedCall();

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
    const stopDiagnostics = watchConnectionAndCallState();

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
      stopDiagnostics();
      appStateSub.remove();
    };
  }, []);

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
        <SafeAreaProvider>
          <StatusBar barStyle="light-content" backgroundColor={colors.bg} />
          <TelnyxVoiceApp
            voipClient={voipClient}
            enableAutoReconnect={false}
            debug={__DEV__}
            onPushNotificationProcessingStarted={onPushProcessingStarted}
            onPushNotificationProcessingCompleted={onPushProcessingCompleted}
          >
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
