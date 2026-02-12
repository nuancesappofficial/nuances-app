# Mac 上測試 Nuances MVP — 待辦清單

依據 **PRD**、**Tech Stack** 與現有程式碼整理。目標：在 Mac 上能跑起並驗證 MVP。

---

## ✅ 已為你完成

- **`.env`** 已從 `.env.example` 建立（MVP 可不填 API key，使用 Mock）。
- **`scripts/mac-mvp-run.sh`** 已建立，可在本機終端一次執行安裝與啟動。

---

## ⚠️ 若出現 `command not found: npm`（尚未安裝 Node.js）

請先安裝 Node.js 18+，任選一種方式：

### 方式 1：官網安裝（最簡單）

1. 打開 **https://nodejs.org**
2. 下載 **LTS** 版本並安裝
3. **關閉並重新打開終端**，再執行 `node -v` 和 `npm -v` 確認

### 方式 2：用 Homebrew（若已安裝 brew）

```bash
brew install node
```

安裝後**關閉並重新打開終端**，再執行 `node -v`。

### 方式 3：用 nvm（可管理多個 Node 版本）

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
```

關閉並重新打開終端後：

```bash
nvm install 20
nvm use 20
node -v
npm -v
```

### 純 CLI 安裝（不開瀏覽器）

**選項 A：nvm（推薦，同一終端即可用）**

在終端依序執行：

```bash
# 1. 安裝 nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash

# 2. 載入 nvm（不用關終端）
source ~/.nvm/nvm.sh

# 3. 安裝並使用 Node 20
nvm install 20
nvm use 20

# 4. 確認
node -v
npm -v
```

之後新開終端若沒有 `nvm`，先執行 `source ~/.nvm/nvm.sh`，或把安裝完成時提示的兩行加入 `~/.zshrc`。

**選項 B：Homebrew（若已安裝 brew）**

```bash
brew install node
```

**選項 C：官方 .pkg 用 curl 下載後安裝**

（Apple Silicon M1/M2/M3）：

```bash
curl -o node.pkg https://nodejs.org/dist/v20.18.0/node-v20.18.0-darwin-arm64.pkg
sudo installer -pkg node.pkg -target /
rm node.pkg
```

（Intel Mac）：

```bash
curl -o node.pkg https://nodejs.org/dist/v20.18.0/node-v20.18.0-darwin-x64.pkg
sudo installer -pkg node.pkg -target /
rm node.pkg
```

安裝後**關閉並重新打開終端**，執行 `node -v`、`npm -v` 確認。

---

## 🖥️ 請在本機終端依序執行

以下指令需在 **Mac 的 Terminal** 執行（確保已安裝 Node 18+，可用 `node -v` 檢查）：

```bash
cd "/Users/users/vibe coding projects/nuances-app"
npm install
```

（若出現 `ERESOLVE could not resolve` 的 peer 衝突，專案已設 `.npmrc` 使用 `legacy-peer-deps`，再執行一次 `npm install` 即可。）

然後二選一：

- **路徑 A（快速預覽）**：`npm start` → 終端出現選單後按 **`i`** 開 iOS 模擬器。
- **路徑 B（完整 MVP）**：`npx expo run:ios`（會編譯並開啟 iOS 模擬器）。

或直接執行腳本（會先安裝依賴再問是否啟動）：

```bash
chmod +x scripts/mac-mvp-run.sh
./scripts/mac-mvp-run.sh
```

---

## 一、前置環境（依序完成）

| # | 項目 | 說明 | 驗證方式 |
|---|------|------|----------|
| 1 | **Node.js 18+** | 專案需求 | `node -v` |
| 2 | **Xcode**（要用 iOS 模擬器時） | 從 App Store 安裝，並安裝 Command Line Tools | `xcode-select -p`、Xcode → Settings → Locations |
| 3 | **Watchman**（可選） | 提升檔案監聽穩定性 | `watchman --version` |
| 4 | **CocoaPods**（路徑 B 需） | iOS 原生依賴管理 | `pod --version` |
| 5 | **Expo Go**（僅快速預覽時） | 手機裝 Expo Go，或直接用模擬器 | 手機 App Store 搜尋 "Expo Go" |

---

## ⚠️ 若出現 CocoaPods not found / brew ENOENT

`npx expo run:ios` 需要 **CocoaPods**。若 Expo 自動安裝失敗（例如沒有 Homebrew），請手動安裝：

### 方式 1：先裝 Homebrew，再裝 CocoaPods（推薦）

```bash
# 1. 安裝 Homebrew（依提示操作，需輸入密碼）
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 2. 依安裝完成時提示，把 brew 加入 PATH（Apple Silicon 常見為）：
echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
eval "$(/opt/homebrew/bin/brew shellenv)"

# 3. 安裝 CocoaPods
brew install cocoapods

