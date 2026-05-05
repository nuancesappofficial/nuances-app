import Foundation
import UIKit
import Vision
import React

@objc(VisionOCRModule)
class VisionOCRModule: NSObject {
  @objc
  static func requiresMainQueueSetup() -> Bool {
    return false
  }

  @objc(recognizeText:options:resolver:rejecter:)
  func recognizeText(
    imageUri: String,
    options: NSDictionary?,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.global(qos: .userInitiated).async {
      do {
        guard let image = self.loadImage(from: imageUri), let cgImage = image.cgImage else {
          reject("VISION_OCR_IMAGE_LOAD_FAILED", "Unable to load image for OCR", nil)
          return
        }

        let imageWidth = CGFloat(cgImage.width)
        let imageHeight = CGFloat(cgImage.height)
        let request = VNRecognizeTextRequest { request, error in
          if let error = error {
            reject("VISION_OCR_FAILED", error.localizedDescription, error)
            return
          }

          let observations = (request.results as? [VNRecognizedTextObservation]) ?? []
          var blocks: [[String: Any]] = []
          var lines: [String] = []

          for observation in observations {
            guard let candidate = observation.topCandidates(1).first else { continue }
            let text = candidate.string.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !text.isEmpty else { continue }

            let box = observation.boundingBox
            let frame: [String: Any] = [
              "x": box.origin.x * imageWidth,
              "y": (1.0 - box.origin.y - box.height) * imageHeight,
              "width": box.width * imageWidth,
              "height": box.height * imageHeight,
            ]

            blocks.append([
              "text": text,
              "confidence": Double(candidate.confidence),
              "frame": frame,
            ])
            lines.append(text)
          }

          resolve([
            "fullText": lines.joined(separator: "\n"),
            "blocks": blocks,
            "imageWidth": imageWidth,
            "imageHeight": imageHeight,
          ])
        }

        request.recognitionLevel = .accurate
        request.usesLanguageCorrection = (options?["usesLanguageCorrection"] as? Bool) ?? false
        if #available(iOS 16.0, *) {
          request.automaticallyDetectsLanguage = (options?["automaticallyDetectsLanguage"] as? Bool) ?? true
        }
        if let languages = options?["languages"] as? [String], !languages.isEmpty {
          request.recognitionLanguages = languages
        }

        let handler = VNImageRequestHandler(cgImage: cgImage, orientation: self.cgImagePropertyOrientation(for: image.imageOrientation), options: [:])
        try handler.perform([request])
      } catch {
        reject("VISION_OCR_FAILED", error.localizedDescription, error)
      }
    }
  }

  private func loadImage(from uri: String) -> UIImage? {
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

  private func cgImagePropertyOrientation(for orientation: UIImage.Orientation) -> CGImagePropertyOrientation {
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
