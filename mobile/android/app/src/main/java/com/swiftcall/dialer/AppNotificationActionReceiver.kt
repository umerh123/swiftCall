package com.swiftcall.dialer

import android.content.Context
import android.content.Intent
import com.telnyx.react_voice_commons.TelnyxNotificationActionReceiver

class AppNotificationActionReceiver : TelnyxNotificationActionReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        RingtonePlayer.stop()
    }
}