# 4. 確認
pod --version
```

Intel Mac 的 PATH 可能是 `/usr/local/bin/brew`，請依終端提示為準。

### 方式 2：用系統 Ruby 安裝 CocoaPods（不裝 Homebrew）

```bash
sudo gem install cocoapods
```

若出現權限或 Ruby 版本錯誤，改用方式 1。

安裝完成後，在專案目錄再執行：

```bash
cd "/Users/users/vibe coding projects/nuances-app"
npx expo run:ios
```

---

## 二、專案設定

| # | 項目 | 指令/步驟 |
|---|------|------------|
| 1 | **進入專案目錄** | `cd "/Users/users/vibe coding projects/nuances-app"` |
| 2 | **安裝依賴** | `npm install` |
| 3 | **環境變數（可選）** | ✅ 已建立 `.env`；MVP 可不填 API key（使用 Mock 分析） |

`.env` 可填項（進階／雲端同步時再用）：

- `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_OPENAI_API_KEY`（未填則走 Mock 分析）
- `EXPO_PUBLIC_AZURE_SPEECH_KEY` / `EXPO_PUBLIC_AZURE_SPEECH_REGION`（發音功能再用）

---

## 三、選擇測試方式

### 路徑 A：快速預覽（Expo Go / 網頁）

- **特點**：不用建置、啟動快；**資料庫為 Mock／關閉**，僅驗證 UI、導航、流程。
- **適合**：先確認畫面與操作是否正常。

| 步驟 | 指令 |
|------|------|
| 1 | `npm start` |
| 2 | 終端按 **`i`** 用 iOS 模擬器打開，或按 **`w`** 用網頁；或用手機掃 QR 用 Expo Go 打開 |

**注意**：在 Expo Go 下 App 會偵測為 Expo Go，跳過 WatermelonDB 初始化，只顯示 UI（見 `App.tsx`）。

---

### 路徑 B：完整 MVP（含 WatermelonDB、本地資料庫）

- **特點**：含本地 DB、快取、卡片、SRS，最接近真實 MVP。
- **需求**：Mac、Xcode、**CocoaPods**、iOS Simulator（見上方「若出現 CocoaPods not found」）。

| 步驟 | 指令 |
|------|------|
| 1 | `npx expo run:ios` |
| 2 | 等待編譯與模擬器啟動（首次較久） |
| 3 | 在模擬器內操作：快取列表、新增項目、卡片、複習 |

此路徑會編譯 native 模組（含 WatermelonDB），**不需** EAS 或實機。

---

## 四、功能驗證清單（對應 PRD Phase 1–3）

完成「路徑 A」或「路徑 B」後，可依此檢查：

| 功能 | 說明 | 路徑 A | 路徑 B |
|------|------|--------|--------|
| 快取列表 | 列表/空狀態、下拉更新 | ✅ UI | ✅ 含本地資料 |
| 新增項目 | 文字/URL/圖片、關鍵字 | ✅ UI | ✅ 寫入 DB |
| 卡片列表 | 全部/待複習、標籤 | ✅ UI | ✅ 真實卡片 |
| 複習流程 | SRS、評分、排程 | ⚠️ 有限 | ✅ 完整 |
| 雲端同步 | Supabase | ❌ 需 .env | 可選（需 .env） |

---

## 五、常見問題（Mac）

- **`No iOS devices available in Simulator.app`**  
  代表尚未安裝或建立 iOS 模擬器。作法：打開 **Xcode** → 選單 **Xcode → Settings**（或 **Preferences**）→ **Platforms**（或 **Components**）→ 確認有 **iOS 26.x**（或任一 iOS 版本）且狀態為已安裝；若沒有則按 **+** 或 **Get** 下載。完成後關閉 Xcode，再執行 `npx expo run:ios`。或先手動打開 **Simulator**（Spotlight 搜尋 "Simulator"），讓系統建立預設裝置後再跑一次。

- **`expo run:ios` 找不到 Xcode**  
  安裝 Xcode 並執行：`sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`

- **模擬器很慢或當掉**  
  關閉其他大型 App，或換一台較新的模擬器機型。

- **埠被佔用**  
  `npx expo start --clear` 或換埠（例如 `--port 8082`）。

- **要用手機實機測完整 MVP**  
  需走 EAS Development Build（見 `docs/MVP_COMPLETE.md`），Mac 上先以模擬器驗證即可。

---

## 六、建議順序（摘要）

1. 完成「一、前置環境」與「二、專案設定」。
2. 先做 **路徑 A**（`npm start` → 按 `i` 或掃 QR）確認 UI 與流程。
3. 再做 **路徑 B**（`npx expo run:ios`）驗證完整 MVP（DB、卡片、SRS）。
4. 用「四、功能驗證清單」逐項打勾。

完成以上即算在 Mac 上成功測試 MVP。
