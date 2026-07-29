/**
 * @format
 */

import { AppRegistry } from 'react-native';
import { name as appName } from './app.json';

/** @react-native-community/netinfo (used transitively by the Telnyx SDK)
 *  decides once, the very first time it's imported, whether to use the
 *  TurboModule or legacy native module — and that decision is permanently
 *  cached:
 *
 *    const isTurboModuleEnabled = global.__turboModuleProxy != null;
 *
 *  Crashlytics showed this evaluating too early on real devices — before
 *  __turboModuleProxy is actually set — which makes it fall back to the
 *  legacy path, find nothing there (the module was only ever registered as
 *  a TurboModule, since newArchEnabled=true), and throw
 *  "NativeModule.RNCNetInfo is null" forever after for the rest of that
 *  session. That single failure was the common thread behind push-launched
 *  calls never syncing and the WebSocket closing unexpectedly mid-call.
 *
 *  App.tsx (and everything it transitively imports, including the Telnyx
 *  SDK chain that first touches netinfo) is only required once this
 *  resolves, so that first import happens once native modules are
 *  confirmed ready — not whenever Metro happens to reach it. */
function nativeModulesReady() {
  return typeof global !== 'undefined' && global.__turboModuleProxy != null;
}

function bootstrap(attempt = 0) {
  if (!nativeModulesReady() && attempt < 50) {
    setTimeout(() => bootstrap(attempt + 1), 20);
    return;
  }

  const crashlytics = require('@react-native-firebase/crashlytics').default;
  const App = require('./App').default;

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
}

bootstrap();
