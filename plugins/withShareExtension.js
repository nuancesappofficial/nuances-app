const {
  withEntitlementsPlist,
  withInfoPlist,
  withXcodeProject,
  IOSConfig,
} = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const SHARE_EXTENSION_NAME = 'NuancesShareExtension';
const APP_GROUP_ID = 'group.com.jeffenglishlearning.nuances.v2';

/**
 * Share Extension Config Plugin for Nuances App
 * 
 * 此 Plugin 自動配置：
 * 1. App Groups (主 App 與 Share Extension 共享資料)
 * 2. Share Extension Target (Xcode 專案配置)
 * 3. Info.plist 設定 (NSExtensionActivationRule)
 */
function withShareExtension(config) {
  // Step 1: 主 App 加入 App Groups 權限
  config = withEntitlementsPlist(config, (config) => {
    config.modResults['com.apple.security.application-groups'] = [APP_GROUP_ID];
    return config;
  });

  // Step 2: 配置 Xcode 專案 (添加 Share Extension Target)
  config = withXcodeProject(config, async (config) => {
    const xcodeProject = config.modResults;
    const projectRoot = config.modRequest.projectRoot;

    // 創建 Share Extension 目錄與檔案
    await createShareExtensionFiles(projectRoot);

    // 添加 Share Extension Target 到 Xcode
    addShareExtensionTarget(xcodeProject, projectRoot);

    return config;
  });

  return config;
}

/**
 * 創建 Share Extension 所需的 Swift 檔案與設定
 */
