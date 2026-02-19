# Why Nuances Doesn’t Appear in the Share Sheet (and How to Fix It)

Your app won’t show in the iOS Share Sheet until the **Share Extension** is added as a target in Xcode and the app is rebuilt. The Swift files and config are already in the repo; they just need to be wired into the project.

---

## 1. You’re not using Expo Go

Share Extensions **do not work in Expo Go**. You must run a **development build** (e.g. `npx expo run:ios` or an EAS build). If you’re only opening the app via Expo Go, the Share Sheet will never show Nuances.

---

## 2. Add the Share Extension target in Xcode

The plugin created the extension files under `ios/NuancesShareExtension/`, but the Xcode project does **not** automatically get a Share Extension target. You have to add it once.

### Step 1: Open the project

```bash
cd ios
open Nuances.xcworkspace
```

Use **Nuances.xcworkspace** (not the `.xcodeproj`).

### Step 2: Create a Share Extension target

1. In Xcode, select the **project** (blue “Nuances” at the top of the left sidebar).
2. At the bottom of the left sidebar, click the **+** button under “TARGETS” (or **File → New → Target**).
3. Choose **iOS → Share Extension** → Next.
4. Set:
   - **Product Name**: `NuancesShareExtension`
   - **Team**: your team
   - **Bundle Identifier**: `com.jeffenglishlearning.nuances.NuancesShareExtension`  
     (must match your main app’s bundle ID + `.NuancesShareExtension`)
   - **Language**: Swift  
   - Leave “Include UI Extension” **unchecked**.
5. Finish. Xcode will create a new target and a default `ShareViewController.swift`.

### Step 3: Use the existing Share Extension code

1. In the Project Navigator, find the **NuancesShareExtension** group (under the new target).
2. **Delete** the auto-generated `ShareViewController.swift` (the one Xcode just created).
3. **Add** the existing files:
   - Right‑click **NuancesShareExtension** → **Add Files to "Nuances"…**
   - Go to `ios/NuancesShareExtension/`
   - Select:
     - `ShareViewController.swift`
     - `Info.plist`
     - `NuancesShareExtension.entitlements`
   - Leave “Copy items if needed” **unchecked** (they’re already in the project folder).
   - Ensure the **NuancesShareExtension** target is checked.
4. If Xcode created its own `Info.plist` for the extension, remove it from the target and use **our** `Info.plist` as the extension’s Info.plist (Target → Build Settings → “Info.plist File” → `NuancesShareExtension/Info.plist`).

### Step 4: App Groups (main app and extension)

**Main app (Nuances):**

1. Select the **Nuances** target.
2. Open **Signing & Capabilities**.
3. **+ Capability** → **App Groups**.
4. Add (or select): `group.com.jeffenglishlearning.nuances`.

**Share Extension (NuancesShareExtension):**

1. Select the **NuancesShareExtension** target.
2. **Signing & Capabilities** → **+ Capability** → **App Groups**.
3. Add the **same** group: `group.com.jeffenglishlearning.nuances`.

### Step 5: Build and run

1. Select the **Nuances** scheme (main app).
2. Choose a simulator or device.
3. **Product → Run** (or ⌘R).

After the app installs, use the Share Sheet (e.g. from Safari or Photos). You should see **Nuances** in the share options.

---

## 3. Where to find Nuances in the Share Sheet

- **Safari / Notes / etc.**: Select text → tap **Share** → scroll the app row; Nuances should appear. You can also tap **More** (or “Edit”) and enable Nuances.
- **Photos**: Open a photo → **Share** → same app row; Nuances appears when sharing images (up to 3).
- If you don’t see it: scroll horizontally in the share row, or tap **More** and turn Nuances **On**.

---

## 4. Quick checklist

- [ ] Using a **development build** (e.g. `npx expo run:ios`), not Expo Go.
- [ ] Opened **Nuances.xcworkspace** in Xcode.
- [ ] Added a **Share Extension** target named `NuancesShareExtension`.
- [ ] Replaced Xcode’s `ShareViewController.swift` with the one in `ios/NuancesShareExtension/`.
- [ ] Extension target uses `ios/NuancesShareExtension/Info.plist`.
- [ ] **App Groups** added for both **Nuances** and **NuancesShareExtension** with `group.com.jeffenglishlearning.nuances`.
- [ ] Built and ran the **Nuances** scheme; then tested Share from Safari or Photos.

After this, Nuances will show in the Share Sheet when sharing text or images (1–3), and only in a build that includes this Share Extension target.
