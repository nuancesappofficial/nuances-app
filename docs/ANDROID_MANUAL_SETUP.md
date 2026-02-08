# Manual Setup Guide for Android Development

## Issue: Cannot find JDK installation

The automated script couldn't locate the JDK. Let's fix this manually.

---

## Option 1: Quick Fix - Use Simpler Method (RECOMMENDED)

Instead of using Chocolatey, download Android Studio which includes everything:

### Step 1: Download Android Studio
Visit: https://developer.android.com/studio

### Step 2: Install
- Run the installer
- Accept default options
- It will install:
  - Android SDK
  - Android SDK Tools
  - Java (bundled)
  - Emulator

### Step 3: Setup Emulator
After installation:
1. Open Android Studio
2. More Actions → Virtual Device Manager
3. Create Device → Pixel 7
4. Download System Image (Android 14)
5. Finish

### Step 4: Start Emulator
- In Android Studio, click the green play button next to your emulator

### Step 5: Run Your App
In a new terminal:
```bash
cd "c:\Vibe coding projects\nuances-app 3.0\nuances-app"
npx expo start --dev-client --android
```

Press 'a' to install on emulator!

---

## Option 2: Fix Current Installation

### Find Java Path Manually

Open PowerShell and run:
```powershell
# Search for java.exe
Get-ChildItem C:\ -Recurse -Filter java.exe -ErrorAction SilentlyContinue | Where-Object { $_.FullName -like "*jdk*" } | Select-Object -First 5 FullName
```

### Set JAVA_HOME

Once you find the path (should end with `\bin\java.exe`), use the parent of `bin`:

For example, if you find: `C:\ProgramData\chocolatey\lib\openjdk11\tools\jdk-11.0.16+8\bin\java.exe`

Then JAVA_HOME should be: `C:\ProgramData\chocolatey\lib\openjdk11\tools\jdk-11.0.16+8`

Run:
```powershell
$javaHome = "YOUR_PATH_HERE"  # Replace with actual path
[System.Environment]::SetEnvironmentVariable('JAVA_HOME', $javaHome, 'User')
$env:JAVA_HOME = $javaHome

# Add to PATH
$javaPath = "$javaHome\bin"
$currentPath = [System.Environment]::GetEnvironmentVariable('Path', 'User')
[System.Environment]::SetEnvironmentVariable('Path', "$currentPath;$javaPath", 'User')
$env:Path = "$env:Path;$javaPath"

# Verify
& "$javaHome\bin\java.exe" -version
```

### Continue with Android SDK

After fixing Java:
```powershell
cd C:\Android\android-sdk\tools\bin
echo y | .\sdkmanager --licenses
.\sdkmanager "platform-tools" "platforms;android-34" "build-tools;34.0.0" "emulator" "system-images;android-34;google_apis;x86_64"
echo no | .\avdmanager create avd -n Pixel_7_API_34 -k "system-images;android-34;google_apis;x86_64" -d "pixel_7" --force
```

---

## My Recommendation

**Go with Option 1 (Android Studio)**

Why?
- Easier to setup
- One-click install
- Includes everything
- Better emulator performance
- Can use GUI to manage emulators

Time: 15-20 minutes total

---

## Which do you prefer?

**A) Download Android Studio (recommended - easier)**
**B) Continue fixing current installation (more complex)**

Let me know and I'll guide you! 🚀
