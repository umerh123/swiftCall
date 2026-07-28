package com.swiftcall.dialer

import android.content.Context
import android.media.AudioAttributes
import android.media.Ringtone
import android.media.RingtoneManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager

/**
 * The Telnyx SDK shows the incoming-call notification but deliberately
 * leaves the notification channel silent (it's built for a CallKit-style
 * platform that plays ringing itself, which Android has no equivalent of
 * here) — so without this, an "incoming call" is just a silent banner.
 * This plays the device's actual ringtone + vibration pattern for as long
 * as a call is ringing, the same way the stock Phone app does.
 */
object RingtonePlayer {
    private var ringtone: Ringtone? = null
    private var vibrator: Vibrator? = null
    private val stopHandler = Handler(Looper.getMainLooper())
    private var stopRunnable: Runnable? = null

    @Synchronized
    fun start(context: Context) {
        stop() // never overlap two rings

        try {
            val uri = RingtoneManager.getActualDefaultRingtoneUri(context, RingtoneManager.TYPE_RINGTONE)
            val r = RingtoneManager.getRingtone(context.applicationContext, uri)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                r.audioAttributes = AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build()
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                r.isLooping = true
            }
            r.play()
            ringtone = r
        } catch (_: Exception) {
            // Some devices/ROMs refuse to hand back a ringtone (silent
            // profile, no default set) — vibration below still gets the
            // user's attention, so this is not fatal.
        }

        try {
            val v = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val vm = context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager
                vm.defaultVibrator
            } else {
                @Suppress("DEPRECATION")
                context.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
            }
            val pattern = longArrayOf(0, 1000, 1000)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                v.vibrate(VibrationEffect.createWaveform(pattern, 0))
            } else {
                @Suppress("DEPRECATION")
                v.vibrate(pattern, 0)
            }
            vibrator = v
        } catch (_: Exception) {
        }

        // Pre-Android-P ringtones can't loop themselves and most phones
        // silently stop looping vibration after a while on custom ROMs —
        // a hard ceiling means a stuck ring can never outlast the call.
        val runnable = Runnable { stop() }
        stopRunnable = runnable
        stopHandler.postDelayed(runnable, 45_000L)
    }

    @Synchronized
    fun stop() {
        stopRunnable?.let { stopHandler.removeCallbacks(it) }
        stopRunnable = null
        try { ringtone?.stop() } catch (_: Exception) {}
        ringtone = null
        try { vibrator?.cancel() } catch (_: Exception) {}
        vibrator = null
    }
}
