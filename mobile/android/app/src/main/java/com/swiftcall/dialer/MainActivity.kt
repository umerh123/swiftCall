package com.swiftcall.dialer

import android.content.Intent
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import com.telnyx.react_voice_commons.TelnyxMainActivity

class MainActivity : TelnyxMainActivity() {

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "SwiftCallDialer"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

  // Every path a ringing call can end on — answered, rejected, or the
  // notification itself tapped — re-enters here, so this is the one place
  // that reliably stops the ringtone RingtonePlayer started.
  override fun onHandleIntent(intent: Intent) {
    super.onHandleIntent(intent)
    val action = intent.getStringExtra("action")
    if (action == "answer" || action == "reject" || action == "open_call") {
      RingtonePlayer.stop()
    }
  }
}
