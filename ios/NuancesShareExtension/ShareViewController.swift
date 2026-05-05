
import UIKit
import Social
import UniformTypeIdentifiers
import MobileCoreServices

class ShareViewController: UIViewController {
    
    private let appGroupID = "group.com.jeffenglishlearning.nuances"
    private let maxImageCount = 10
    private let maxTextLength = 2000
    private let maxImageEdge: CGFloat = 1920.0
    private var didCloseExtension = false
    
    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .clear
        handleSharedContent()
    }
    
    private func handleSharedContent() {
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
            $0.hasItemConformingToTypeIdentifier(UTType.image.identifier)
        }

        if !textAttachments.isEmpty {
            handleTextShare(textAttachments)
        } else if !imageAttachments.isEmpty {
            handleImageShare(imageAttachments)
        } else {
            self.closeExtension(success: false)
        }
    }
    
    // MARK: - 處理純文字分享
    private func handleTextShare(_ attachments: [NSItemProvider]) {
        let limitedAttachments = Array(attachments.prefix(maxQueuedItems))
        var processedTexts: [String] = []
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
                    processedTexts.append(normalized)
                }
            }
        }

        dispatchGroup.notify(queue: .main) { [weak self] in
            guard let self = self else { return }
            if processedTexts.isEmpty {
                self.closeExtension(success: false)
                return
            }

            for text in processedTexts {
                self.saveTextToSharedStorage(text)
            }
            NSLog("[NuancesShareExtension] saved text items: \(processedTexts.count)")
            self.closeExtension(success: true)
        }
    }
    
    // MARK: - 處理圖片分享
    private func handleImageShare(_ attachments: [NSItemProvider]) {
        let limitedAttachments = Array(attachments.prefix(maxImageCount))
        var processedImages: [String] = []
        let dispatchGroup = DispatchGroup()
        scheduleCloseFallback(after: 14.0)
        
        for attachment in limitedAttachments {
            dispatchGroup.enter()
            
            attachment.loadItem(forTypeIdentifier: UTType.image.identifier, options: nil) { [weak self] (data, error) in
                defer { dispatchGroup.leave() }
                guard let self = self else { return }
                
                if let error = error {
                    print("Error loading image: \(error)")
                    return
                }
                
                var imageData: Data?
                
                if let url = data as? URL {
                    imageData = try? Data(contentsOf: url)
                } else if let image = data as? UIImage {
                    imageData = image.jpegData(compressionQuality: 0.8)
                } else if let dataObj = data as? Data {
                    imageData = dataObj
                }
                
                guard let originalData = imageData,
                      let image = UIImage(data: originalData) else {
                    return
                }
                
                // 壓縮與轉檔（HEIC -> JPEG，並限制尺寸）
                if let compressedImage = self.compressAndResizeImage(image),
                   let jpegData = compressedImage.jpegData(compressionQuality: 0.85) {
                    if let savedPath = self.saveImageToSharedContainer(jpegData) {
                        processedImages.append(savedPath)
                    }
                }
            }
        }
        
        dispatchGroup.notify(queue: .main) { [weak self] in
            guard let self = self else { return }
            if !processedImages.isEmpty {
                self.saveImagesToSharedStorage(processedImages)
                NSLog("[NuancesShareExtension] saved image items: \(processedImages.count)")
                self.closeExtension(success: true)
            } else {
                self.closeExtension(success: false)
            }
        }
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
    
    // MARK: - 儲存文字到 UserDefaults（累加至既有隊列）
    private func saveTextToSharedStorage(_ text: String) {
        guard let userDefaults = UserDefaults(suiteName: appGroupID) else { return }
        var items = readExistingItems(userDefaults)
        items.append(["type": "text", "content": text])
        let finalItems = Array(items.suffix(maxQueuedItems))
        writeItemsToSharedStorage(finalItems)
    }
    
    // MARK: - 儲存圖片路徑到 UserDefaults（累加至既有隊列）
    private func saveImagesToSharedStorage(_ imagePaths: [String]) {
        guard let userDefaults = UserDefaults(suiteName: appGroupID) else { return }
        var items = readExistingItems(userDefaults)
        items.append(["type": "image", "images": imagePaths])
        let finalItems = Array(items.suffix(maxQueuedItems))
        writeItemsToSharedStorage(finalItems)
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

    private func scheduleCloseFallback(after seconds: TimeInterval) {
        DispatchQueue.main.asyncAfter(deadline: .now() + seconds) { [weak self] in
            guard let self = self, !self.didCloseExtension else { return }
            self.closeExtension(success: true)
        }
    }
}
