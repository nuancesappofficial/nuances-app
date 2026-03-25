import UIKit
import UniformTypeIdentifiers
import MobileCoreServices
import UserNotifications

class ShareViewController: UIViewController {
    private let appGroupID = "group.com.jeffenglishlearning.nuances"
    private let maxImageCount = 10
    private let maxTextLength = 2000
    private let maxImageEdge: CGFloat = 1920.0
    private let maxQueuedItems = 50
    private let resultLock = NSLock()
    private let finishLock = NSLock()
    private var didFinish = false

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .clear
        handleSharedContent()
    }

    private func handleSharedContent() {
        guard let extensionItems = extensionContext?.inputItems as? [NSExtensionItem],
              !extensionItems.isEmpty else {
            closeExtension()
            return
        }

        let attachments = extensionItems
            .compactMap { $0.attachments }
            .flatMap { $0 }

        guard !attachments.isEmpty else {
            closeExtension()
            return
        }

        let textAttachments = attachments.filter {
            $0.hasItemConformingToTypeIdentifier(UTType.plainText.identifier)
        }
        let imageAttachments = attachments.filter {
            $0.hasItemConformingToTypeIdentifier(UTType.image.identifier)
        }

        // 某些來源會同時附帶 plainText，圖片必須優先處理避免被吃掉
        if !imageAttachments.isEmpty {
            handleImageShare(imageAttachments)
        } else if !textAttachments.isEmpty {
            handleTextShare(textAttachments)
        } else {
            closeExtension()
        }
    }

    private func handleTextShare(_ attachments: [NSItemProvider]) {
        let limitedAttachments = Array(attachments.prefix(maxQueuedItems))
        var processedTexts: [String] = []
        let dispatchGroup = DispatchGroup()

        for attachment in limitedAttachments {
            dispatchGroup.enter()
            attachment.loadItem(forTypeIdentifier: UTType.plainText.identifier, options: nil) { [weak self] (data, error) in
                defer { dispatchGroup.leave() }
                guard let self = self else { return }
                if let error = error {
                    print("Error loading text: \(error)")
                    return
                }

                var textContent = ""
                if let text = data as? String {
                    textContent = text
                } else if let url = data as? URL, let text = try? String(contentsOf: url) {
                    textContent = text
                }

                if textContent.count > self.maxTextLength {
                    textContent = String(textContent.prefix(self.maxTextLength))
                }

                let normalized = textContent.trimmingCharacters(in: .whitespacesAndNewlines)
                if !normalized.isEmpty {
                    self.resultLock.lock()
                    processedTexts.append(normalized)
                    self.resultLock.unlock()
                }
            }
        }

        dispatchGroup.notify(queue: .main) { [weak self] in
            guard let self = self else { return }
            if processedTexts.isEmpty {
                self.closeExtension()
                return
            }
            for text in processedTexts {
                self.saveTextToSharedStorage(text)
            }
            self.notifyIngestSuccess(itemCount: processedTexts.count)
            self.closeExtension()
        }
    }

    private func handleImageShare(_ attachments: [NSItemProvider]) {
        let limitedAttachments = Array(attachments.prefix(maxImageCount))
        var processedImages: [String] = []
        let dispatchGroup = DispatchGroup()

        for attachment in limitedAttachments {
            dispatchGroup.enter()
            loadImageData(from: attachment) { [weak self] (imageData, error) in
                defer { dispatchGroup.leave() }
                guard let self = self else { return }
                if let error = error {
                    print("Error loading image: \(error)")
                    return
                }

                guard let originalData = imageData,
                      let image = UIImage(data: originalData) else {
                    return
                }

                if let compressedImage = self.compressAndResizeImage(image),
                   let jpegData = compressedImage.jpegData(compressionQuality: 0.85),
                   let savedPath = self.saveImageToSharedContainer(jpegData) {
                    self.resultLock.lock()
                    processedImages.append(savedPath)
                    self.resultLock.unlock()
                }
            }
        }

        dispatchGroup.notify(queue: .main) { [weak self] in
            guard let self = self else { return }
            if !processedImages.isEmpty {
                self.saveImagesToSharedStorage(processedImages)
                self.notifyIngestSuccess(itemCount: processedImages.count)
                self.closeExtension()
            } else {
                self.closeExtension()
            }
        }
    }

    private func loadImageData(from provider: NSItemProvider, completion: @escaping (Data?, Error?) -> Void) {
        if provider.canLoadObject(ofClass: UIImage.self) {
            provider.loadObject(ofClass: UIImage.self) { object, error in
                if let image = object as? UIImage, let data = image.jpegData(compressionQuality: 0.95) {
                    completion(data, nil)
                    return
                }
                if let error = error {
                    completion(nil, error)
                } else {
                    completion(nil, NSError(domain: "ShareExtension", code: -2, userInfo: [NSLocalizedDescriptionKey: "Unable to load UIImage"]))
                }
            }
            return
        }

        if provider.hasItemConformingToTypeIdentifier(UTType.image.identifier) {
            provider.loadFileRepresentation(forTypeIdentifier: UTType.image.identifier) { url, error in
                guard let url = url else {
                    completion(nil, error ?? NSError(domain: "ShareExtension", code: -3, userInfo: [NSLocalizedDescriptionKey: "Missing file URL"]))
                    return
                }
                do {
                    let data = try Data(contentsOf: url)
                    completion(data, nil)
                } catch {
                    completion(nil, error)
                }
            }
            return
        }

        provider.loadItem(forTypeIdentifier: UTType.image.identifier, options: nil) { item, error in
            if let url = item as? URL, let data = try? Data(contentsOf: url) {
                completion(data, nil)
                return
            }
            if let image = item as? UIImage, let data = image.jpegData(compressionQuality: 0.95) {
                completion(data, nil)
                return
            }
            if let data = item as? Data {
                completion(data, nil)
                return
            }
            completion(nil, error ?? NSError(domain: "ShareExtension", code: -4, userInfo: [NSLocalizedDescriptionKey: "Unsupported image payload"]))
        }
    }

    private func compressAndResizeImage(_ image: UIImage) -> UIImage? {
        let size = image.size
        let maxEdge = max(size.width, size.height)
        if maxEdge <= maxImageEdge {
            return image
        }
        let scale = maxImageEdge / maxEdge
        let newSize = CGSize(width: size.width * scale, height: size.height * scale)
        UIGraphicsBeginImageContextWithOptions(newSize, false, 1.0)
        image.draw(in: CGRect(origin: .zero, size: newSize))
        let resizedImage = UIGraphicsGetImageFromCurrentImageContext()
        UIGraphicsEndImageContext()
        return resizedImage
    }

    private func saveImageToSharedContainer(_ imageData: Data) -> String? {
        guard let containerURL = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupID) else {
            return nil
        }
        let sharedMediaDir = containerURL.appendingPathComponent("Library/Caches/SharedMedia", isDirectory: true)
        try? FileManager.default.createDirectory(at: sharedMediaDir, withIntermediateDirectories: true)
        let fileName = "\(UUID().uuidString).jpg"
        let fileURL = sharedMediaDir.appendingPathComponent(fileName)
        do {
            try imageData.write(to: fileURL)
            return fileURL.path
        } catch {
            print("Error saving image: \(error)")
            return nil
        }
    }

    private func readExistingItems(_ userDefaults: UserDefaults) -> [[String: Any]] {
        guard let existing = userDefaults.dictionary(forKey: "shared_content") else { return [] }
        if let items = existing["items"] as? [[String: Any]], !items.isEmpty { return items }
        if let type = existing["type"] as? String {
            if type == "text", let content = existing["content"] as? String {
                return [["type": "text", "content": content]]
            }
            if type == "image", let images = existing["images"] as? [String] {
                return [["type": "image", "images": images]]
            }
        }
        return []
    }

    private func writeItemsToSharedStorage(_ items: [[String: Any]]) {
        guard let userDefaults = UserDefaults(suiteName: appGroupID) else { return }
        let metadata: [String: Any] = [
            "items": items,
            "timestamp": Date().timeIntervalSince1970
        ]
        userDefaults.set(metadata, forKey: "shared_content")
        userDefaults.synchronize()
    }

    private func saveTextToSharedStorage(_ text: String) {
        guard let userDefaults = UserDefaults(suiteName: appGroupID) else { return }
        var items = readExistingItems(userDefaults)
        items.append(["type": "text", "content": text])
        let finalItems = Array(items.suffix(maxQueuedItems))
        writeItemsToSharedStorage(finalItems)
    }

    private func saveImagesToSharedStorage(_ imagePaths: [String]) {
        guard let userDefaults = UserDefaults(suiteName: appGroupID) else { return }
        var items = readExistingItems(userDefaults)
        items.append(["type": "image", "images": imagePaths])
        let finalItems = Array(items.suffix(maxQueuedItems))
        writeItemsToSharedStorage(finalItems)
    }

    private func notifyIngestSuccess(itemCount: Int) {
        guard itemCount > 0 else { return }
        let content = UNMutableNotificationContent()
        content.title = "Nuances"
        content.body = "已成功接收 \(itemCount) 筆分享內容"
        content.sound = .default

        let request = UNNotificationRequest(
            identifier: "share-ingest-\(UUID().uuidString)",
            content: content,
            trigger: nil
        )
        UNUserNotificationCenter.current().add(request)
    }

    private func closeExtension() {
        finishLock.lock()
        if didFinish {
            finishLock.unlock()
            return
        }
        didFinish = true
        finishLock.unlock()

        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.extensionContext?.completeRequest(returningItems: nil, completionHandler: nil)
        }
    }
}
