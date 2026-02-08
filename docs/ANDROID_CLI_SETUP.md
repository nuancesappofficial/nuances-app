# 🤖 Android 開發環境 CLI 安裝指南

## 🎯 目標
用命令行安裝 Android SDK 和模擬器，無需打開 Android Studio GUI。

---

## 📦 方案 A：使用 Chocolatey（推薦）

### 步驟 1: 安裝 Chocolatey（如果還沒有）

**以管理員身份打開 PowerShell**，運行：

```powershell
Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
```

### 步驟 2: 使用 Chocolatey 安裝 Android SDK

```powershell
# 安裝 Android SDK Command Line Tools
choco install android-sdk -y

# 安裝 Java JDK（Android 需要）
choco install openjdk11 -y
```

### 步驟 3: 設置環境變數

```powershell
# 設置 ANDROID_HOME
[System.Environment]::SetEnvironmentVariable('ANDROID_HOME', 'C:\Android\android-sdk', 'User')

# 添加到 PATH
$currentPath = [System.Environment]::GetEnvironmentVariable('Path', 'User')
$newPath = $currentPath + ';C:\Android\android-sdk\platform-tools;C:\Android\android-sdk\emulator;C:\Android\android-sdk\tools;C:\Android\android-sdk\tools\bin'
[System.Environment]::SetEnvironmentVariable('Path', $newPath, 'User')

# 重新載入環境變數（或重啟 PowerShell）
$env:ANDROID_HOME = 'C:\Android\android-sdk'
$env:Path = [System.Environment]::GetEnvironmentVariable('Path', 'User')
```

### 步驟 4: 安裝必要的 Android 組件

```powershell
# 接受許可
cd $env:ANDROID_HOME\tools\bin
./sdkmanager --licenses

# 安裝必要組件
./sdkmanager "platform-tools" "platforms;android-34" "build-tools;34.0.0" "emulator" "system-images;android-34;google_apis;x86_64"
```

### 步驟 5: 創建虛擬設備（AVD）

```powershell
# 創建模擬器
./avdmanager create avd -n Pixel_7_API_34 -k "system-images;android-34;google_apis;x86_64" -d "pixel_7"
```

### 步驟 6: 啟動模擬器

```powershell
# 啟動模擬器
cd $env:ANDROID_HOME\emulator
./emulator -avd Pixel_7_API_34
```

---

## 📦 方案 B：手動下載 SDK Tools

### 步驟 1: 下載 Android Command Line Tools

```powershell
# 創建目錄
New-Item -Path "C:\Android" -ItemType Directory -Force
cd C:\Android

# 下載 Command Line Tools（使用瀏覽器或 curl）
# 下載地址：https://developer.android.com/studio#command-line-tools-only
```

手動下載：https://developer.android.com/studio#command-line-tools-only
- 選擇 Windows 版本
- 解壓到 `C:\Android\cmdline-tools`

### 步驟 2: 設置環境變數

```powershell
[System.Environment]::SetEnvironmentVariable('ANDROID_HOME', 'C:\Android', 'User')
[System.Environment]::SetEnvironmentVariable('ANDROID_SDK_ROOT', 'C:\Android', 'User')

$currentPath = [System.Environment]::GetEnvironmentVariable('Path', 'User')
$newPath = $currentPath + ';C:\Android\cmdline-tools\latest\bin;C:\Android\platform-tools;C:\Android\emulator'
[System.Environment]::SetEnvironmentVariable('Path', $newPath, 'User')
```

### 步驟 3-6: 同方案 A

---

## 🚀 快速安裝腳本（一鍵執行）

創建 `install-android.ps1`：

```powershell
# install-android.ps1
# 以管理員身份運行

Write-Host "🤖 開始安裝 Android 開發環境..." -ForegroundColor Green

# 1. 檢查並安裝 Chocolatey
if (!(Get-Command choco -ErrorAction SilentlyContinue)) {
    Write-Host "📦 安裝 Chocolatey..." -ForegroundColor Yellow
    Set-ExecutionPolicy Bypass -Scope Process -Force
    [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
    iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
}

# 2. 安裝 Android SDK 和 Java
Write-Host "📱 安裝 Android SDK..." -ForegroundColor Yellow
choco install android-sdk -y
choco install openjdk11 -y

# 3. 設置環境變數
Write-Host "🔧 設置環境變數..." -ForegroundColor Yellow
[System.Environment]::SetEnvironmentVariable('ANDROID_HOME', 'C:\Android\android-sdk', 'User')
[System.Environment]::SetEnvironmentVariable('JAVA_HOME', 'C:\Program Files\OpenJDK\jdk-11', 'User')

$currentPath = [System.Environment]::GetEnvironmentVariable('Path', 'User')
$androidPaths = ';C:\Android\android-sdk\platform-tools;C:\Android\android-sdk\emulator;C:\Android\android-sdk\tools;C:\Android\android-sdk\tools\bin'
$javaPaths = ';C:\Program Files\OpenJDK\jdk-11\bin'
[System.Environment]::SetEnvironmentVariable('Path', $currentPath + $androidPaths + $javaPaths, 'User')

# 重新載入環境變數
$env:ANDROID_HOME = 'C:\Android\android-sdk'
$env:JAVA_HOME = 'C:\Program Files\OpenJDK\jdk-11'
$env:Path = [System.Environment]::GetEnvironmentVariable('Path', 'User')

Write-Host "✅ 環境變數設置完成" -ForegroundColor Green

# 4. 安裝 Android 組件
Write-Host "📦 安裝 Android 組件（這可能需要幾分鐘）..." -ForegroundColor Yellow
cd "$env:ANDROID_HOME\tools\bin"

# 接受許可
Write-Host "📝 接受許可..." -ForegroundColor Yellow
echo y | ./sdkmanager --licenses

# 安裝組件
Write-Host "⬇️ 下載 Android 組件..." -ForegroundColor Yellow
./sdkmanager "platform-tools" "platforms;android-34" "build-tools;34.0.0" "emulator" "system-images;android-34;google_apis;x86_64"

Write-Host "✅ Android 組件安裝完成" -ForegroundColor Green

# 5. 創建模擬器
Write-Host "🎮 創建虛擬設備..." -ForegroundColor Yellow
echo no | ./avdmanager create avd -n Pixel_7_API_34 -k "system-images;android-34;google_apis;x86_64" -d "pixel_7" --force

Write-Host "✅ 虛擬設備創建完成" -ForegroundColor Green
Write-Host "" 
Write-Host "🎉 安裝完成！" -ForegroundColor Green
Write-Host ""
Write-Host "下一步：" -ForegroundColor Yellow
Write-Host "1. 重新打開 PowerShell（載入新環境變數）" -ForegroundColor White
Write-Host "2. 運行：cd '$env:ANDROID_HOME\emulator'" -ForegroundColor White
Write-Host "3. 運行：./emulator -avd Pixel_7_API_34" -ForegroundColor White
Write-Host ""
Write-Host "或者運行：start-emulator.ps1" -ForegroundColor Cyan
```

