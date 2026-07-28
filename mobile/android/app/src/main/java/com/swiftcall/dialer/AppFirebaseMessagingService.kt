package com.swiftcall.dialer

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import com.google.firebase.messaging.RemoteMessage
import com.telnyx.react_voice_commons.TelnyxFirebaseMessagingService

/**
 * One FCM sender project, two kinds of push: Telnyx's own (incoming calls,
 * handled entirely by the parent class) and ours (SMS/voicemail, sent by
 * api/webhook.php on the PHP backend). Android only allows a single
 * FirebaseMessagingService per app, so both have to go through here.
 */
class AppFirebaseMessagingService : TelnyxFirebaseMessagingService() {

    companion object {
        const val MESSAGES_CHANNEL_ID = "messages"
        private const val MESSAGES_NOTIFICATION_ID = 2001
    }

    override fun onCreate() {
        super.onCreate()
        createMessagesChannel()
    }

    private fun createMessagesChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                MESSAGES_CHANNEL_ID,
                "Text messages",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "New SMS and voicemail notifications"
                enableVibration(true)
            }
            val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            nm.createNotificationChannel(channel)
        }
    }

    // Telnyx's own service calls this for anything that isn't a voice push —
    // that's every SMS/voicemail notification api/webhook.php sends.
    override fun handleNonTelnyxMessage(remoteMessage: RemoteMessage) {
        val data = remoteMessage.data
        val type = data["type"] ?: return
        if (type != "sms" && type != "voicemail") return

        val title = remoteMessage.notification?.title ?: data["title"] ?: "New message"
        val body = remoteMessage.notification?.body ?: data["body"] ?: ""

        val openIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("open_type", type)
            putExtra("open_phone", data["phone"])
        }
        val pendingIntent = PendingIntent.getActivity(
            this,
            MESSAGES_NOTIFICATION_ID,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(this, MESSAGES_CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_email)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .build()

        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.notify((data["phone"] ?: type).hashCode(), notification)
    }

    // Rings the phone for the duration of the call — see RingtonePlayer for why
    // this can't just be a silent notification channel like the parent sets up.
    override fun handleTelnyxVoicePush(remoteMessage: RemoteMessage) {
        super.handleTelnyxVoicePush(remoteMessage)
        RingtonePlayer.start(applicationContext)
    }

    override fun handleTelnyxMissedCall(remoteMessage: RemoteMessage) {
        super.handleTelnyxMissedCall(remoteMessage)
        RingtonePlayer.stop()
    }
}
