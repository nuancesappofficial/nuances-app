
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
    private var didPresentOpenAppPrompt = false
    private let slowLoadingNoticeDelay: TimeInterval = 1.5
    // One id per share, so a later message replaces the earlier one in place.
    private let receiptNotificationID = "nuances-share-receipt-\(UUID().uuidString)"

    private let uiLanguageKey = "nuances_ui_language"
    // Upper bound for keeping the sheet open while the receipt request is
    // handed to the notification daemon (normally ~20ms).
    private let receiptHandoffTimeout: TimeInterval = 1.0
    // Main queue only. Fetched once, as soon as the extension loads.
    private var notificationAuthorizationStatus: UNAuthorizationStatus?
    private var notificationAuthorizationWaiters: [(UNAuthorizationStatus) -> Void] = []

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .clear
        // Open the notification daemon connection while the shared items load,
        // so posting the receipt later is a single local request.
        withNotificationAuthorization { _ in }
        if hasActiveUser() {
            handleSharedContent()
        }
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        if !hasActiveUser() {
            presentOpenAppPrompt()
        }
    }

    private func hasActiveUser() -> Bool {
        let userID = UserDefaults(suiteName: appGroupID)?.string(forKey: "active_user_id")
        return !(userID ?? "").isEmpty
    }

    // Without a signed-in owner the share cannot be queued. Say so instead of
    // closing silently, which would look like the share worked and then vanished.
    private func presentOpenAppPrompt() {
        guard !didPresentOpenAppPrompt else { return }
        didPresentOpenAppPrompt = true
        let copy = ShareReceiptCopy.openAppPrompt(for: promptLanguage())
        let alert = UIAlertController(title: "Nuances", message: copy.message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: copy.action, style: .default) { [weak self] _ in
            self?.closeExtension(success: false)
        })
        present(alert, animated: true)
    }

    private func promptLanguage() -> String {
        if let saved = UserDefaults(suiteName: appGroupID)?.string(forKey: uiLanguageKey) {
            return saved
        }
        let preferred = Locale.preferredLanguages.first ?? "en"
        if preferred.hasPrefix("zh-Hans") { return "zh-CN" }
        if preferred.hasPrefix("zh") { return "zh-TW" }
        return String(preferred.prefix(2))
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

        // First choice: the in-memory image the host app prepares for sharing
        // (what the original, fast version used). Photos hands this over quickly;
        // asking for the original file instead can wait on the full-size asset
        // (iCloud download or a full export) and held the receipt back.
        if provider.canLoadObject(ofClass: UIImage.self) {
            let startedAt = Date()
            provider.loadObject(ofClass: UIImage.self) { [weak self] object, error in
                guard let self = self else {
                    completeOnce(nil)
                    return
                }
                if let image = object as? UIImage,
                   let resized = self.compressAndResizeImage(image),
                   let data = resized.jpegData(compressionQuality: 0.85) {
                    NSLog("[NuancesShareExtension] timing: UIImage path \(Int(Date().timeIntervalSince(startedAt) * 1000))ms")
                    completeOnce(data)
                    return
                }
                if let error = error {
                    NSLog("[NuancesShareExtension] loadObject UIImage failed: \(error.localizedDescription)")
                }
                self.loadShareableJPEGFromFile(provider, completion: completeOnce)
            }
            return
        }

        loadShareableJPEGFromFile(provider, completion: completeOnce)
    }

    /// Fallback: read the file and let ImageIO decode straight to the target size.
    private func loadShareableJPEGFromFile(_ provider: NSItemProvider, completion: @escaping (Data?) -> Void) {
        let startedAt = Date()
        let typeIdentifier = preferredImageTypeIdentifier(for: provider) ?? UTType.image.identifier
        provider.loadFileRepresentation(forTypeIdentifier: typeIdentifier) { [weak self] url, error in
            guard let self = self else {
                completion(nil)
                return
            }
            // The file is only valid inside this handler, so read it here.
            if let url = url, let data = self.downsampledJPEG(at: url) {
                NSLog("[NuancesShareExtension] timing: file path \(Int(Date().timeIntervalSince(startedAt) * 1000))ms")
                completion(data)
                return
            }
            if let error = error {
                NSLog("[NuancesShareExtension] loadFileRepresentation failed: \(error.localizedDescription)")
            }
            self.loadImageItemData(from: provider, typeIdentifier: typeIdentifier) { data in
                guard let image = data.flatMap(UIImage.init(data:)),
                      let resized = self.compressAndResizeImage(image) else {
                    completion(nil)
                    return
                }
                completion(resized.jpegData(compressionQuality: 0.85))
            }
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
                // Only local files: Data(contentsOf:) on a web URL downloads it,
                // which holds the receipt and fails offline.
                completion(url.isFileURL ? try? Data(contentsOf: url) : nil)
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
                // Failure notice: no success haptic.
                let startedAt = Date()
                self.scheduleNativeReceiptNotification(message: message, acceptedCount: 0) {
                    self.closeAfterReceiptHandoff(success: false, startedAt: startedAt)
                }
                self.scheduleCloseFallback(after: self.receiptHandoffTimeout, success: false)
                return
            }

            let startedAt = Date()
            self.scheduleNativeReceiptNotification(
                message: message ?? self.shareReceiptMessage(),
                acceptedCount: acceptedCount
            ) {
                self.closeAfterReceiptHandoff(success: true, startedAt: startedAt)
            }

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

            // Delivery is best-effort: never hold the sheet longer than this.
            self.scheduleCloseFallback(after: self.receiptHandoffTimeout)
        }
    }

    /// Close only once the receipt request has reached the notification daemon.
    /// Closing first lets iOS suspend the extension with the request still
    /// in flight, so the banner only appears when the extension next runs.
    /// Still waits at least 0.15s so the second haptic tap plays.
    private func closeAfterReceiptHandoff(success: Bool, startedAt: Date) {
        DispatchQueue.main.async {
            let remaining = max(0, 0.15 - Date().timeIntervalSince(startedAt))
            NSLog("[NuancesShareExtension] receipt handed off after \(Int(Date().timeIntervalSince(startedAt) * 1000))ms")
            DispatchQueue.main.asyncAfter(deadline: .now() + remaining) {
                self.closeExtension(success: success)
            }
        }
    }

    /// Calls `body` on the main queue with the cached authorization status,
    /// fetching it once if needed. Must be called on the main queue.
    private func withNotificationAuthorization(_ body: @escaping (UNAuthorizationStatus) -> Void) {
        if let status = notificationAuthorizationStatus {
            body(status)
            return
        }
        notificationAuthorizationWaiters.append(body)
        guard notificationAuthorizationWaiters.count == 1 else { return }
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            DispatchQueue.main.async {
                let status = settings.authorizationStatus
                NSLog("[NuancesShareExtension] notification authorization status: \(status.rawValue)")
                self.notificationAuthorizationStatus = status
                let waiters = self.notificationAuthorizationWaiters
                self.notificationAuthorizationWaiters = []
                waiters.forEach { $0(status) }
            }
        }
    }

    /// Must be called on the main queue. `completion` runs once the request
    /// was accepted or skipped.
    private func scheduleNativeReceiptNotification(message: String, acceptedCount: Int, completion: @escaping () -> Void) {
        let center = UNUserNotificationCenter.current()
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

        withNotificationAuthorization { status in
            switch status {
            case .authorized, .provisional, .ephemeral:
                schedule()
            case .notDetermined:
                center.requestAuthorization(options: [.alert, .sound, .provisional]) { granted, error in
                    if let error = error {
                        NSLog("[NuancesShareExtension] notification authorization failed: \(error.localizedDescription)")
                    }
                    NSLog("[NuancesShareExtension] notification authorization requested, granted: \(granted)")
                    DispatchQueue.main.async {
                        self.notificationAuthorizationStatus = granted ? .provisional : .denied
                    }
                    if granted {
                        schedule()
                    } else {
                        completion()
                    }
                }
            default:
                completion()
            }
        }
    }

    private func scheduleCloseFallback(after seconds: TimeInterval, success: Bool = true) {
        DispatchQueue.main.asyncAfter(deadline: .now() + seconds) { [weak self] in
            guard let self = self, !self.didCloseExtension else { return }
            self.closeExtension(success: success)
        }
    }
}
