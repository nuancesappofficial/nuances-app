enum ShareReceiptCopy {
    /// Shown when everything shared was saved.
    static func message(for language: String) -> String {
        switch language {
        case "zh-TW", "zh-CN":
            return "收到🫡"
        case "ja":
            return "またあとで"
        case "ko":
            return "이따 봐요"
        case "es":
            return "Nos vemos luego"
        case "fr":
            return "À plus tard"
        default:
            return "Catch you later"
        }
    }

    /// Shown only when photos are still loading after a short wait
    /// (for example, originals that live in iCloud).
    static func loading(for language: String) -> String {
        switch language {
        case "zh-TW":
            return "收到了，照片還在載入…"
        case "zh-CN":
            return "收到了，照片还在加载…"
        case "ja":
            return "受け取りました。写真を読み込み中…"
        case "ko":
            return "받았어요. 사진 불러오는 중…"
        case "es":
            return "¡Recibido! Cargando fotos…"
        case "fr":
            return "Bien reçu ! Chargement des photos…"
        default:
            return "Got it, still loading photos…"
        }
    }

    /// Some photos were saved, the rest never loaded.
    static func partial(for language: String, saved: Int, total: Int) -> String {
        switch language {
        case "zh-TW":
            return "收到 \(saved)/\(total) 張，其他沒載到"
        case "zh-CN":
            return "收到 \(saved)/\(total) 张，其他没加载到"
        case "ja":
            return "\(total)枚中\(saved)枚を受け取りました。残りは読み込めませんでした"
        case "ko":
            return "\(total)장 중 \(saved)장 받았어요. 나머지는 못 불러왔어요"
        case "es":
            return "Recibidas \(saved) de \(total) fotos; el resto no cargó"
        case "fr":
            return "\(saved) photo(s) sur \(total) reçue(s) ; le reste n'a pas chargé"
        default:
            return "Got \(saved) of \(total) photos; the rest didn't load"
        }
    }

    /// No photo loaded at all.
    static func failed(for language: String) -> String {
        switch language {
        case "zh-TW":
            return "照片沒載到，有網路時再分享一次"
        case "zh-CN":
            return "照片没加载到，有网络时再分享一次"
        case "ja":
            return "写真を読み込めませんでした。電波のある場所でもう一度共有してください"
        case "ko":
            return "사진을 불러오지 못했어요. 인터넷이 될 때 다시 공유해 주세요"
        case "es":
            return "No se cargaron las fotos. Vuelve a compartirlas cuando tengas conexión"
        case "fr":
            return "Les photos n'ont pas chargé. Partage-les à nouveau une fois connecté"
        default:
            return "Photos didn't load. Share again when you're online"
        }
    }
}


import UIKit
import Social
import UniformTypeIdentifiers
import MobileCoreServices
import UserNotifications
import ImageIO

class ShareViewController: UIViewController {
    
