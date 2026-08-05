enum ShareReceiptCopy {
    static func message(for language: String) -> String {
        switch language {
        case "zh-TW", "zh-CN": return "收到🫡"
        case "ja": return "またあとで"
        case "ko": return "이따 봐요"
        case "es": return "Nos vemos luego"
        case "fr": return "À plus tard"
        default: return "Catch you later"
        }
    }
}

import UIKit
import Social
import UniformTypeIdentifiers
import MobileCoreServices
import UserNotifications

class ShareViewController: UIViewController {
    
    private let appGroupID = "group.com.jeffenglishlearning.nuances.v2"
    private let maxImageCount = 10
    private let maxTextLength = 2000
    private let maxImageEdge: CGFloat = 1920.0
    private var didCloseExtension = false

    private let uiLanguageKey = "nuances_ui_language"
    
    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .clear
        handleSharedContent()
    }
    
    private func handleSharedContent() {
        // The share sheet must never remain on screen indefinitely, even when
        // an item provider or notification daemon fails to call back.
        scheduleCloseFallback(after: 15.0)

        guard let extensionItems = extensionContext?.inputItems as? [NSExtensionItem],
              !extensionItems.isEmpty else {
            self.closeExtension(success: false)
            return
        }

        let attachments = extensionItems
            .compactMap { $0.attachments }
            .flatMap { $0 }

        guard !attachments.isEmpty else {
            self.closeExtension(success: false)
            return
        }
        
        NSLog("[NuancesShareExtension] attachments count: \(attachments.count)")

        // 判斷分享類型：文字/連結或圖片
        let textAttachments = attachments.filter {
            self.preferredTextTypeIdentifier(for: $0) != nil
        }
        let imageAttachments = attachments.filter {
            $0.canLoadObject(ofClass: UIImage.self) || self.preferredImageTypeIdentifier(for: $0) != nil
        }

        if !imageAttachments.isEmpty {
            handleImageShare(imageAttachments)
        } else if !textAttachments.isEmpty {
            handleTextShare(textAttachments)
        } else {
            self.closeExtension(success: false)
        }
    }
    
    // MARK: - 處理純文字分享
    private func handleTextShare(_ attachments: [NSItemProvider]) {
        let limitedAttachments = Array(attachments.prefix(maxQueuedItems))
        var processedTexts: [String] = []
        let processedTextsQueue = DispatchQueue(label: "com.nuances.shareExtension.processedTexts")
        let dispatchGroup = DispatchGroup()
        scheduleCloseFallback(after: 8.0)

        for attachment in limitedAttachments {
            guard let typeIdentifier = preferredTextTypeIdentifier(for: attachment) else {
                continue
            }
            dispatchGroup.enter()
            attachment.loadItem(forTypeIdentifier: typeIdentifier, options: nil) { [weak self] (data, error) in
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
                } else if let url = data as? URL {
                    textContent = url.absoluteString
                } else if let attributedText = data as? NSAttributedString {
                    textContent = attributedText.string
                }
                
                // 套用字數限制
                if textContent.count > self.maxTextLength {
                    textContent = String(textContent.prefix(self.maxTextLength))
                }
                
                let normalized = textContent.trimmingCharacters(in: .whitespacesAndNewlines)
                if !normalized.isEmpty {
                    processedTextsQueue.sync {
                        processedTexts.append(normalized)
                    }
                }
            }
        }

        dispatchGroup.notify(queue: .main) { [weak self] in
            guard let self = self else { return }
            let finalTexts = processedTextsQueue.sync { processedTexts }
            if finalTexts.isEmpty {
                self.closeExtension(success: false)
                return
            }

            let savedCount = finalTexts.reduce(into: 0) { count, text in
                if self.saveTextToSharedStorage(text) {
                    count += 1
                }
            }
            guard savedCount > 0 else {
                NSLog("[NuancesShareExtension] text was decoded but App Group storage was unavailable")
                self.closeExtension(success: false)
                return
            }
            NSLog("[NuancesShareExtension] saved text items: \(savedCount)")
            self.postNativeReceiptThenClose(success: true, acceptedCount: savedCount)
        }
    }
    
    // MARK: - 處理圖片分享
    private func handleImageShare(_ attachments: [NSItemProvider]) {
        let limitedAttachments = Array(attachments.prefix(maxImageCount))
        var processedImages: [String] = []
        let processedImagesQueue = DispatchQueue(label: "com.nuances.shareExtension.processedImages")
        let finalizationQueue = DispatchQueue(label: "com.nuances.shareExtension.imageFinalization")
        let dispatchGroup = DispatchGroup()
        var didFinalize = false

        let finalize: (String) -> Void = { [weak self] reason in
            finalizationQueue.async {
                guard let self = self, !didFinalize else { return }
                didFinalize = true
                let finalImages = processedImagesQueue.sync { processedImages }
                DispatchQueue.main.async {
                    if !finalImages.isEmpty {
                        guard self.saveImagesToSharedStorage(finalImages) else {
                            NSLog("[NuancesShareExtension] image was decoded but App Group storage was unavailable")
                            self.closeExtension(success: false)
                            return
                        }
                        NSLog("[NuancesShareExtension] saved image items: \(finalImages.count), reason: \(reason)")
                        self.postNativeReceiptThenClose(success: true, acceptedCount: finalImages.count)
                    } else {
                        NSLog("[NuancesShareExtension] no image items saved, reason: \(reason)")
                        self.closeExtension(success: false)
                    }
                }
            }
        }
        
        for attachment in limitedAttachments {
            dispatchGroup.enter()

            loadImageData(from: attachment, timeout: 10.0) { [weak self] imageData in
                defer { dispatchGroup.leave() }
                guard let self = self else { return }

                guard let originalData = imageData,
                      let image = UIImage(data: originalData) else {
                    NSLog("[NuancesShareExtension] image provider produced unsupported payload")
                    return
                }
                
                // 壓縮與轉檔（HEIC -> JPEG，並限制尺寸）
                if let compressedImage = self.compressAndResizeImage(image),
                   let jpegData = compressedImage.jpegData(compressionQuality: 0.85) {
                    if let savedPath = self.saveImageToSharedContainer(jpegData) {
                        processedImagesQueue.sync {
                            processedImages.append(savedPath)
                        }
                    }
                }
            }
        }
        
        dispatchGroup.notify(queue: .main) {
            finalize("all image providers completed")
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + (limitedAttachments.count > 1 ? 18.0 : 10.0)) {
            finalize("image pack timeout")
        }
    }

    private func loadImageData(from provider: NSItemProvider, timeout: TimeInterval, completion: @escaping (Data?) -> Void) {
        let completionLock = NSLock()
        var didComplete = false
        let completeOnce: (Data?) -> Void = { data in
            completionLock.lock()
            guard !didComplete else {
                completionLock.unlock()
                return
            }
            didComplete = true
            completionLock.unlock()
            completion(data)
        }

        DispatchQueue.global(qos: .utility).asyncAfter(deadline: .now() + timeout) {
            NSLog("[NuancesShareExtension] image provider timed out after \(timeout)s")
            completeOnce(nil)
        }

        if provider.canLoadObject(ofClass: UIImage.self) {
            provider.loadObject(ofClass: UIImage.self) { object, error in
                if let image = object as? UIImage, let data = image.jpegData(compressionQuality: 0.95) {
                    completeOnce(data)
                    return
                }
                if let error = error {
                    NSLog("[NuancesShareExtension] loadObject UIImage failed: \(error.localizedDescription)")
                }
                self.loadImageDataFromItemProvider(provider, typeIdentifier: self.preferredImageTypeIdentifier(for: provider), completion: completeOnce)
            }
            return
        }

        loadImageDataFromItemProvider(provider, typeIdentifier: preferredImageTypeIdentifier(for: provider), completion: completeOnce)
    }

    private func loadImageDataFromItemProvider(_ provider: NSItemProvider, typeIdentifier: String?, completion: @escaping (Data?) -> Void) {
        let identifier = typeIdentifier ?? UTType.image.identifier

        provider.loadFileRepresentation(forTypeIdentifier: identifier) { [weak self] url, fileError in
            if let url = url, let data = try? Data(contentsOf: url) {
                completion(data)
                return
            }

            if let fileError = fileError {
                NSLog("[NuancesShareExtension] loadFileRepresentation failed: \(fileError.localizedDescription)")
            }

            self?.loadImageItemData(from: provider, typeIdentifier: identifier, completion: completion)
        }
    }

    private func loadImageItemData(from provider: NSItemProvider, typeIdentifier: String, completion: @escaping (Data?) -> Void) {
        provider.loadItem(forTypeIdentifier: typeIdentifier, options: nil) { data, error in
            if let error = error {
                NSLog("[NuancesShareExtension] loadItem image failed: \(error.localizedDescription)")
                completion(nil)
                return
            }

            if let url = data as? URL {
                completion(try? Data(contentsOf: url))
            } else if let image = data as? UIImage {
                completion(image.jpegData(compressionQuality: 0.8))
            } else if let dataObj = data as? Data {
                completion(dataObj)
            } else {
                completion(nil)
            }
        }
    }

    private func preferredImageTypeIdentifier(for provider: NSItemProvider) -> String? {
        let identifiers = provider.registeredTypeIdentifiers
        let concreteIdentifier = identifiers.first { identifier in
            guard let type = UTType(identifier) else { return false }
            return type.conforms(to: .image)
        }
        if let concreteIdentifier = concreteIdentifier {
            return concreteIdentifier
        }
        if provider.hasItemConformingToTypeIdentifier(UTType.image.identifier) {
            return UTType.image.identifier
        }
        return nil
    }

    private func preferredTextTypeIdentifier(for provider: NSItemProvider) -> String? {
        let candidates = [
            UTType.plainText.identifier,
            UTType.text.identifier,
            UTType.url.identifier,
        ]
        return candidates.first { provider.hasItemConformingToTypeIdentifier($0) }
    }
    
    // MARK: - 圖片壓縮（避免 120MB OOM）
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
    
    // MARK: - 儲存圖片到共享容器
    private func saveImageToSharedContainer(_ imageData: Data) -> String? {
        guard let containerURL = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupID) else {
            return nil
        }
        
        let sharedMediaDir = containerURL.appendingPathComponent("Library/Caches/SharedMedia", isDirectory: true)
        
        // 確保目錄存在
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
    
    private let maxQueuedItems = 50
    
    private func readExistingItems(_ userDefaults: UserDefaults, ownerUserID: String) -> [[String: Any]] {
        guard let existing = userDefaults.dictionary(forKey: "shared_content") else { return [] }
        guard existing["owner_user_id"] as? String == ownerUserID else { return [] }
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
    
    private func writeItemsToSharedStorage(_ items: [[String: Any]], ownerUserID: String) -> Bool {
        guard let userDefaults = UserDefaults(suiteName: appGroupID) else {
            NSLog("[NuancesShareExtension] App Group UserDefaults is unavailable")
            return false
        }
        guard userDefaults.string(forKey: "active_user_id") == ownerUserID else {
            NSLog("[NuancesShareExtension] refusing to queue content after account owner changed")
            return false
        }
        let metadata: [String: Any] = [
            "items": items,
            "timestamp": Date().timeIntervalSince1970,
            "owner_user_id": ownerUserID
        ]
        userDefaults.set(metadata, forKey: "shared_content")
        userDefaults.synchronize()
        return userDefaults.dictionary(forKey: "shared_content") != nil
    }
    
    // MARK: - 儲存文字到 UserDefaults（累加至既有隊列）
    private func saveTextToSharedStorage(_ text: String) -> Bool {
        guard let userDefaults = UserDefaults(suiteName: appGroupID) else {
            NSLog("[NuancesShareExtension] App Group UserDefaults is unavailable")
            return false
        }
        guard let ownerUserID = userDefaults.string(forKey: "active_user_id"),
              !ownerUserID.isEmpty else {
            NSLog("[NuancesShareExtension] active_user_id is missing; open Nuances once before sharing")
            return false
        }
        var items = readExistingItems(userDefaults, ownerUserID: ownerUserID)
        let alreadyQueued = items.contains { item in
            guard item["type"] as? String == "text",
                  let existingText = item["content"] as? String else {
                return false
            }
            return existingText == text
        }
        if alreadyQueued {
            NSLog("[NuancesShareExtension] skipped duplicate text already in queue")
            return true
        }
        items.append(["type": "text", "content": text])
        let finalItems = Array(items.suffix(maxQueuedItems))
        return writeItemsToSharedStorage(finalItems, ownerUserID: ownerUserID)
    }
    
    // MARK: - 儲存圖片路徑到 UserDefaults（累加至既有隊列）
    private func saveImagesToSharedStorage(_ imagePaths: [String]) -> Bool {
        guard let userDefaults = UserDefaults(suiteName: appGroupID) else {
            NSLog("[NuancesShareExtension] App Group UserDefaults is unavailable")
            return false
        }
        guard let ownerUserID = userDefaults.string(forKey: "active_user_id"),
              !ownerUserID.isEmpty else {
            NSLog("[NuancesShareExtension] active_user_id is missing; open Nuances once before sharing")
            return false
        }
        var items = readExistingItems(userDefaults, ownerUserID: ownerUserID)
        items.append(["type": "image", "images": imagePaths])
        let finalItems = Array(items.suffix(maxQueuedItems))
        return writeItemsToSharedStorage(finalItems, ownerUserID: ownerUserID)
    }
    
    // MARK: - 關閉 Extension
    private func closeExtension(success: Bool) {
        DispatchQueue.main.async {
            guard !self.didCloseExtension else { return }
            self.didCloseExtension = true
            NSLog("[NuancesShareExtension] closing extension, success: \(success)")
            self.extensionContext?.completeRequest(returningItems: nil, completionHandler: nil)
        }
    }

    private func currentUILanguage() -> String {
        guard let userDefaults = UserDefaults(suiteName: appGroupID) else { return "en" }
        return userDefaults.string(forKey: uiLanguageKey) ?? "en"
    }

    private func shareReceiptMessage() -> String {
        ShareReceiptCopy.message(for: currentUILanguage())
    }

    // MARK: - Native receipt notification
    private func postNativeReceiptThenClose(success: Bool, acceptedCount: Int = 1) {
        DispatchQueue.main.async {
            guard !self.didCloseExtension else { return }
            guard success else {
                self.closeExtension(success: false)
                return
            }

            // Notification delivery is best-effort. Never keep the share
            // extension open while waiting for notification authorization or
            // daemon callbacks.
            self.scheduleNativeReceiptNotification(
                message: self.shareReceiptMessage(),
                acceptedCount: acceptedCount,
                completion: {}
            )

            // Apple Pay 風格的成功觸覺回饋（叩-叩），在關閉選單前一刻觸發。
            // 通知已設為靜音（sound = nil），避免與此 Haptic 重疊打架。
            let generator = UINotificationFeedbackGenerator()
            generator.prepare()
            generator.notificationOccurred(.success)

            self.closeExtension(success: true)
        }
    }

    private func scheduleNativeReceiptNotification(message: String, acceptedCount: Int, completion: @escaping () -> Void) {
        let center = UNUserNotificationCenter.current()
        center.getNotificationSettings { settings in
            NSLog("[NuancesShareExtension] notification authorization status: \(settings.authorizationStatus.rawValue)")
            let schedule: () -> Void = {
                let content = UNMutableNotificationContent()
                content.title = "✓ 截圖已收藏"
                content.body = message
                content.sound = nil
                content.userInfo = [
                    "kind": "nuances-share-receipt",
                    "cacheCount": acceptedCount,
                    "target": "cache"
                ]
                let trigger = UNTimeIntervalNotificationTrigger(timeInterval: 1.0, repeats: false)
                let request = UNNotificationRequest(
                    identifier: "nuances-share-receipt-\(UUID().uuidString)",
                    content: content,
                    trigger: trigger
                )
                center.add(request) { error in
                    if let error = error {
                        NSLog("[NuancesShareExtension] notification failed: \(error.localizedDescription)")
                    }
                    completion()
                }
            }

            switch settings.authorizationStatus {
            case .authorized, .provisional:
                schedule()
            case .notDetermined:
                if #available(iOS 12.0, *) {
                    center.requestAuthorization(options: [.alert, .sound, .provisional]) { granted, error in
                        if let error = error {
                            NSLog("[NuancesShareExtension] notification authorization failed: \(error.localizedDescription)")
                        }
                        NSLog("[NuancesShareExtension] notification authorization requested, granted: \(granted)")
                        if granted {
                            schedule()
                        } else {
                            completion()
                        }
                    }
                } else {
                    center.requestAuthorization(options: [.alert, .sound]) { granted, error in
                        if let error = error {
                            NSLog("[NuancesShareExtension] notification authorization failed: \(error.localizedDescription)")
                        }
                        NSLog("[NuancesShareExtension] notification authorization requested, granted: \(granted)")
                        if granted {
                            schedule()
                        } else {
                            completion()
                        }
                    }
                }
            default:
                completion()
            }
        }
    }

    private func scheduleCloseFallback(after seconds: TimeInterval) {
        DispatchQueue.main.asyncAfter(deadline: .now() + seconds) { [weak self] in
            guard let self = self, !self.didCloseExtension else { return }
            self.closeExtension(success: true)
        }
    }
}
