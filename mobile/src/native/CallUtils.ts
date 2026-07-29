import { NativeModules, Platform } from 'react-native';

type CallUtilsModule = {
  playDtmfTone(digit: string): void;
  stopRingtone(): void;
  hasFullScreenIntentPermission(): Promise<boolean>;
  openFullScreenIntentSettings(): void;
  acquireProximityWakeLock(): void;
  releaseProximityWakeLock(): void;
};

const noop = () => {};
const native: CallUtilsModule | undefined = NativeModules.CallUtils;

/** Safe no-op fallback on iOS / if the native module ever fails to link,
 *  so nothing here can crash the JS thread the way an unlinked native
 *  module call normally would. */
const CallUtils: CallUtilsModule =
  Platform.OS === 'android' && native
    ? native
    : {
        playDtmfTone: noop,
        stopRingtone: noop,
        hasFullScreenIntentPermission: async () => true,
        openFullScreenIntentSettings: noop,
        acquireProximityWakeLock: noop,
        releaseProximityWakeLock: noop,
      };

export default CallUtils;
