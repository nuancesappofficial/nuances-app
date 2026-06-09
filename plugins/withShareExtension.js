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
  const swiftTemplatePath = path.join(__dirname, 'ShareViewController.swift');
  if (!fs.existsSync(swiftTemplatePath)) {
    throw new Error('Missing ShareViewController.swift template for Share Extension');
  }
  const finalSwiftCode = fs
    .readFileSync(swiftTemplatePath, 'utf8')
    .replace(/group\.com\.jeffenglishlearning\.nuances\.v2/g, APP_GROUP_ID);
  fs.writeFileSync(path.join(extensionDir, 'ShareViewController.swift'), finalSwiftCode);

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