---

## 🎮 啟動腳本

創建 `start-emulator.ps1`：

```powershell
# start-emulator.ps1

Write-Host "🚀 啟動 Android 模擬器..." -ForegroundColor Green

# 確保環境變數已設置
if (!$env:ANDROID_HOME) {
    $env:ANDROID_HOME = 'C:\Android\android-sdk'
}

cd "$env:ANDROID_HOME\emulator"
./emulator -avd Pixel_7_API_34
```

---

## 📋 使用步驟

### 1. 安裝（一次性）

**以管理員身份打開 PowerShell**：

```powershell
# 創建安裝腳本
cd "c:\Vibe coding projects\nuances-app 3.0\nuances-app"
# 複製上面的 install-android.ps1 內容並保存

# 執行安裝
.\install-android.ps1
```

**安裝時間**：15-30 分鐘（取決於網速）

### 2. 啟動模擬器

**重新打開 PowerShell**（普通權限即可）：

```powershell
# 方法 1：直接命令
cd C:\Android\android-sdk\emulator
./emulator -avd Pixel_7_API_34

# 方法 2：使用腳本
.\start-emulator.ps1
```

### 3. 構建並安裝應用

**在另一個終端**：

```bash
cd "c:\Vibe coding projects\nuances-app 3.0\nuances-app"

# 構建 Android APK
eas build --profile development --platform android --local

# 或使用 Expo 直接運行
npx expo start --dev-client --android
```

---

## ⚡ 最快方案：使用 Expo 內建模擬器支援

實際上，Expo 可以自動啟動模擬器！

```bash
# 安裝 Android SDK 後，直接運行：
npx expo start --dev-client

# 按 'a' 鍵，Expo 會自動：
# 1. 檢測模擬器
# 2. 啟動模擬器（如果未運行）
# 3. 安裝應用
# 4. 運行應用
```

---

## 🔍 驗證安裝

```powershell
# 檢查 sdkmanager
sdkmanager --version

# 檢查 emulator
emulator -version

# 檢查 adb
adb version

# 列出已安裝的 AVD
emulator -list-avds
```

應該看到：
```
Pixel_7_API_34
```

---

## ⚠️ 常見問題

### Q: Chocolatey 安裝失敗？
A: 確保以管理員身份運行 PowerShell

### Q: sdkmanager 找不到？
A: 重新打開 PowerShell 載入新環境變數

### Q: 模擬器啟動很慢？
A: 第一次啟動需要 2-5 分鐘，之後會更快

### Q: 模擬器黑屏？
A: 等待幾分鐘，或檢查 BIOS 是否啟用虛擬化（VT-x/AMD-V）

---

## 💡 推薦配置

創建兩個腳本文件在專案根目錄：

### `scripts/install-android.ps1`
（上面的安裝腳本）

### `scripts/start-dev.ps1`
```powershell
# start-dev.ps1
# 一鍵啟動開發環境

Write-Host "🚀 啟動 Nuances 開發環境..." -ForegroundColor Green

# 啟動模擬器（後台）
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$env:ANDROID_HOME\emulator'; ./emulator -avd Pixel_7_API_34"

# 等待模擬器啟動
Write-Host "⏳ 等待模擬器啟動..." -ForegroundColor Yellow
Start-Sleep -Seconds 30

# 啟動 Expo 開發伺服器
Write-Host "📱 啟動 Expo..." -ForegroundColor Yellow
cd "c:\Vibe coding projects\nuances-app 3.0\nuances-app"
npx expo start --dev-client --android
```

---

## 🎯 總結

**最簡單的流程**：

```powershell
# 1. 安裝（一次性，15-30分鐘）
.\install-android.ps1

# 2. 重啟 PowerShell

# 3. 每次開發時運行
.\start-dev.ps1
```

**準備開始安裝嗎？** 🚀
