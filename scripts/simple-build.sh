#!/bin/bash
# Simple iOS build script - bypasses Expo's device caching

set -e
cd "$(dirname "$0")/.."

echo "🧹 Cleaning..."
rm -rf ios/build

echo "🔨 Building with xcodebuild..."
xcodebuild \
  -workspace ios/Nuances.xcworkspace \
  -scheme Nuances \
  -configuration Debug \
  -sdk iphonesimulator \
  -derivedDataPath ios/build \
  -destination 'generic/platform=iOS Simulator' \
  build \
  | grep -E "BUILD|error|warning|Nuances.app" || true

echo ""
echo "📱 Installing to simulator..."
SIMULATOR_ID="737383B6-3317-4059-9141-6015F0EE183F"
APP_PATH="ios/build/Build/Products/Debug-iphonesimulator/Nuances.app"

if [ -d "$APP_PATH" ]; then
    xcrun simctl install "$SIMULATOR_ID" "$APP_PATH"
    xcrun simctl launch "$SIMULATOR_ID" com.anonymous.nuances
    echo "✅ Done! App should be running on simulator."
else
    echo "❌ App not found at: $APP_PATH"
    echo "Trying to find it..."
    find ios/build -name "Nuances.app" 2>/dev/null
fi