async function createShareExtensionFiles(projectRoot) {
  const iosRoot = path.join(projectRoot, 'ios');
  const extensionDir = path.join(iosRoot, SHARE_EXTENSION_NAME);

  // 確保目錄存在
  if (!fs.existsSync(extensionDir)) {
    fs.mkdirSync(extensionDir, { recursive: true });
  }

  // 1. ShareViewController.swift (主要邏輯)
  const swiftCode = "\nimport UIKit\nimport Social\nimport UniformTypeIdentifiers\nimport MobileCoreServices\n\nclass ShareViewController: UIViewController {\n    \n    private let appGroupID = \"__APP_GROUP_ID__\"\n    private let maxImageCount = 10\n    private let maxTextLength = 2000\n    private let maxImageEdge: CGFloat = 1920.0\n    private var didCloseExtension = false\n    private var shareToastIndex = Int(Date().timeIntervalSince1970) % 20\n\n    private let shareSecretaryPhrases = [\n        \"Filed neatly in Nuances.\",\n        \"I tucked that into your study pile.\",\n        \"Added to the tray for later.\",\n        \"Saved, sorted, and ready.\",\n        \"Future You can find this in Nuances.\",\n        \"Captured and placed on your desk.\",\n        \"That one is waiting in Nuances.\",\n        \"I saved it before it slipped away.\",\n        \"Collected for your next review.\",\n        \"Filed under things worth remembering.\",\n        \"That note is safely on the stack.\",\n        \"I added it to your language inbox.\",\n        \"Saved to Nuances, nice and tidy.\",\n        \"Your next card candidate is ready.\",\n        \"I caught that one for you.\",\n        \"Archived in the right little pile.\",\n        \"Added to your review queue.\",\n        \"That phrase is now on your desk.\",\n        \"I put it in the cache stack.\",\n        \"Done. It is waiting for you.\"\n    ]\n    \n    override func viewDidLoad() {\n        super.viewDidLoad()\n        view.backgroundColor = .clear\n        handleSharedContent()\n    }\n    \n    private func handleSharedContent() {\n        guard let extensionItems = extensionContext?.inputItems as? [NSExtensionItem],\n              !extensionItems.isEmpty else {\n            self.closeExtension(success: false)\n            return\n        }\n\n        let attachments = extensionItems\n            .compactMap { $0.attachments }\n            .flatMap { $0 }\n\n        guard !attachments.isEmpty else {\n            self.closeExtension(success: false)\n            return\n        }\n        \n        NSLog(\"[NuancesShareExtension] attachments count: \\(attachments.count)\")\n\n        // 判斷分享類型：文字/連結或圖片\n        let textAttachments = attachments.filter {\n            self.preferredTextTypeIdentifier(for: $0) != nil\n        }\n        let imageAttachments = attachments.filter {\n            $0.hasItemConformingToTypeIdentifier(UTType.image.identifier)\n        }\n\n        if !textAttachments.isEmpty {\n            handleTextShare(textAttachments)\n        } else if !imageAttachments.isEmpty {\n            handleImageShare(imageAttachments)\n        } else {\n            self.closeExtension(success: false)\n        }\n    }\n    \n    // MARK: - 處理純文字分享\n    private func handleTextShare(_ attachments: [NSItemProvider]) {\n        let limitedAttachments = Array(attachments.prefix(maxQueuedItems))\n        var processedTexts: [String] = []\n        let dispatchGroup = DispatchGroup()\n        scheduleCloseFallback(after: 8.0)\n\n        for attachment in limitedAttachments {\n            guard let typeIdentifier = preferredTextTypeIdentifier(for: attachment) else {\n                continue\n            }\n            dispatchGroup.enter()\n            attachment.loadItem(forTypeIdentifier: typeIdentifier, options: nil) { [weak self] (data, error) in\n                defer { dispatchGroup.leave() }\n                guard let self = self else { return }\n                \n                if let error = error {\n                    print(\"Error loading text: \\(error)\")\n                    return\n                }\n                \n                var textContent = \"\"\n                if let text = data as? String {\n                    textContent = text\n                } else if let url = data as? URL, let text = try? String(contentsOf: url) {\n                    textContent = text\n                } else if let url = data as? URL {\n                    textContent = url.absoluteString\n                } else if let attributedText = data as? NSAttributedString {\n                    textContent = attributedText.string\n                }\n                \n                // 套用字數限制\n                if textContent.count > self.maxTextLength {\n                    textContent = String(textContent.prefix(self.maxTextLength))\n                }\n                \n                let normalized = textContent.trimmingCharacters(in: .whitespacesAndNewlines)\n                if !normalized.isEmpty {\n                    processedTexts.append(normalized)\n                }\n            }\n        }\n\n        dispatchGroup.notify(queue: .main) { [weak self] in\n            guard let self = self else { return }\n            if processedTexts.isEmpty {\n                self.closeExtension(success: false)\n                return\n            }\n\n            for text in processedTexts {\n                self.saveTextToSharedStorage(text)\n            }\n            NSLog(\"[NuancesShareExtension] saved text items: \\(processedTexts.count)\")\n            self.showNativeReceiptThenClose(success: true, acceptedCount: processedTexts.count)\n        }\n    }\n    \n    // MARK: - 處理圖片分享\n    private func handleImageShare(_ attachments: [NSItemProvider]) {\n        let limitedAttachments = Array(attachments.prefix(maxImageCount))\n        var processedImages: [String] = []\n        let dispatchGroup = DispatchGroup()\n        scheduleCloseFallback(after: 14.0)\n        \n        for attachment in limitedAttachments {\n            dispatchGroup.enter()\n            \n            attachment.loadItem(forTypeIdentifier: UTType.image.identifier, options: nil) { [weak self] (data, error) in\n                defer { dispatchGroup.leave() }\n                guard let self = self else { return }\n                \n                if let error = error {\n                    print(\"Error loading image: \\(error)\")\n                    return\n                }\n                \n                var imageData: Data?\n                \n                if let url = data as? URL {\n                    imageData = try? Data(contentsOf: url)\n                } else if let image = data as? UIImage {\n                    imageData = image.jpegData(compressionQuality: 0.8)\n                } else if let dataObj = data as? Data {\n                    imageData = dataObj\n                }\n                \n                guard let originalData = imageData,\n                      let image = UIImage(data: originalData) else {\n                    return\n                }\n                \n                // 壓縮與轉檔（HEIC -> JPEG，並限制尺寸）\n                if let compressedImage = self.compressAndResizeImage(image),\n                   let jpegData = compressedImage.jpegData(compressionQuality: 0.85) {\n                    if let savedPath = self.saveImageToSharedContainer(jpegData) {\n                        processedImages.append(savedPath)\n                    }\n                }\n            }\n        }\n        \n        dispatchGroup.notify(queue: .main) { [weak self] in\n            guard let self = self else { return }\n            if !processedImages.isEmpty {\n                self.saveImagesToSharedStorage(processedImages)\n                NSLog(\"[NuancesShareExtension] saved image items: \\(processedImages.count)\")\n                self.showNativeReceiptThenClose(success: true, acceptedCount: processedImages.count)\n            } else {\n                self.closeExtension(success: false)\n            }\n        }\n    }\n\n    private func preferredTextTypeIdentifier(for provider: NSItemProvider) -> String? {\n        let candidates = [\n            UTType.plainText.identifier,\n            UTType.text.identifier,\n            UTType.url.identifier,\n        ]\n        return candidates.first { provider.hasItemConformingToTypeIdentifier($0) }\n    }\n    \n    // MARK: - 圖片壓縮（避免 120MB OOM）\n    private func compressAndResizeImage(_ image: UIImage) -> UIImage? {\n        let size = image.size\n        let maxEdge = max(size.width, size.height)\n        \n        if maxEdge <= maxImageEdge {\n            return image\n        }\n        \n        let scale = maxImageEdge / maxEdge\n        let newSize = CGSize(width: size.width * scale, height: size.height * scale)\n        \n        UIGraphicsBeginImageContextWithOptions(newSize, false, 1.0)\n        image.draw(in: CGRect(origin: .zero, size: newSize))\n        let resizedImage = UIGraphicsGetImageFromCurrentImageContext()\n        UIGraphicsEndImageContext()\n        \n        return resizedImage\n    }\n    \n    // MARK: - 儲存圖片到共享容器\n    private func saveImageToSharedContainer(_ imageData: Data) -> String? {\n        guard let containerURL = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupID) else {\n            return nil\n        }\n        \n        let sharedMediaDir = containerURL.appendingPathComponent(\"Library/Caches/SharedMedia\", isDirectory: true)\n        \n        // 確保目錄存在\n        try? FileManager.default.createDirectory(at: sharedMediaDir, withIntermediateDirectories: true)\n        \n        let fileName = \"\\(UUID().uuidString).jpg\"\n        let fileURL = sharedMediaDir.appendingPathComponent(fileName)\n        \n        do {\n            try imageData.write(to: fileURL)\n            return fileURL.path\n        } catch {\n            print(\"Error saving image: \\(error)\")\n            return nil\n        }\n    }\n    \n    private let maxQueuedItems = 50\n    \n    private func readExistingItems(_ userDefaults: UserDefaults) -> [[String: Any]] {\n        guard let existing = userDefaults.dictionary(forKey: \"shared_content\") else { return [] }\n        if let items = existing[\"items\"] as? [[String: Any]], !items.isEmpty { return items }\n        if let type = existing[\"type\"] as? String {\n            if type == \"text\", let content = existing[\"content\"] as? String {\n                return [[\"type\": \"text\", \"content\": content]]\n            }\n            if type == \"image\", let images = existing[\"images\"] as? [String] {\n                return [[\"type\": \"image\", \"images\": images]]\n            }\n        }\n        return []\n    }\n    \n    private func writeItemsToSharedStorage(_ items: [[String: Any]]) {\n        guard let userDefaults = UserDefaults(suiteName: appGroupID) else { return }\n        let metadata: [String: Any] = [\n            \"items\": items,\n            \"timestamp\": Date().timeIntervalSince1970\n        ]\n        userDefaults.set(metadata, forKey: \"shared_content\")\n        userDefaults.synchronize()\n    }\n    \n    // MARK: - 儲存文字到 UserDefaults（累加至既有隊列）\n    private func saveTextToSharedStorage(_ text: String) {\n        guard let userDefaults = UserDefaults(suiteName: appGroupID) else { return }\n        var items = readExistingItems(userDefaults)\n        items.append([\"type\": \"text\", \"content\": text])\n        let finalItems = Array(items.suffix(maxQueuedItems))\n        writeItemsToSharedStorage(finalItems)\n    }\n    \n    // MARK: - 儲存圖片路徑到 UserDefaults（累加至既有隊列）\n    private func saveImagesToSharedStorage(_ imagePaths: [String]) {\n        guard let userDefaults = UserDefaults(suiteName: appGroupID) else { return }\n        var items = readExistingItems(userDefaults)\n        items.append([\"type\": \"image\", \"images\": imagePaths])\n        let finalItems = Array(items.suffix(maxQueuedItems))\n        writeItemsToSharedStorage(finalItems)\n    }\n    \n    // MARK: - 關閉 Extension\n    private func closeExtension(success: Bool) {\n        DispatchQueue.main.async {\n            guard !self.didCloseExtension else { return }\n            self.didCloseExtension = true\n            NSLog(\"[NuancesShareExtension] closing extension, success: \\(success)\")\n            self.extensionContext?.completeRequest(returningItems: nil, completionHandler: nil)\n        }\n    }\n\n    private func nextShareSecretaryPhrase() -> String {\n        let phrase = shareSecretaryPhrases[shareToastIndex % shareSecretaryPhrases.count]\n        shareToastIndex += 1\n        return phrase\n    }\n\n    // MARK: - Native receipt toast\n    private func showNativeReceiptThenClose(success: Bool, acceptedCount: Int) {\n        DispatchQueue.main.async {\n            guard !self.didCloseExtension else { return }\n            guard success else {\n                self.closeExtension(success: false)\n                return\n            }\n\n            let message = self.nextShareSecretaryPhrase()\n            let toast = UIView()\n            toast.translatesAutoresizingMaskIntoConstraints = false\n            toast.backgroundColor = UIColor { traitCollection in\n                traitCollection.userInterfaceStyle == .dark\n                    ? UIColor(red: 0.06, green: 0.09, blue: 0.13, alpha: 0.96)\n                    : UIColor(red: 0.97, green: 0.96, blue: 0.93, alpha: 0.98)\n            }\n            toast.layer.cornerRadius = 18\n            toast.layer.cornerCurve = .continuous\n            toast.layer.shadowColor = UIColor.black.cgColor\n            toast.layer.shadowOpacity = 0.22\n            toast.layer.shadowRadius = 18\n            toast.layer.shadowOffset = CGSize(width: 0, height: 10)\n\n            let label = UILabel()\n            label.translatesAutoresizingMaskIntoConstraints = false\n            label.text = message\n            label.textAlignment = .center\n            label.numberOfLines = 2\n            label.font = UIFont.systemFont(ofSize: 15, weight: .semibold)\n            label.textColor = UIColor { traitCollection in\n                traitCollection.userInterfaceStyle == .dark\n                    ? UIColor.white\n                    : UIColor(red: 0.04, green: 0.08, blue: 0.14, alpha: 1)\n            }\n\n            toast.addSubview(label)\n            self.view.addSubview(toast)\n\n            NSLayoutConstraint.activate([\n                toast.leadingAnchor.constraint(greaterThanOrEqualTo: self.view.leadingAnchor, constant: 18),\n                toast.trailingAnchor.constraint(lessThanOrEqualTo: self.view.trailingAnchor, constant: -18),\n                toast.centerXAnchor.constraint(equalTo: self.view.centerXAnchor),\n                toast.topAnchor.constraint(equalTo: self.view.safeAreaLayoutGuide.topAnchor, constant: 18),\n                label.leadingAnchor.constraint(equalTo: toast.leadingAnchor, constant: 18),\n                label.trailingAnchor.constraint(equalTo: toast.trailingAnchor, constant: -18),\n                label.topAnchor.constraint(equalTo: toast.topAnchor, constant: 13),\n                label.bottomAnchor.constraint(equalTo: toast.bottomAnchor, constant: -13)\n            ])\n\n            toast.alpha = 0\n            toast.transform = CGAffineTransform(translationX: 0, y: -12)\n\n            UIView.animate(\n                withDuration: 0.22,\n                delay: 0,\n                usingSpringWithDamping: 0.86,\n                initialSpringVelocity: 0.4,\n                options: [.curveEaseOut],\n                animations: {\n                    toast.alpha = 1\n                    toast.transform = .identity\n                },\n                completion: { _ in\n                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.82) {\n                        UIView.animate(withDuration: 0.18, animations: {\n                            toast.alpha = 0\n                            toast.transform = CGAffineTransform(translationX: 0, y: -8)\n                        }, completion: { _ in\n                            toast.removeFromSuperview()\n                            self.closeExtension(success: true)\n                        })\n                    }\n                }\n            )\n        }\n    }\n\n    private func scheduleCloseFallback(after seconds: TimeInterval) {\n        DispatchQueue.main.asyncAfter(deadline: .now() + seconds) { [weak self] in\n            guard let self = self, !self.didCloseExtension else { return }\n            self.closeExtension(success: true)\n        }\n    }\n}\n".replace(/__APP_GROUP_ID__/g, APP_GROUP_ID);

  fs.writeFileSync(path.join(extensionDir, 'ShareViewController.swift'), swiftCode);

  // 2. Info.plist
  const infoPlist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleDevelopmentRegion</key>
    <string>$(DEVELOPMENT_LANGUAGE)</string>
    <key>CFBundleDisplayName</key>
    <string>Nuances</string>
    <key>CFBundleExecutable</key>
    <string>$(EXECUTABLE_NAME)</string>
    <key>CFBundleIdentifier</key>
    <string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
    <key>CFBundleInfoDictionaryVersion</key>
    <string>6.0</string>
    <key>CFBundleName</key>
    <string>$(PRODUCT_NAME)</string>
    <key>CFBundlePackageType</key>
    <string>$(PRODUCT_BUNDLE_PACKAGE_TYPE)</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0.0</string>
    <key>CFBundleVersion</key>
    <string>1</string>
    <key>NSExtension</key>
    <dict>
        <key>NSExtensionAttributes</key>
        <dict>
            <key>NSExtensionActivationRule</key>
            <dict>
                <key>NSExtensionActivationDictionaryVersion</key>
                <integer>2</integer>
                <key>NSExtensionActivationSupportsImageWithMaxCount</key>
                <integer>10</integer>
                <key>NSExtensionActivationSupportsText</key>
                <true/>
            </dict>
        </dict>
        <key>NSExtensionPointIdentifier</key>
        <string>com.apple.share-services</string>
        <key>NSExtensionPrincipalClass</key>
        <string>ShareViewController</string>
    </dict>
</dict>
</plist>
`;

  fs.writeFileSync(path.join(extensionDir, 'Info.plist'), infoPlist);

  // 3. Entitlements
  const entitlements = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.security.application-groups</key>
    <array>
        <string>${APP_GROUP_ID}</string>
    </array>
</dict>
</plist>
`;

  fs.writeFileSync(path.join(extensionDir, `${SHARE_EXTENSION_NAME}.entitlements`), entitlements);
}

/**
 * 添加 Share Extension Target 到 Xcode 專案
 */
function addShareExtensionTarget(xcodeProject, projectRoot) {
  // Note: 此處需要使用 xcode 套件來修改 .pbxproj
  // 由於這是複雜的 Xcode 專案修改，在實際部署時需要手動或使用更完整的工具
  console.log('Share Extension files created. Manual Xcode configuration required.');
}

module.exports = withShareExtension;
