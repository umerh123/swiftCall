import 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import { StatusBar } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { enableScreens } from 'react-native-screens';
import { TelnyxVoiceApp } from '@telnyx/react-voice-commons-sdk';
import { voipClient } from './src/voip/client';
import { navigationRef } from './src/navigation/navigationRef';
import RootNavigator from './src/navigation/RootNavigator';
import { watchTokenRefresh } from './src/push/push';
import { colors } from './src/theme';

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
    return () => {
      sub.unsubscribe();
      unwatch();
    };
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaProvider>
        <StatusBar barStyle="light-content" backgroundColor={colors.bg} />
        <TelnyxVoiceApp voipClient={voipClient} enableAutoReconnect debug={__DEV__}>
          <NavigationContainer ref={navigationRef}>
            <RootNavigator />
          </NavigationContainer>
        </TelnyxVoiceApp>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default App;
