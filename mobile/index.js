/**
 * @format
 */

import { AppRegistry } from 'react-native';
import crashlytics from '@react-native-firebase/crashlytics';
import App from './App';
import { name as appName } from './app.json';

// ErrorBoundary (in App.tsx) only catches errors thrown while rendering —
// this catches everything else (async code, event handlers, native module
// callbacks), which is where the actual crashes have come from so far.
// Logging instead of letting it reach the default handler is what stops a
// single bad response/state from taking the whole app down in a release
// build, where there's no red-screen dev overlay to fall back on.
if (typeof ErrorUtils !== 'undefined') {
  const previousHandler = ErrorUtils.getGlobalHandler();
  ErrorUtils.setGlobalHandler((error, isFatal) => {
    console.warn('Unhandled global error:', error, 'fatal:', isFatal);
    try {
      crashlytics().recordError(error instanceof Error ? error : new Error(String(error)));
    } catch {}
    if (!isFatal) return;
    previousHandler(error, isFatal);
  });
}

AppRegistry.registerComponent(appName, () => App);
