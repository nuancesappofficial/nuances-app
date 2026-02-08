# start-emulator.ps1
# 啟動 Android 模擬器

Write-Host "🚀 啟動 Android 模擬器..." -ForegroundColor Green

# 確保環境變數已設置
if (!$env:ANDROID_HOME) {
    $env:ANDROID_HOME = 'C:\Android\android-sdk'
}

if (Test-Path "$env:ANDROID_HOME\emulator") {
    cd "$env:ANDROID_HOME\emulator"
    ./emulator -avd Pixel_7_API_34
} else {
    Write-Host "❌ 找不到 Android emulator，請先運行 install-android.ps1" -ForegroundColor Red
}
