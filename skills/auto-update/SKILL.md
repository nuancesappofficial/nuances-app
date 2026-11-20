---
name: auto-update
description: 雙平台（iOS 與 Android）自動化打包、版號同步與商店發布（App Store / TestFlight & Google Play Console）。當使用者要求自動發布 App、更新版本、設定 Google Play 服務帳戶自動上傳、或解決 EAS 憑證問題時使用。
---

# Auto Update Skill（雙平台自動化打包、發布與版號政策）

本 Skill 統整 Nuances App 及同帳號下其他 App 的 iOS（TestFlight / App Store）與 Android（Google Play Console）雙平台自動化打包、商店直推（EAS Submit）與版號同步政策流程。

---

## 一、AI Agent 執行準則（自動引導與跨 App 自適應）

當使用者觸發 `/auto-update` 時，Agent 切勿要求使用者手動修改檔案，必須嚴格依照以下順序引導：

1. **檢查並自動補齊 `eas.json` 直推設定（跨 App 支援）**：
   檢查專案 `eas.json` 是否包含 `submit.production.ios`、`submit.production.android` 與 `submit.closed.android`：
   - 若未配置（如其他新 App 專案），Agent 自動為該專案注入標準共用配置（見第四節）。
   - 若為新 App，提醒使用者至 Google Play Console「使用者和權限」勾選新 App 授權。
2. **讀取當前版本與雙平台版號遞增規範**：
   - 檢查 `app.json`、`ios/Nuances.xcodeproj/project.pbxproj`、`android/app/build.gradle` 與 `eas.json` 的最新版號與 build 號。
   - **Android `versionCode` 終生強制單調遞增（不可重設、不可倒退）**：Google Play 將 `versionCode` 視為整個 App 生命週期的唯一全域整數。**無論行銷版號（`version` / `versionName`）如何變更（Patch、Minor、Major），Android `versionCode` 都絕對不可重設、不可倒退，必須在全域歷史最高碼上持續嚴格單調遞增（Monotonically Increasing）**。
   - **EAS 遠端版號與本地建置規範**：專案 `eas.json` 採用 `"appVersionSource": "remote"` 搭配 `autoIncrement: true`。無論是雲端建置或本地建置（`--local`），EAS 皆會自動維持 Android `versionCode` 與 iOS `buildNumber` 的遠端自增計數。Agent 嚴禁將 Android `versionCode` 手動壓低或強行重設，否則 Google Play 會直接回報「This version code was already uploaded」並中斷發布。
3. **主動提問版號選項（強制調用 `ask_question`）**：
   計算下一版候選號碼，主動彈出單選選單讓使用者點選：
   - Patch 修復版（如：`1.3.4` -> `1.3.5`，雙平台 Build 號依政策各自遞增）
   - Minor 功能版（如：`1.3.4` -> `1.4.0`，雙平台 Build 號依政策各自遞增）
   - 僅更新 Build 號（如：維持 `1.3.4`，雙平台 Build 號各自遞增 +1）
   - 自訂輸入（由使用者自行輸入）
4. **自動更新檔案並驗證**：使用者選定後，由 Agent 自動寫入 3 處檔案並執行一致性測試。
5. **提議版本新功能與公告板（WhatsNew / Update List UI，僅在版號更新時觸發）**：
   - **若僅增加 Build 號（版號維持不變）**：直接略過此步驟，無需搜尋 Commit 與更動 `src/config/whatsNew.ts`。
   - **若版號更新（Patch / Minor 等）**：
     - Agent 自動搜尋上一個版本 Release Commit 至當前 HEAD 之間的所有 Commits（例如透過 `git log --grep="chore(release)"` 找出上一版節點比對）。
     - **極致精簡（Simplified & Plain）**：嚴格限制 2 到 3 項。每項僅保留一句短語（繁中約 8~12 字，英文約 4~6 單字），如「測驗同步紀錄發音成果 / Pronunciation records in quizzes」、「發音即時快取與預載播放 / Faster audio loading & caching」，嚴禁冗長敘述、技術術語或浮誇行銷詞彙。
     - **全語系在地化（Localized to all supported languages）**：公告檔案 `src/config/whatsNew.ts` 必須同時涵蓋所有支援語系（`zh-TW`, `en`, `ja`, `ko`, `zh-CN`, `es`, `fr`），並透過 `WhatsNewModal` 支援多語系即時切換。
     - **格式規範**：純編號（1, 2, 3），嚴禁使用任何 Emoji。
     - 主動呈現於對話中供使用者檢查與確認。
     - 使用者確認無誤後，Agent 再自動寫入 `src/config/whatsNew.ts`。
