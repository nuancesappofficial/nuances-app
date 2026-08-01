import ExpoModulesCore
import Foundation
import ImageIO
import UIKit
import Vision

private struct VisionOCROptions: Record {
  @Field var languages: [String] = []
  @Field var usesLanguageCorrection: Bool = false
  @Field var automaticallyDetectsLanguage: Bool = true
}

public final class NuancesVisionOCRModule: Module {
  public func definition() -> ModuleDefinition {
    Name("VisionOCR")

    AsyncFunction("recognizeText") {
      (imageUri: String, options: VisionOCROptions, promise: Promise) in
      DispatchQueue.global(qos: .userInitiated).async {
        do {
          guard let image = Self.loadImage(from: imageUri),
                let cgImage = image.cgImage else {
            promise.reject(
              "VISION_OCR_IMAGE_LOAD_FAILED",
              "Unable to load image for OCR"
            )
            return
          }

          let imageWidth = CGFloat(cgImage.width)
          let imageHeight = CGFloat(cgImage.height)
          let request = VNRecognizeTextRequest { request, error in
            if let error {
              promise.reject("VISION_OCR_FAILED", error.localizedDescription)
              return
            }

            let observations = (request.results as? [VNRecognizedTextObservation]) ?? []
            var blocks: [[String: Any]] = []
            var lines: [String] = []

            for observation in observations {
              let candidates = observation.topCandidates(3)
              guard let candidate = candidates.first else { continue }
              let text = candidate.string.trimmingCharacters(in: .whitespacesAndNewlines)
              guard !text.isEmpty else { continue }

              let box = observation.boundingBox
              blocks.append([
                "text": text,
                "confidence": Double(candidate.confidence),
                "candidates": candidates.compactMap { item -> [String: Any]? in
                  let candidateText = item.string.trimmingCharacters(in: .whitespacesAndNewlines)
                  guard !candidateText.isEmpty else { return nil }
                  return [
                    "text": candidateText,
                    "confidence": Double(item.confidence),
                  ]
                },
                "frame": [
                  "x": box.origin.x * imageWidth,
                  "y": (1.0 - box.origin.y - box.height) * imageHeight,
                  "width": box.width * imageWidth,
                  "height": box.height * imageHeight,
                ],
              ])
              lines.append(text)
            }

            promise.resolve([
              "fullText": lines.joined(separator: "\n"),
              "blocks": blocks,
              "imageWidth": imageWidth,
              "imageHeight": imageHeight,
            ])
          }

          request.recognitionLevel = .accurate
          request.usesLanguageCorrection = options.usesLanguageCorrection
          if #available(iOS 16.0, *) {
            request.automaticallyDetectsLanguage = options.automaticallyDetectsLanguage
          }
          if !options.languages.isEmpty {
            request.recognitionLanguages = options.languages
          }

          let handler = VNImageRequestHandler(
            cgImage: cgImage,
            orientation: Self.cgImagePropertyOrientation(for: image.imageOrientation),
            options: [:]
          )
          try handler.perform([request])
        } catch {
          promise.reject("VISION_OCR_FAILED", error.localizedDescription)
        }
      }
    }
  }

  private static func loadImage(from uri: String) -> UIImage? {
    let trimmed = uri.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return nil }

    if trimmed.hasPrefix("file://"), let url = URL(string: trimmed) {
      return UIImage(contentsOfFile: url.path)
    }
    if trimmed.hasPrefix("/") {
      return UIImage(contentsOfFile: trimmed)
    }
    if let url = URL(string: trimmed), let data = try? Data(contentsOf: url) {
      return UIImage(data: data)
    }
    return nil
  }

  private static func cgImagePropertyOrientation(
    for orientation: UIImage.Orientation
  ) -> CGImagePropertyOrientation {
    switch orientation {
    case .up: return .up
    case .down: return .down
    case .left: return .left
    case .right: return .right
    case .upMirrored: return .upMirrored
    case .downMirrored: return .downMirrored
    case .leftMirrored: return .leftMirrored
    case .rightMirrored: return .rightMirrored
    @unknown default: return .up
    }
  }
}
