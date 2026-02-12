#!/bin/bash
# 自動化 iOS 構建腳本
# 解決 Expo 設備 ID 緩存問題

set -e

echo "🚀 開始自動構建..."

# 1. 確認模擬器運行中
SIMULATOR_STATUS=$(xcrun simctl list devices booted | grep "iPhone" | head -1)
if [ -z "$SIMULATOR_STATUS" ]; then
    echo "❌ 找不到運行中的模擬器，正在啟動..."
    open -a Simulator
    sleep 5
fi

echo "✅ 模擬器已就緒"

# 2. 使用 Xcode 命令行直接構建（繞過 Expo）
echo "🔨 開始編譯..."
cd "$(dirname "$0")/.."

xcodebuild \
  -workspace ios/Nuances.xcworkspace \
  -scheme Nuances \
  -configuration Debug \
  -sdk iphonesimulator \
  -derivedDataPath ios/build \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro,OS=latest' \
  build

if [ $? -eq 0 ]; then
    echo "✅ 構建成功！"
    
    # 3. 安裝到模擬器
    echo "📱 安裝到模擬器..."
    APP_PATH="ios/build/Build/Products/Debug-iphonesimulator/Nuances.app"
    SIMULATOR_ID=$(xcrun simctl list devices booted | grep "iPhone" | head -1 | grep -oE '\([A-F0-9-]+\)' | tr -d '()')
    
    xcrun simctl install "$SIMULATOR_ID" "$APP_PATH"
    
    # 4. 啟動應用
    echo "🚀 啟動應用..."
    xcrun simctl launch "$SIMULATOR_ID" com.anonymous.nuances
    
    echo "✅ 完成！應用已在模擬器中運行。"
else
    echo "❌ 構建失敗，請查看錯誤訊息"
    exit 1
fi
