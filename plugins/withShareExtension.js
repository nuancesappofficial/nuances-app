const {
  withEntitlementsPlist,
  withInfoPlist,
  withXcodeProject,
  IOSConfig,
} = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const SHARE_EXTENSION_NAME = 'NuancesShareExtension';
const APP_GROUP_ID = 'group.com.jeffenglishlearning.nuances';

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
  const swiftCode = `
import UIKit
import Social
import UniformTypeIdentifiers
import MobileCoreServices

class ShareViewController: UIViewController {
    
    private let appGroupID = "${APP_GROUP_ID}"
    private let maxImageCount = 10
    private let maxTextLength = 2000
    private let maxImageEdge: CGFloat = 1920.0
    
    override func viewDidLoad() {
        super.viewDidLoad()
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
        
        // 判斷分享類型：純文字或圖片
        let textAttachments = attachments.filter {
            $0.hasItemConformingToTypeIdentifier(UTType.plainText.identifier)
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

        for attachment in limitedAttachments {
            dispatchGroup.enter()
            attachment.loadItem(forTypeIdentifier: UTType.plainText.identifier, options: nil) { [weak self] (data, error) in
                defer { dispatchGroup.leave() }
                guard let self = self else { return }
                
                if let error = error {
                    print("Error loading text: \\(error)")
                    return
                }
                
                var textContent = ""
                if let text = data as? String {
                    textContent = text
                } else if let url = data as? URL, let text = try? String(contentsOf: url) {
                    textContent = text
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
            self.closeExtension(success: true)
        }
    }
    
    // MARK: - 處理圖片分享
    private func handleImageShare(_ attachments: [NSItemProvider]) {
        let limitedAttachments = Array(attachments.prefix(maxImageCount))
        var processedImages: [String] = []
        let dispatchGroup = DispatchGroup()
        
        for attachment in limitedAttachments {
            dispatchGroup.enter()
            
            attachment.loadItem(forTypeIdentifier: UTType.image.identifier, options: nil) { [weak self] (data, error) in
                defer { dispatchGroup.leave() }
                guard let self = self else { return }
                
                if let error = error {
                    print("Error loading image: \\(error)")
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
                self.closeExtension(success: true)
            } else {
                self.closeExtension(success: false)
            }
        }
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
        
        let fileName = "\\(UUID().uuidString).jpg"
        let fileURL = sharedMediaDir.appendingPathComponent(fileName)
        
        do {
            try imageData.write(to: fileURL)
            return fileURL.path
        } catch {
            print("Error saving image: \\(error)")
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
            if success {
                self.extensionContext?.completeRequest(returningItems: nil, completionHandler: nil)
            } else {
                let error = NSError(domain: "com.jeffenglishlearning.nuances.shareextension", code: -1, userInfo: nil)
                self.extensionContext?.cancelRequest(withError: error)
            }
        }
    }
}
`;

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
    <string>1.0</string>
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
