package com.swiftcall.dialer

import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.media.AudioManager
import android.media.ToneGenerator
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.telnyx.react_voice_commons.TelnyxNotificationHelper

/**
 * Small grab-bag of native calling behaviours the JS side can't reach on
 * its own: real DTMF tones for the dial pad, the proximity screen-off a
 * real phone dialer has, stopping the ringtone from JS as an extra safety
 * net, and checking/opening the Android 14+ full-screen-intent permission
 * (without it the incoming-call notification silently downgrades to a
 * normal heads-up banner instead of waking the screen).
 */
class CallUtilsModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "CallUtils"

    private var toneGenerator: ToneGenerator? = null
    private var proximityWakeLock: PowerManager.WakeLock? = null
    private var previousAudioMode: Int? = null

    private fun toneFor(digit: String): Int? = when (digit) {
        "0" -> ToneGenerator.TONE_DTMF_0
        "1" -> ToneGenerator.TONE_DTMF_1
        "2" -> ToneGenerator.TONE_DTMF_2
        "3" -> ToneGenerator.TONE_DTMF_3
        "4" -> ToneGenerator.TONE_DTMF_4
        "5" -> ToneGenerator.TONE_DTMF_5
        "6" -> ToneGenerator.TONE_DTMF_6
        "7" -> ToneGenerator.TONE_DTMF_7
        "8" -> ToneGenerator.TONE_DTMF_8
        "9" -> ToneGenerator.TONE_DTMF_9
        "*" -> ToneGenerator.TONE_DTMF_S
        "#" -> ToneGenerator.TONE_DTMF_P
        else -> null
    }

    @ReactMethod
    fun playDtmfTone(digit: String) {
        val tone = toneFor(digit) ?: return
        try {
            val tg = toneGenerator ?: ToneGenerator(AudioManager.STREAM_DTMF, 70).also { toneGenerator = it }
            tg.startTone(tone, 120)
        } catch (_: Exception) {
            // Some devices refuse a second generator instance concurrently;
            // never let a UI tone crash the dial pad.
        }
    }

    @ReactMethod
    fun stopRingtone() {
        RingtonePlayer.stop()
    }

    // The ringtone and the visual incoming-call notification are two
    // separate things the SDK leaves running independently — a call that
    // ends before it's answered or declined through the notification's own
    // actions (e.g. the caller cancels) stops neither on its own, so the
    // banner is left stuck reading "Incoming Call" indefinitely.
    @ReactMethod
    fun dismissIncomingCallNotification() {
        try {
            TelnyxNotificationHelper.hideNotificationFromContext(reactApplicationContext)
        } catch (_: Exception) {
        }
    }

    @ReactMethod
    fun hasFullScreenIntentPermission(promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                val nm = reactApplicationContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                promise.resolve(nm.canUseFullScreenIntent())
            } else {
                promise.resolve(true)
            }
        } catch (e: Exception) {
            promise.resolve(true)
        }
    }

    @ReactMethod
    fun openFullScreenIntentSettings() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                val intent = Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT).apply {
                    data = Uri.parse("package:" + reactApplicationContext.packageName)
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK
                }
                reactApplicationContext.startActivity(intent)
            }
        } catch (_: Exception) {
        }
    }

    @Suppress("DEPRECATION")
    @ReactMethod
    fun acquireProximityWakeLock() {
        try {
            if (proximityWakeLock?.isHeld == true) return
            val pm = reactApplicationContext.getSystemService(Context.POWER_SERVICE) as PowerManager
            if (!pm.isWakeLockLevelSupported(PowerManager.PROXIMITY_SCREEN_OFF_WAKE_LOCK)) return
            val wl = pm.newWakeLock(PowerManager.PROXIMITY_SCREEN_OFF_WAKE_LOCK, "swiftcall:proximity")
            wl.acquire(10 * 60 * 1000L)
            proximityWakeLock = wl
        } catch (_: Exception) {
        }
    }

    @ReactMethod
    fun releaseProximityWakeLock() {
        try {
            proximityWakeLock?.let { if (it.isHeld) it.release() }
            proximityWakeLock = null
        } catch (_: Exception) {
        }
    }

    // react-native-webrtc captures audio fine on its own, but Android only
    // routes that through the device's hardware echo canceller / noise
    // suppression when the audio session is explicitly in "communication"
    // mode — left at the default MODE_NORMAL (a plain media-playback mode),
    // the mic picks up the earpiece output right back up, which is exactly
    // the loud echo reported during calls.
    @ReactMethod
    fun setCallAudioMode() {
        try {
            val am = reactApplicationContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
            if (previousAudioMode == null) previousAudioMode = am.mode
            am.mode = AudioManager.MODE_IN_COMMUNICATION
            am.isSpeakerphoneOn = false
        } catch (_: Exception) {
        }
    }

    @ReactMethod
    fun clearCallAudioMode() {
        try {
            val am = reactApplicationContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
            am.mode = previousAudioMode ?: AudioManager.MODE_NORMAL
            previousAudioMode = null
        } catch (_: Exception) {
        }
    }

    @ReactMethod
    fun setSpeakerphoneOn(on: Boolean) {
        try {
            val am = reactApplicationContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
            am.isSpeakerphoneOn = on
        } catch (_: Exception) {
        }
    }
}
