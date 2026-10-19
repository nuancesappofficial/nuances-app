package expo.modules.androidshareintent

import android.app.Activity
import android.os.Bundle
import android.widget.Toast

class ShareReceiverActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    try {
      intent?.let { shareIntent ->
        val payloadId = ShareIntentProcessor.process(applicationContext, shareIntent)
        if (payloadId != null) {
          Toast.makeText(applicationContext, "Saved to Nuances", Toast.LENGTH_SHORT).show()
          AndroidShareIntentModule.notifySharedPayload(payloadId)
        }
      }
    } catch (_: Exception) {
      // Ignored: gracefully finish without crashing
    } finally {
      finish()
    }
  }
}