6. **雙平行終端機打包直推（強制雙軌並行）**：
   執行打包直推時，Agent 嚴禁調用合併指令，必須建立兩個獨立 Persistent Terminal 分別執行 iOS 與 Android 建置，各別向使用者回報進度與 EAS 監控 URL。
   - **預設一律本機建置（`--local`）**：iOS 與 Android 皆在本機打包，不消耗 EAS 雲端免費額度、免排隊。iOS 需本機 Xcode，Android 需本機 Java 與 Android SDK。
   - **iOS 軌道**：本機建置產出 `.ipa`，接續以 `eas submit` 直推 TestFlight。
   - **Android 軌道**：本機建置產出 AAB，接續以 `eas submit` 直推 Google Play **內部測試**；再把同一版本**晉升到封閉測試（Alpha）**（見步驟 4）。內部與封閉測試必須是同一版本，不可只更新內部測試。
   - 僅當使用者明確要求雲端建置（且額度充足）時，才改用附錄的雲端指令。

---

## 二、端到端標準發布 SOP（5 步流程）

### 步驟 1：Agent 提問版號、自動更新版號與公告板，並執行驗證
由 Agent 自動更新版號檔案：
1. `app.json`（version, buildNumber, versionCode）
2. `ios/Nuances.xcodeproj/project.pbxproj`（MARKETING_VERSION, CURRENT_PROJECT_VERSION）
3. `android/app/build.gradle`（versionName, versionCode）
4. `src/config/whatsNew.ts`（**僅版號更新時**：更新提議並寫入本次版本重點公告；若僅更新 Build 號則略過此項）

完成寫入後，由 Agent 自動執行一致性測試：
```bash
node --test scripts/appVersionConsistency.test.mjs
```

### 步驟 2：Git 存檔提交
確保所有版號、公告與相關修改已提交：
```bash
git add .
git commit -m "chore(release): bump version to X.Y.Z (build N)"
git push
```

### 步驟 3：雙平台平行終端機打包直推（強制雙軌並行）
Agent 或開發者須在兩個獨立終端機（Parallel Terminals）同時並行執行建置與自動推送到商店後台，避免日誌混雜或單一平台卡住阻塞：

#### 終端機 1（iOS 本機建置 -> TestFlight）
```bash
export EXPO_APP_STORE_AUTH_SERVICE_KEY='e0b80c3bf78523bfe80974d320935bfa30add02e1bff88ec2166c6bd5a706c42'
eas build --platform ios --profile production --local --output /tmp/nuances-release.ipa --non-interactive && eas submit --platform ios --profile production --path /tmp/nuances-release.ipa --non-interactive
```

#### 終端機 2（Android 本機建置 -> Google Play 內部測試與封閉測試雙軌直推）
```bash
eas build --platform android --profile production --local --output /tmp/nuances-release.aab --non-interactive && eas submit --platform android --profile production --path /tmp/nuances-release.aab --non-interactive --non-interactive
```

- **封閉測試（alpha）注意**：同一個 AAB（同一 versionCode）不能再用 `eas submit --profile closed` 重複上傳，Google Play 會回報「This version code was already uploaded」。內部測試上傳成功後，**必須**把該版本從「內部測試」晉升（Promote release）到「封閉測試」，不能略過（見步驟 4）。

