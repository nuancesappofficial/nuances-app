package expo.modules.androidshareintent

import android.content.Context
import android.content.Intent
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.lang.ref.WeakReference

class AndroidShareIntentModule : Module() {
  companion object {
    private var activeInstanceRef: WeakReference<AndroidShareIntentModule>? = null

    fun notifySharedPayload(payloadId: String) {
      activeInstanceRef?.get()?.sendEvent("onSharedPayload", mapOf("id" to payloadId))
    }
  }

  override fun definition() = ModuleDefinition {
    Name("AndroidShareIntent")
    Events("onSharedPayload")

    OnCreate {
      activeInstanceRef = WeakReference(this@AndroidShareIntentModule)
      appContext.currentActivity?.intent?.let { intent ->
        Thread { receiveIntent(intent) }.start()
      }
    }

    OnActivityEntersForeground {
      activeInstanceRef = WeakReference(this@AndroidShareIntentModule)
      appContext.currentActivity?.intent?.let { intent ->
        Thread { receiveIntent(intent) }.start()
      }
    }

    OnNewIntent { intent ->
      Thread { receiveIntent(intent) }.start()
    }

    OnDestroy {
      if (activeInstanceRef?.get() === this@AndroidShareIntentModule) {
        activeInstanceRef = null
      }
    }

    AsyncFunction("getPendingSharedPayloads") {
      val context = appContext.reactContext ?: return@AsyncFunction emptyList<Map<String, Any?>>()
      ShareIntentProcessor.readQueue(context).map { ShareIntentProcessor.jsonToMap(it) }
    }

    AsyncFunction("acknowledgeSharedPayloads") { ids: List<String> ->
      val context = appContext.reactContext ?: return@AsyncFunction false
      ShareIntentProcessor.removePayloads(context, ids.toSet(), false)
    }

    AsyncFunction("rejectSharedPayloads") { ids: List<String> ->
      val context = appContext.reactContext ?: return@AsyncFunction false
      ShareIntentProcessor.removePayloads(context, ids.toSet(), true)
    }

    AsyncFunction("setActiveUserId") { userId: String? ->
      val context = appContext.reactContext ?: return@AsyncFunction
      val prefs = ShareIntentProcessor.preferences(context)
      if (userId.isNullOrBlank()) {
        prefs.edit().remove(ShareIntentProcessor.ACTIVE_USER).apply()
      } else {
        prefs.edit().putString(ShareIntentProcessor.ACTIVE_USER, userId.trim()).apply()
      }
    }
  }

  private fun receiveIntent(intent: Intent) {
    val context = appContext.reactContext ?: return
    val payloadId = ShareIntentProcessor.process(context, intent)
    if (payloadId != null) {
      sendEvent("onSharedPayload", mapOf("id" to payloadId))
    }
  }
}
