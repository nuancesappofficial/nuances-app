package expo.modules.androidshareintent

import android.content.Context
import android.content.Intent
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Build
import android.os.Parcelable
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.security.MessageDigest
import java.util.UUID

object ShareIntentProcessor {
  const val PREFS = "nuances_android_share_intent"
  const val QUEUE = "pending_payloads"
  const val ACTIVE_USER = "active_user_id"
  private const val MAX_QUEUE = 50
  private const val MAX_IMAGES = 10
  private const val MAX_TEXT = 2000
  private const val MAX_IMAGE_BYTES = 20L * 1024L * 1024L
  private const val MAX_IMAGE_DIMENSION = 12000

  fun process(context: Context, intent: Intent): String? {
    val action = intent.action ?: return null
    val mime = intent.type?.lowercase() ?: return null
    if (action != Intent.ACTION_SEND && action != Intent.ACTION_SEND_MULTIPLE) return null
    if (mime != "text/plain" && !mime.startsWith("image/")) return null

    val owner = preferences(context).getString(ACTIVE_USER, null)
    val receivedAt = System.currentTimeMillis()
    val payload = when {
      action == Intent.ACTION_SEND && mime == "text/plain" -> {
        val text = intent.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString()?.trim()?.take(MAX_TEXT)
        if (text.isNullOrEmpty()) return null
        val id = stableId("text", owner, text)
        JSONObject().put("id", id).put("ownerUserId", owner ?: JSONObject.NULL)
          .put("receivedAt", receivedAt).put("type", "text").put("text", text)
      }
      mime.startsWith("image/") -> {
        val incoming = mutableListOf<Uri>()
        if (action == Intent.ACTION_SEND_MULTIPLE) {
          incoming.addAll(parcelableArrayList(intent, Intent.EXTRA_STREAM))
        } else {
          parcelable(intent, Intent.EXTRA_STREAM)?.let { incoming.add(it) }
        }
        if (incoming.isEmpty() && intent.clipData != null) {
          val clip = intent.clipData!!
          for (i in 0 until clip.itemCount) {
            clip.getItemAt(i).uri?.let { incoming.add(it) }
          }
        }
        val uris = incoming.distinctBy { it.toString() }.take(MAX_IMAGES)
        if (uris.isEmpty()) return null
        val id = "${UUID.randomUUID()}_$receivedAt"
        val copied = copyImages(context, owner, uris)
        if (copied.isEmpty()) return null
        JSONObject().put("id", id).put("ownerUserId", owner ?: JSONObject.NULL)
          .put("receivedAt", receivedAt).put("type", "image")
          .put("imageUris", JSONArray(copied))
      }
      else -> return null
    }

    synchronized(this) {
      val queue = readQueue(context).toMutableList()
      if (queue.any { it.optString("id") == payload.optString("id") }) return payload.optString("id")
      queue.add(payload)
      val retained = queue.takeLast(MAX_QUEUE)
      queue.dropLast(MAX_QUEUE).forEach(::deletePayloadFiles)
      writeQueue(context, retained)
    }

    intent.action = null
    intent.removeExtra(Intent.EXTRA_TEXT)
    intent.removeExtra(Intent.EXTRA_STREAM)
    return payload.optString("id")
  }

  fun readQueue(context: Context): List<JSONObject> = try {
    val array = JSONArray(preferences(context).getString(QUEUE, "[]"))
    (0 until array.length()).mapNotNull { array.optJSONObject(it) }
  } catch (_: Exception) {
    emptyList()
  }

  fun writeQueue(context: Context, queue: List<JSONObject>) {
    preferences(context).edit().putString(QUEUE, JSONArray(queue).toString()).apply()
  }

  fun removePayloads(context: Context, ids: Set<String>, deleteFiles: Boolean): Boolean = synchronized(this) {
    val queue = readQueue(context)
    val removed = queue.filter { ids.contains(it.optString("id")) }
    if (deleteFiles) removed.forEach(::deletePayloadFiles)
    writeQueue(context, queue.filterNot { ids.contains(it.optString("id")) })
    removed.isNotEmpty()
  }