#### 附錄：雲端建置指令（僅在使用者明確要求且額度充足時使用）
```bash
eas build --platform ios --profile production --auto-submit
eas build --platform android --profile production --auto-submit --non-interactive && eas submit --platform android --profile closed --latest --non-interactive
```

- **Agent 呼叫準則**：Agent 執行時，必須透過 `run_command` 工具分別指定獨立的 `RequestedTerminalID`（如 `ios-build` 與 `android-build`）並帶上 `RunPersistent: true` 非同步平行發起，取得各自的 EAS Build 監控連結回報給使用者。Android 端本機建置完成並直推內部測試（Internal）後，Agent 必須接著完成封閉測試（Alpha）的晉升，兩軌版本一致後才算 Android 完成。
- **錯誤隔離優勢**：雙軌平行終端機互不阻塞，單一平台的構建或認證異常不會中斷另一平台的打包與自動推送進度。

### 步驟 4：商店後台確認與晉升審查
1. **iOS TestFlight**：Apple 處理完畢（約 5 到 15 分鐘）後，內部測試員手機 TestFlight 會自動收到更新通知。
2. **iOS App Store 正式送審**：登入 [App Store Connect](https://appstoreconnect.apple.com/) -> 建立「+ 新版本」-> 選取此 Build -> 填寫更新內容說明（遵循在地化語言與極簡直白原則，例如「全新介面於... / new interface in ...」）-> 點擊「提交審查」。
3. **Google Play 內部測試 -> 封閉測試（強制，Agent 要做完）**：
   - EAS 只會直推內部測試軌道（靜默背景更新，不發 Email）。
   - Agent 以瀏覽器開啟 Play Console -> 測試 -> 內部測試 -> 該版本「晉升版本」-> 選「封閉測試 - Alpha」，沿用版本說明，到「發布總覽」按「送審」。
   - 若出現「硬體功能需求宣告限制了應用程式的適用範圍」（`android.hardware.screen.portrait`、`android.hardware.wifi`），這只是警告，點「仍要繼續」即可送審，不需改程式。
   - 送審後確認封閉測試軌道顯示新 versionCode，並回報使用者「封閉測試審核中，通過前測試員仍在舊版」。
4. **Google Play 正式版晉升**：登入 [Google Play Console](https://play.google.com/console) -> 點選「內部測試」或「封閉測試」-> 對最新版本點擊「晉升版本（Promote release）」-> 填寫版本說明（同上述在地化與極簡原則）-> 選擇「正式版」送審。

### 步驟 5：更新提示（Version Policy）必須「各平台各自、等該平台版本真的可下載才開」

**核心原則**：強制更新提示會帶使用者去商店下載。哪個平台的新版還沒上架或還沒通過審核，就**絕對不可以**對該平台開啟更新政策，否則更新連結會點不到新版（曾發生：iOS 已通過、Android 未通過，Android 使用者被擋在更新彈窗）。

規則：
1. **Agent 在發版流程中不得主動執行 `npm run sync:app-version-policy*`**（含 `:android`、`:all`），發版當下一律不動政策表。
2. **iOS**：App Store 審核通過並上架後，由 GitHub Actions（`.github/workflows/auto-sync-version-policy.yml`，每 3 小時，僅查 iTunes lookup 已上架版本）自動寫入 `ios` 那一列。只動 iOS，不影響 Android。
3. **Android**：更新通知只看「封閉測試（alpha）」軌道（正式版公開後改看正式版），不看 iOS，也不看內部測試。
   - 巡邏（`scripts/poll-store-and-sync.mjs`）用 Google Play Developer API 讀 alpha 軌道，只認 status 為 completed 的 release，版號取自 release 名稱（EAS 格式「43 (1.3.9)」），build 號用 Play 的 versionCode。審核中或草稿不算，不會提早擋人。
   - 需要 GitHub secret `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`（服務帳戶金鑰 JSON 全文）；本機執行則讀 `/Users/users/.eas-keys/google-service-account.json`。讀不到時巡邏會略過 Android 並發 ntfy 警告，不會誤開。
   - 嚴禁用本機 `build.gradle` 版號當作「已上架」（舊版曾這樣做，審核前就擋住舊版測試員）。
4. **每次寫入前先驗證**：用 `supabase db query --linked "select platform, required, latest_version, minimum_supported_version from app_version_policy;"` 看現況，並確認該平台商店真的已有新版；兩個平台不通過就各自分開處理，嚴禁用 `--platform all` 一次寫兩邊。
5. **誤開的緊急關閉**（測試員被更新彈窗擋住時）：只改被擋的平台那一列，`required = false`、`minimum_supported_version = '0.0.1'`、`latest_version = '0.0.1'`、兩個 build number 設為 null（`minimum_supported_version` 與 `latest_version` 不可為 null）。使用者需完全關閉 App 再重開，App 只在啟動時檢查政策。
6. **手動同步指令（僅在確認該平台已可下載後使用）**：
```bash
npm run sync:app-version-policy:poll     # 檢查商店並自動同步已上架的平台
npm run sync:app-version-policy          # 僅同步 iOS
npm run sync:app-version-policy:android  # 僅同步 Android
```

---

## 三、雙平台測試機制差異（FAQ）

| 特性 | Apple TestFlight | Google Play 內部測試 |
| :--- | :--- | :--- |
| **通知方式** | 每次上傳新 Build 會主動寄送 Email 通知 | 靜默推送，不主動發 Email |
| **更新機制** | 測試員手動打開 TestFlight App 下載更新 | 測試員加入計畫後，Google Play 會在裝置背景自動靜默更新 |
| **首次加入方式** | 透過 Email 邀請加入 TestFlight | 需點擊一次「加入測試邀請連結（Opt-in URL）」加入 |
| **直推目標軌道** | TestFlight | `internal`（內部測試軌道），之後晉升到 `alpha`（封閉測試） |

---

## 四、永久金鑰安全配置與跨 App 共用標準（已就緒）

所有金鑰統一存放於使用者家目錄隱藏專屬資料夾 `/Users/users/.eas-keys/`，避免因清理 Downloads 而遺失，同開發者帳號下的所有 App 均可永久共用。

### 1. `eas.json` 標準共用配置範本
```json
{
  "submit": {
    "production": {
      "ios": {
        "ascApiKeyPath": "/Users/users/.eas-keys/AuthKey_W49BN3Q6GH.p8",
        "ascApiKeyId": "W49BN3Q6GH",
        "ascApiKeyIssuerId": "af584971-02b3-42de-b892-3d23ade35a20"
      },
      "android": {
        "serviceAccountKeyPath": "/Users/users/.eas-keys/google-service-account.json",
        "track": "internal"
      }
    },
    "closed": {
      "android": {
        "serviceAccountKeyPath": "/Users/users/.eas-keys/google-service-account.json",
        "track": "alpha"
      }
    }
  }
}
```

### 2. 憑證與服務帳戶資訊
1. **Apple App Store Connect API Key**：
   - 金鑰 ID：`W49BN3Q6GH`
   - 簽發者 ID（Issuer ID）：`af584971-02b3-42de-b892-3d23ade35a20`
   - 本地私鑰位置：`/Users/users/.eas-keys/AuthKey_W49BN3Q6GH.p8`
   - 認證金鑰報錯解法：`export EXPO_APP_STORE_AUTH_SERVICE_KEY='e0b80c3bf78523bfe80974d320935bfa30add02e1bff88ec2166c6bd5a706c42'`
2. **Android Google Play Service Account**：
   - 服務帳戶 Email：`eas-submit@nunances.iam.gserviceaccount.com`
   - 本地金鑰路徑：`/Users/users/.eas-keys/google-service-account.json`
   - 新 App 啟用方式：至 Google Play Console「使用者和權限」編輯此服務帳戶，勾選加入新 App 即可。
