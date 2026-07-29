/**
 * @format
 */

import { AppRegistry } from 'react-native';
import { name as appName } from './app.json';
import Bootstrap from './Bootstrap';

// AppRegistry.registerComponent MUST run synchronously right here — the
// native side calls into the app almost immediately after the bundle
// finishes loading, and if it isn't registered by then Android throws
// "X has not been registered" and the app never gets past a black screen.
// Bootstrap is the thing that's actually allowed to wait (see Bootstrap.tsx)
// — it defers requiring App.tsx, not this registration.
AppRegistry.registerComponent(appName, () => Bootstrap);
