# install-android.ps1
# 以管理員身份運行此腳本

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
Write-Host "2. 運行：cd `$env:ANDROID_HOME\emulator" -ForegroundColor White
Write-Host "3. 運行：./emulator -avd Pixel_7_API_34" -ForegroundColor White
Write-Host ""
Write-Host "或者在專案目錄運行：.\scripts\start-emulator.ps1" -ForegroundColor Cyan