    private let appGroupID = "group.com.jeffenglishlearning.nuances.v2"
    private let maxImageCount = 10
    private let maxTextLength = 2000
    private let maxImageEdge: CGFloat = 1920.0
    private var didCloseExtension = false
    private let slowLoadingNoticeDelay: TimeInterval = 0.5
    // One id per share, so a later message replaces the earlier one in place.
    private let receiptNotificationID = "nuances-share-receipt-\(UUID().uuidString)"

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
                } else if let url = data as? URL, url.isFileURL, let text = try? String(contentsOf: url) {
                    // Only local files: String(contentsOf:) on a web URL downloads the page.
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
        // Saving can only fail for these reasons, so check them before any
        // receipt is shown: a receipt must never promise what can't be saved.
        guard canQueueSharedContent() else {
            NSLog("[NuancesShareExtension] cannot queue images: App Group or signed-in user missing")
            self.closeExtension(success: false)
            return
        }

        let limitedAttachments = Array(attachments.prefix(maxImageCount))
        let totalCount = limitedAttachments.count
        let startedAt = Date()
        var processedImages: [String] = []
        let processedImagesQueue = DispatchQueue(label: "com.nuances.shareExtension.processedImages")
        let finalizationQueue = DispatchQueue(label: "com.nuances.shareExtension.imageFinalization")
        let dispatchGroup = DispatchGroup()
        var didFinalize = false
        var didPostLoadingNotice = false // main queue only

        // Only when loading is slow (e.g. originals still in iCloud): say it was
        // received but is still loading. The final message replaces it in place.
        DispatchQueue.main.asyncAfter(deadline: .now() + slowLoadingNoticeDelay) { [weak self] in
            guard let self = self, !self.didCloseExtension else { return }
            guard !finalizationQueue.sync(execute: { didFinalize }) else { return }
            didPostLoadingNotice = true
            NSLog("[NuancesShareExtension] images still loading after \(self.slowLoadingNoticeDelay)s, posting loading notice")
            self.scheduleNativeReceiptNotification(
                message: ShareReceiptCopy.loading(for: self.currentUILanguage()),
                acceptedCount: 0,
                completion: {}
            )
        }

        let finalize: (String) -> Void = { [weak self] reason in
            finalizationQueue.async {
                guard let self = self, !didFinalize else { return }
                didFinalize = true
                let finalImages = processedImagesQueue.sync { processedImages }
                DispatchQueue.main.async {
                    let elapsedMs = Int(Date().timeIntervalSince(startedAt) * 1000)
                    let language = self.currentUILanguage()
                    guard !finalImages.isEmpty, self.saveImagesToSharedStorage(finalImages) else {
                        NSLog("[NuancesShareExtension] no image items saved, reason: \(reason), loadingNotice: \(didPostLoadingNotice), \(elapsedMs)ms")
                        self.postNativeReceiptThenClose(
                            success: false,
                            acceptedCount: 0,
                            message: ShareReceiptCopy.failed(for: language)
                        )
                        return
                    }
                    let message = finalImages.count < totalCount
                        ? ShareReceiptCopy.partial(for: language, saved: finalImages.count, total: totalCount)
                        : ShareReceiptCopy.message(for: language)
                    NSLog("[NuancesShareExtension] saved image items: \(finalImages.count)/\(totalCount), reason: \(reason), loadingNotice: \(didPostLoadingNotice), \(elapsedMs)ms")
                    self.postNativeReceiptThenClose(success: true, acceptedCount: finalImages.count, message: message)
                }
            }
        }

        for attachment in limitedAttachments {
            dispatchGroup.enter()
            loadShareableJPEG(from: attachment, timeout: 10.0) { [weak self] jpegData in
                defer { dispatchGroup.leave() }
                guard let self = self else { return }
                guard let jpegData = jpegData,
                      let savedPath = self.saveImageToSharedContainer(jpegData) else {
                    NSLog("[NuancesShareExtension] image provider produced no usable image")
                    return
                }
                processedImagesQueue.sync {
                    processedImages.append(savedPath)
                }
            }
        }

        dispatchGroup.notify(queue: .main) {
            finalize("all image providers completed")
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + (totalCount > 1 ? 18.0 : 10.0)) {
            finalize("image pack timeout")
        }
    }

    private func canQueueSharedContent() -> Bool {
        guard let userDefaults = UserDefaults(suiteName: appGroupID),
              let ownerUserID = userDefaults.string(forKey: "active_user_id"),
              !ownerUserID.isEmpty,
              FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupID) != nil else {
            return false
        }
        return true
    }

    /// Produces the JPEG that gets queued: at most `maxImageEdge` px, quality 0.85.
    private func loadShareableJPEG(from provider: NSItemProvider, timeout: TimeInterval, completion: @escaping (Data?) -> Void) {
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

        // Fast path: read the file and let ImageIO decode straight to the
        // target size, then encode once. The old path decoded the full-size
        // image, re-encoded it, decoded it again, resized and encoded again.
        if let typeIdentifier = preferredImageTypeIdentifier(for: provider) {
            provider.loadFileRepresentation(forTypeIdentifier: typeIdentifier) { [weak self] url, error in
                guard let self = self else {
                    completeOnce(nil)
                    return
                }
                // The file is only valid inside this handler, so read it here.
                if let url = url, let data = self.downsampledJPEG(at: url) {
                    completeOnce(data)
                    return
                }
                if let error = error {
                    NSLog("[NuancesShareExtension] loadFileRepresentation failed: \(error.localizedDescription)")
                }
                self.loadShareableJPEGFromObject(provider, completion: completeOnce)
            }
            return
        }

        loadShareableJPEGFromObject(provider, completion: completeOnce)
    }

    /// Fallback for providers that only hand over an in-memory image.
    private func loadShareableJPEGFromObject(_ provider: NSItemProvider, completion: @escaping (Data?) -> Void) {
        let encode: (UIImage?) -> Data? = { [weak self] image in
            guard let self = self, let image = image,
                  let resized = self.compressAndResizeImage(image) else { return nil }
            return resized.jpegData(compressionQuality: 0.85)
        }
        let typeIdentifier = preferredImageTypeIdentifier(for: provider) ?? UTType.image.identifier

        if provider.canLoadObject(ofClass: UIImage.self) {
            provider.loadObject(ofClass: UIImage.self) { [weak self] object, error in
                if let data = encode(object as? UIImage) {
                    completion(data)
                    return
                }
                if let error = error {
                    NSLog("[NuancesShareExtension] loadObject UIImage failed: \(error.localizedDescription)")
                }
                guard let self = self else {
                    completion(nil)
                    return
                }
                self.loadImageItemData(from: provider, typeIdentifier: typeIdentifier) { data in
                    completion(encode(data.flatMap(UIImage.init(data:))))
                }
            }
            return
        }

        loadImageItemData(from: provider, typeIdentifier: typeIdentifier) { data in
            completion(encode(data.flatMap(UIImage.init(data:))))
        }
    }

    private func downsampledJPEG(at url: URL) -> Data? {
        let sourceOptions = [kCGImageSourceShouldCache: false] as CFDictionary
        guard let source = CGImageSourceCreateWithURL(url as CFURL, sourceOptions) else { return nil }
        let thumbnailOptions = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceShouldCacheImmediately: true,
            kCGImageSourceThumbnailMaxPixelSize: Int(maxImageEdge),
        ] as CFDictionary
        guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, thumbnailOptions) else { return nil }
        let output = NSMutableData()
        guard let destination = CGImageDestinationCreateWithData(output, UTType.jpeg.identifier as CFString, 1, nil) else {
            return nil
        }
        CGImageDestinationAddImage(destination, image, [kCGImageDestinationLossyCompressionQuality: 0.85] as CFDictionary)
        guard CGImageDestinationFinalize(destination) else { return nil }
        return output as Data
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
    private func postNativeReceiptThenClose(success: Bool, acceptedCount: Int = 1, message: String? = nil) {
        DispatchQueue.main.async {
            guard !self.didCloseExtension else { return }
            guard success else {
                guard let message = message else {
                    self.closeExtension(success: false)
                    return
                }
                // Failure notice: no success haptic. Give the notification
                // request the same head start as the receipt before closing.
                self.scheduleNativeReceiptNotification(message: message, acceptedCount: 0, completion: {})
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
                    self.closeExtension(success: false)
                }
                return
            }

            // Notification delivery is best-effort. Never keep the share
            // extension open while waiting for notification authorization or
            // daemon callbacks.
            self.scheduleNativeReceiptNotification(
                message: message ?? self.shareReceiptMessage(),
                acceptedCount: acceptedCount,
                completion: {}
            )

            // Apple Pay 風格的成功觸覺回饋（叩-叩）：兩次快速連續的短震動，
            // 在關閉選單前一刻觸發。通知已設為靜音（sound = nil），避免與此
            // Haptic 重疊打架。
            //
            // 使用兩個獨立的 generator 並各自 prepare()，避免單一 generator
            // 重用時 prepare 預熱失效導致震動被吞掉（「沒有震動」）。
            // 第二次震動排程在 closeExtension 之前，確保 extension 關閉前
            // 兩次都播放（避免「單擊」）。
            let firstImpact = UIImpactFeedbackGenerator(style: .medium)
            firstImpact.prepare()
            firstImpact.impactOccurred()

            let secondImpact = UIImpactFeedbackGenerator(style: .medium)
            secondImpact.prepare()
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                secondImpact.impactOccurred()
            }

            // 延後關閉，讓第二次震動在 completeRequest 前播放完畢。
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
                self.closeExtension(success: true)
            }
        }
    }

    private func scheduleNativeReceiptNotification(message: String, acceptedCount: Int, completion: @escaping () -> Void) {
        let center = UNUserNotificationCenter.current()
        center.getNotificationSettings { settings in
            NSLog("[NuancesShareExtension] notification authorization status: \(settings.authorizationStatus.rawValue)")
            let schedule: () -> Void = {
                let content = UNMutableNotificationContent()
                content.title = "Nuances"
                content.body = message
                content.sound = nil
                content.userInfo = [
                    "kind": "nuances-share-receipt",
                    "cacheCount": acceptedCount,
                    "target": "cache"
                ]
                // nil trigger = deliver now. The old 1s interval trigger made
                // the receipt banner visibly trail the haptic.
                let request = UNNotificationRequest(
                    identifier: self.receiptNotificationID,
                    content: content,
                    trigger: nil
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
