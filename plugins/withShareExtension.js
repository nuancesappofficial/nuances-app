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
const MAIN_APP_NATIVE_FILES = ['SharedDefaultsModule.swift', 'SharedDefaultsModuleBridge.m'];

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
    addSharedDefaultsModule(xcodeProject, projectRoot, config.modRequest.projectName);
    addShareExtensionTarget(xcodeProject, config);
    syncShareExtensionBuildSettings(xcodeProject, config);

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
  const receiptCopyPath = path.join(__dirname, 'ShareReceiptCopy.swift');
  if (!fs.existsSync(swiftTemplatePath)) {
    throw new Error('Missing ShareViewController.swift template for Share Extension');
  }
  if (!fs.existsSync(receiptCopyPath)) {
    throw new Error('Missing ShareReceiptCopy.swift template for Share Extension');
  }
  const finalSwiftCode = `${fs.readFileSync(receiptCopyPath, 'utf8')}\n${fs
    .readFileSync(swiftTemplatePath, 'utf8')}`
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
    <string>$(MARKETING_VERSION)</string>
    <key>CFBundleVersion</key>
    <string>$(CURRENT_PROJECT_VERSION)</string>
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
                <key>NSExtensionActivationSupportsWebPageWithMaxCount</key>
                <integer>1</integer>
                <key>NSExtensionActivationSupportsWebURLWithMaxCount</key>
                <integer>1</integer>
            </dict>
        </dict>
        <key>NSExtensionPointIdentifier</key>
        <string>com.apple.share-services</string>
        <key>NSExtensionPrincipalClass</key>
        <string>$(PRODUCT_MODULE_NAME).ShareViewController</string>
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
 * Add the JS-facing SharedDefaultsModule to the main app target. EAS builds
 * regenerate ios/ with prebuild, so hand-added native files would be lost.
 */
function addSharedDefaultsModule(xcodeProject, projectRoot, projectName) {
  const targetUuid = xcodeProject.getFirstTarget().uuid;
  const appDir = path.join(projectRoot, 'ios', projectName);
  MAIN_APP_NATIVE_FILES.forEach((fileName) => {
    fs.copyFileSync(path.join(__dirname, fileName), path.join(appDir, fileName));
    IOSConfig.XcodeUtils.addBuildSourceFileToGroup({
      filepath: path.posix.join(projectName, fileName),
      groupName: projectName,
      project: xcodeProject,
      targetUuid,
    });
  });
}

/**
 * Create the share extension target and embed it in the main app.
 * Without this the .appex is never built and iOS drops Nuances from the share sheet.
 */
function addShareExtensionTarget(xcodeProject, config) {
  if (xcodeProject.pbxTargetByName(SHARE_EXTENSION_NAME)) return;

  const objects = xcodeProject.hash.project.objects;
  objects.PBXTargetDependency = objects.PBXTargetDependency || {};
  objects.PBXContainerItemProxy = objects.PBXContainerItemProxy || {};

  const bundleIdentifier = `${config.ios?.bundleIdentifier}.${SHARE_EXTENSION_NAME}`;
  const target = xcodeProject.addTarget(
    SHARE_EXTENSION_NAME,
    'app_extension',
    SHARE_EXTENSION_NAME,
    bundleIdentifier
  );

  const group = xcodeProject.addPbxGroup(
    ['ShareViewController.swift', 'Info.plist', `${SHARE_EXTENSION_NAME}.entitlements`],
    SHARE_EXTENSION_NAME,
    SHARE_EXTENSION_NAME
  );
  const mainGroupId = xcodeProject.getFirstProject().firstProject.mainGroup;
  xcodeProject.addToPbxGroup(group.uuid, mainGroupId);

  xcodeProject.addBuildPhase(
    ['ShareViewController.swift'],
    'PBXSourcesBuildPhase',
    'Sources',
    target.uuid,
    undefined,
    SHARE_EXTENSION_NAME
  );
  xcodeProject.addBuildPhase([], 'PBXFrameworksBuildPhase', 'Frameworks', target.uuid);
  xcodeProject.addBuildPhase([], 'PBXResourcesBuildPhase', 'Resources', target.uuid);

  const configurations = xcodeProject.pbxXCBuildConfigurationSection();
  const configList = xcodeProject.pbxXCConfigurationList()[target.pbxNativeTarget.buildConfigurationList];
  configList.buildConfigurations.forEach(({ value }) => {
    Object.assign(configurations[value].buildSettings, {
      CODE_SIGN_ENTITLEMENTS: `${SHARE_EXTENSION_NAME}/${SHARE_EXTENSION_NAME}.entitlements`,
      CODE_SIGN_STYLE: 'Automatic',
      GENERATE_INFOPLIST_FILE: 'NO',
      INFOPLIST_FILE: `${SHARE_EXTENSION_NAME}/Info.plist`,
      LD_RUNPATH_SEARCH_PATHS: '"$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks"',
      PRODUCT_NAME: '"$(TARGET_NAME)"',
      SKIP_INSTALL: 'YES',
      SWIFT_VERSION: '5.0',
      TARGETED_DEVICE_FAMILY: '1',
    });
  });
}

/**
 * Keep an existing extension target aligned with the containing app.
 * iOS rejects or warns on embedded extensions whose version/build differs.
 */
function syncShareExtensionBuildSettings(xcodeProject, config) {
  const extensionBundleIdentifier = `${config.ios?.bundleIdentifier}.${SHARE_EXTENSION_NAME}`;
  const buildNumber = String(config.ios?.buildNumber || '1');
  const marketingVersion = String(config.version || '1.0.0');
  const configurations = xcodeProject.pbxXCBuildConfigurationSection();

  Object.values(configurations).forEach((entry) => {
    const settings = entry?.buildSettings;
    if (!settings) return;

    const bundleIdentifier = String(settings.PRODUCT_BUNDLE_IDENTIFIER || '').replace(
      /^"|"$/g,
      ''
    );
    if (bundleIdentifier !== extensionBundleIdentifier) return;

    settings.CURRENT_PROJECT_VERSION = buildNumber;
    settings.MARKETING_VERSION = marketingVersion;
    settings.IPHONEOS_DEPLOYMENT_TARGET = '15.1';
  });
}

module.exports = withShareExtension;
