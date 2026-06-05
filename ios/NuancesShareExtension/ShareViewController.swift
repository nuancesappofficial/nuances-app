
import UIKit
import Social
import UniformTypeIdentifiers
import MobileCoreServices

class ShareViewController: UIViewController {
    
    private let appGroupID = "group.com.jeffenglishlearning.nuances.v2"
    private let maxImageCount = 10
    private let maxTextLength = 2000
    private let maxImageEdge: CGFloat = 1920.0
    private var didCloseExtension = false
    private var shareToastIndex = Int(Date().timeIntervalSince1970) % 20

    private let shareSecretaryPhrases = [
        "Filed neatly in Nuances.",
        "I tucked that into your study pile.",
        "Added to the tray for later.",
        "Saved, sorted, and ready.",
        "Future You can find this in Nuances.",
        "Captured and placed on your desk.",
        "That one is waiting in Nuances.",
        "I saved it before it slipped away.",
        "Collected for your next review.",
        "Filed under things worth remembering.",
        "That note is safely on the stack.",
        "I added it to your language inbox.",
        "Saved to Nuances, nice and tidy.",
        "Your next card candidate is ready.",
        "I caught that one for you.",
        "Archived in the right little pile.",
        "Added to your review queue.",
        "That phrase is now on your desk.",
        "I put it in the cache stack.",
        "Done. It is waiting for you."
    ]
    
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
            self.showNativeReceiptThenClose(success: true, acceptedCount: processedTexts.count)
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
                self.showNativeReceiptThenClose(success: true, acceptedCount: processedImages.count)
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

    private func nextShareSecretaryPhrase() -> String {
        let phrase = shareSecretaryPhrases[shareToastIndex % shareSecretaryPhrases.count]
        shareToastIndex += 1
        return phrase
    }

    // MARK: - Native receipt toast
    private func showNativeReceiptThenClose(success: Bool, acceptedCount: Int) {
        DispatchQueue.main.async {
            guard !self.didCloseExtension else { return }
            guard success else {
                self.closeExtension(success: false)
                return
            }

            let message = self.nextShareSecretaryPhrase()
            let toast = UIView()
            toast.translatesAutoresizingMaskIntoConstraints = false
            toast.backgroundColor = UIColor { traitCollection in
                traitCollection.userInterfaceStyle == .dark
                    ? UIColor(red: 0.06, green: 0.09, blue: 0.13, alpha: 0.96)
                    : UIColor(red: 0.97, green: 0.96, blue: 0.93, alpha: 0.98)
            }
            toast.layer.cornerRadius = 18
            toast.layer.cornerCurve = .continuous
            toast.layer.shadowColor = UIColor.black.cgColor
            toast.layer.shadowOpacity = 0.22
            toast.layer.shadowRadius = 18
            toast.layer.shadowOffset = CGSize(width: 0, height: 10)

            let label = UILabel()
            label.translatesAutoresizingMaskIntoConstraints = false
            label.text = message
            label.textAlignment = .center
            label.numberOfLines = 2
            label.font = UIFont.systemFont(ofSize: 15, weight: .semibold)
            label.textColor = UIColor { traitCollection in
                traitCollection.userInterfaceStyle == .dark
                    ? UIColor.white
                    : UIColor(red: 0.04, green: 0.08, blue: 0.14, alpha: 1)
            }

            toast.addSubview(label)
            self.view.addSubview(toast)

            NSLayoutConstraint.activate([
                toast.leadingAnchor.constraint(greaterThanOrEqualTo: self.view.leadingAnchor, constant: 18),
                toast.trailingAnchor.constraint(lessThanOrEqualTo: self.view.trailingAnchor, constant: -18),
                toast.centerXAnchor.constraint(equalTo: self.view.centerXAnchor),
                toast.topAnchor.constraint(equalTo: self.view.safeAreaLayoutGuide.topAnchor, constant: 18),
                label.leadingAnchor.constraint(equalTo: toast.leadingAnchor, constant: 18),
                label.trailingAnchor.constraint(equalTo: toast.trailingAnchor, constant: -18),
                label.topAnchor.constraint(equalTo: toast.topAnchor, constant: 13),
                label.bottomAnchor.constraint(equalTo: toast.bottomAnchor, constant: -13)
            ])

            toast.alpha = 0
            toast.transform = CGAffineTransform(translationX: 0, y: -12)

            UIView.animate(
                withDuration: 0.22,
                delay: 0,
                usingSpringWithDamping: 0.86,
                initialSpringVelocity: 0.4,
                options: [.curveEaseOut],
                animations: {
                    toast.alpha = 1
                    toast.transform = .identity
                },
                completion: { _ in
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.82) {
                        UIView.animate(withDuration: 0.18, animations: {
                            toast.alpha = 0
                            toast.transform = CGAffineTransform(translationX: 0, y: -8)
                        }, completion: { _ in
                            toast.removeFromSuperview()
                            self.closeExtension(success: true)
                        })
                    }
                }
            )
        }
    }

    private func scheduleCloseFallback(after seconds: TimeInterval) {
        DispatchQueue.main.asyncAfter(deadline: .now() + seconds) { [weak self] in
            guard let self = self, !self.didCloseExtension else { return }
            self.closeExtension(success: true)
        }
    }
}
