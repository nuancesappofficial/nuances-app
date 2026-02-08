# start-dev.ps1
# 一鍵啟動開發環境：模擬器 + Expo 開發伺服器

Write-Host "🚀 啟動 Nuances 開發環境..." -ForegroundColor Green

# 確保環境變數已設置
if (!$env:ANDROID_HOME) {
    $env:ANDROID_HOME = 'C:\Android\android-sdk'
}

# 啟動模擬器（後台）
Write-Host "📱 啟動 Android 模擬器..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$env:ANDROID_HOME\emulator'; ./emulator -avd Pixel_7_API_34"

# 等待模擬器啟動
Write-Host "⏳ 等待模擬器啟動（30秒）..." -ForegroundColor Yellow
Start-Sleep -Seconds 30

# 啟動 Expo 開發伺服器
Write-Host "🔧 啟動 Expo 開發伺服器..." -ForegroundColor Yellow
cd "c:\Vibe coding projects\nuances-app 3.0\nuances-app"
npx expo start --dev-client --android