  fun deletePayloadFiles(payload: JSONObject) {
    payload.optJSONArray("imageUris")?.let { array ->
      for (index in 0 until array.length()) {
        val uri = Uri.parse(array.optString(index))
        if (uri.scheme == "file") File(uri.path ?: "").delete()
      }
    }
  }

  fun preferences(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  private fun copyImages(context: Context, owner: String?, uris: List<Uri>): List<String> {
    val ownerDir = safeOwner(owner)
    val directory = File(context.filesDir, "SharedImages/$ownerDir").apply { mkdirs() }
    return uris.mapIndexedNotNull { index, uri ->
      try {
        if (context.contentResolver.getType(uri)?.lowercase()?.startsWith("image/") != true) return@mapIndexedNotNull null
        val descriptor = context.contentResolver.openAssetFileDescriptor(uri, "r") ?: return@mapIndexedNotNull null
        descriptor.use { if (it.length > MAX_IMAGE_BYTES) return@mapIndexedNotNull null }
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        context.contentResolver.openInputStream(uri).use { BitmapFactory.decodeStream(it, null, bounds) }
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0 ||
          bounds.outWidth > MAX_IMAGE_DIMENSION || bounds.outHeight > MAX_IMAGE_DIMENSION) return@mapIndexedNotNull null
        val extension = when (context.contentResolver.getType(uri)?.lowercase()) {
          "image/png" -> "png"
          "image/webp" -> "webp"
          else -> "jpg"
        }
        val uniqueId = "${UUID.randomUUID()}_${System.currentTimeMillis()}"
        val target = File(directory, "${uniqueId}_$index.$extension")
        context.contentResolver.openInputStream(uri).use { input ->
          if (input == null) return@mapIndexedNotNull null
          FileOutputStream(target).use { output ->
            val buffer = ByteArray(64 * 1024)
            var total = 0L
            while (true) {
              val count = input.read(buffer)
              if (count < 0) break
              total += count
              if (total > MAX_IMAGE_BYTES) throw IllegalArgumentException("Image too large")
              output.write(buffer, 0, count)
            }
          }
        }
        Uri.fromFile(target).toString()
      } catch (_: Exception) {
        null
      }
    }
  }

  fun jsonToMap(value: JSONObject): Map<String, Any?> = buildMap {
    put("id", value.optString("id"))
    put("receivedAt", value.optLong("receivedAt"))
    put("type", value.optString("type"))
    put("ownerUserId", if (value.isNull("ownerUserId")) null else value.optString("ownerUserId"))
    if (value.has("text")) put("text", value.optString("text"))
    value.optJSONArray("imageUris")?.let { array ->
      put("imageUris", (0 until array.length()).map { array.optString(it) })
    }
  }

  private fun stableId(type: String, owner: String?, body: String): String {
    val digest = MessageDigest.getInstance("SHA-256").digest("$type|${owner ?: "guest"}|$body".toByteArray())
    return digest.take(16).joinToString("") { "%02x".format(it) }
  }

  private fun safeOwner(owner: String?): String =
    owner?.replace(Regex("[^A-Za-z0-9_-]"), "_")?.take(80) ?: "unowned"

  @Suppress("DEPRECATION")
  private fun parcelable(intent: Intent, key: String): Uri? =
    if (Build.VERSION.SDK_INT >= 33) intent.getParcelableExtra(key, Uri::class.java)
    else intent.getParcelableExtra(key)

  @Suppress("DEPRECATION")
  private fun parcelableArrayList(intent: Intent, key: String): List<Uri> =
    if (Build.VERSION.SDK_INT >= 33) intent.getParcelableArrayListExtra(key, Uri::class.java) ?: emptyList()
    else intent.getParcelableArrayListExtra<Parcelable>(key)?.filterIsInstance<Uri>() ?: emptyList()
}
