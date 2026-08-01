package expo.modules.visionocr

import android.graphics.BitmapFactory
import android.net.Uri
import androidx.exifinterface.media.ExifInterface
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

class NuancesVisionOCRModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("VisionOCR")

    AsyncFunction("recognizeText") { imageUri: String, _: Map<String, Any?>, promise: Promise ->
      val context = appContext.reactContext
      if (context == null || imageUri.isBlank()) {
        promise.reject("VISION_OCR_IMAGE_LOAD_FAILED", "Unable to load image for OCR", null)
        return@AsyncFunction
      }

      try {
        val uri = when {
          imageUri.startsWith("content://") || imageUri.startsWith("file://") -> Uri.parse(imageUri)
          imageUri.startsWith("/") -> Uri.fromFile(File(imageUri))
          else -> throw IllegalArgumentException("Unsupported image URI")
        }
        val dimensions = context.contentResolver.openInputStream(uri).use { stream ->
          val options = BitmapFactory.Options().apply { inJustDecodeBounds = true }
          BitmapFactory.decodeStream(stream, null, options)
          if (options.outWidth <= 0 || options.outHeight <= 0) throw IllegalArgumentException("Invalid image")
          options.outWidth to options.outHeight
        }
        val rotation = context.contentResolver.openInputStream(uri).use { stream ->
          if (stream == null) 0 else when (ExifInterface(stream).rotationDegrees) {
            90 -> 90
            180 -> 180
            270 -> 270
            else -> 0
          }
        }
        val input = InputImage.fromFilePath(context, uri)
        TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS).process(input)
          .addOnSuccessListener { result ->
            val blocks = result.textBlocks.flatMap { block -> block.lines }.mapNotNull { line ->
              val value = line.text.trim()
              val box = line.boundingBox
              if (value.isEmpty() || box == null) null else mapOf(
                "text" to value,
                // ML Kit's Android Text API does not expose a recognition confidence here.
                "confidence" to 0.0,
                "frame" to mapOf(
                  "x" to box.left.toDouble(), "y" to box.top.toDouble(),
                  "width" to box.width().toDouble(), "height" to box.height().toDouble()
                )
              )
            }
            val (rawWidth, rawHeight) = dimensions
            val rotated = rotation == 90 || rotation == 270
            promise.resolve(mapOf(
              "fullText" to blocks.joinToString("\n") { it["text"] as String },
              "blocks" to blocks,
              "imageWidth" to (if (rotated) rawHeight else rawWidth).toDouble(),
              "imageHeight" to (if (rotated) rawWidth else rawHeight).toDouble()
            ))
          }
          .addOnFailureListener { promise.reject("VISION_OCR_FAILED", "Text recognition failed", it) }
      } catch (error: Exception) {
        promise.reject("VISION_OCR_IMAGE_LOAD_FAILED", "Unable to load image for OCR", error)
      }
    }
  }
}
