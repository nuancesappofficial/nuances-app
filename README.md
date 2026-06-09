# Nuances - AI-Powered Language Learning App

Version: 1.0.0 (MVP)  
Status: In Development  
Tech Stack: React Native (Expo) + WatermelonDB + Supabase

**🎉 最新更新**: Share Extension MVP 已完成（2026-02-16）

## 📋 專案概述

Nuances 是一個跨平台語言學習應用，結合了「無摩擦捕獲」系統、智能快取管理和 AI 驅動的發音教練。

### 核心功能
- 📱 **Universal Share Extension**（從任何 App 捕獲文字與圖片）✅ 已完成
- 📋 **剪貼簿快速貼上**（一鍵儲存複製內容）✅ 已完成
- 🧠 AI 智能詞彙分析與高亮
- 🗂️ Notion 風格的資料庫管理
- 🔄 Anki 風格的間隔重複系統
- 🎤 Azure AI 發音評估與反饋
- 📴 Offline-First 架構（本地優先）

## 🛠️ 技術棧

### 前端
- **Framework**: React Native (Expo SDK 54)
- **Language**: TypeScript
- **Local Database**: WatermelonDB (Schema v2)
- **State Management**: Legend-State / Zustand
- **Share Extension**: Custom Config Plugin (Swift Native)
- **Clipboard**: expo-clipboard

### 後端
- **Cloud Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth
- **File Storage**: Supabase Storage
- **API Runtime**: Supabase Edge Functions (Deno)

### AI 服務
- **Vocabulary Analysis**: Google Gemini 1.5 Flash API (免費)
- **Pronunciation**: Azure AI Speech SDK
- **Text-to-Speech**: Azure Neural TTS
- **OCR**: Google ML Kit (本地處理)

## 📱 Share Extension 功能

### Feature A: 文字分享 ✅
從任何 App（Safari、Notes、LINE 等）反白文字 → 分享 → Nuances
- 字數限制：2000 字元
- 自動儲存到 Cache

### Feature B: 圖片分享 ✅
從相簿或其他 App 分享圖片（1-3 張）→ Nuances
- 格式支援：HEIC, JPEG, PNG
- 自動轉換：HEIC → JPEG
- 壓縮：長邊 <= 1920px
- 記憶體安全：< 120MB（Native Swift 處理）

### Feature C: 剪貼簿貼上 ✅
在 App 內直接從剪貼簿貼上文字
- 符合 iOS 隱私規範
- 一鍵快速儲存

**📚 詳細設定**: 請參考 [Share Extension 快速設定指南](./docs/SHARE_EXTENSION_QUICK_SETUP.md)

## 🚀 開始開發

### 前置需求
- Node.js 18+
- npm 或 yarn
- Expo CLI
- Xcode (macOS, for iOS development)
- EAS CLI (for builds)

### 安裝依賴
```bash
cd nuances-app
npm install
```

### 啟動開發伺服器
```bash
npm start
```

### 運行在不同平台
```bash
npm run android  # Android
npm run ios      # iOS (需要 macOS)
npm run web      # Web 瀏覽器
```

## 📁 專案結構

```
nuances-app/
├── src/
│   ├── components/          # 可重用 UI 組件
│   ├── screens/            # 畫面/頁面
│   ├── database/           # WatermelonDB 配置
│   │   ├── models/         # 資料 Models
│   │   ├── schema.js       # ⚠️ 資料庫 Schema（版本控制）
│   │   └── migrations/     # 資料庫遷移
│   ├── services/           # API 和業務邏輯
│   │   ├── supabase/       # Supabase 客戶端
│   │   ├── azure/          # Azure AI 服務
│   │   └── sync/           # 同步邏輯
│   ├── hooks/              # 自定義 React Hooks
│   ├── types/              # TypeScript 類型定義
│   └── utils/              # 工具函數
├── assets/                 # 圖片、字體等靜態資源
├── .cursorrules            # AI 開發規則（重要！）
└── app.config.ts           # Expo 配置
```

## ⚠️ 重要開發規則

### WatermelonDB Schema 管理
1. **每次修改 Model 時，必須更新 `schema.js` 的版本號**
2. Schema 定義必須與 Model 裝飾器完全匹配
3. 添加新欄位需要創建 migration

### Share Extension 配置
- 不要手動修改 native code
- 嚴格遵循 `expo-share-intent` 的文檔
- 修改 `app.config.ts` 後需要重新 build

### 本地優先原則
- 所有操作先寫入 WatermelonDB
- 雲端同步在後台進行
- UI 只讀取本地資料

詳細規則請參閱 `.cursorrules` 文件。

## 📦 主要依賴

### 核心依賴（即將安裝）
```json
{
  "@nozbe/watermelondb": "^0.27.0",
  "@supabase/supabase-js": "^2.39.0",
  "expo-share-intent": "^1.0.0",
  "expo-task-manager": "~12.0.0",
  "expo-av": "~15.0.0",
  "react-native-mlkit": "^1.0.0"
}
```

### AI 服務依賴
```json
{
  "microsoft-cognitiveservices-speech-sdk": "^1.35.0"
}
```

**注意：** 本專案使用 Google Gemini API（透過 REST API 調用），無需安裝額外的 npm 套件。

## 🔐 環境變量

創建 `.env` 文件並添加以下配置：

```env
# Supabase
EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# Azure AI Speech
EXPO_PUBLIC_AZURE_SPEECH_KEY=your_azure_speech_key
EXPO_PUBLIC_AZURE_SPEECH_REGION=your_region

# Google Gemini API (免費方案: 1,500 RPD, 15 RPM)
EXPO_PUBLIC_GEMINI_API_KEY=your_gemini_api_key
```

⚠️ **不要提交 `.env` 文件到 Git！**

### 取得 API Keys

1. **Gemini API**: 前往 [Google AI Studio](https://aistudio.google.com/app/apikey) 建立免費 API Key
2. **Azure Speech**: 在 [Azure Portal](https://portal.azure.com) 建立 Speech Services 資源
3. **Supabase**: 在 [Supabase Dashboard](https://supabase.com/dashboard) 建立專案

## 🏗️ 開發階段

### Phase 1: 基礎架構 ✅
- [x] Expo 專案初始化
- [x] TypeScript 配置
- [x] ESLint & Prettier 設置
- [ ] Supabase 設置
- [ ] WatermelonDB 配置

### Phase 2: 內容捕獲
- [ ] Share Extension 整合
- [ ] 文字/圖片/URL 處理
- [ ] 圖片標註工具
- [ ] 後台上傳

### Phase 3: 快取管理
- [ ] 快取列表 UI
- [ ] AI 預掃描與高亮
- [ ] 用戶覆蓋功能

### Phase 4: 學習系統
- [ ] 卡片生成
- [ ] 間隔重複演算法
- [ ] 複習界面
- [ ] 資料庫視圖

### Phase 5: 發音功能
- [ ] Azure TTS 整合
- [ ] 音頻錄製
- [ ] 發音評估
- [ ] 視覺反饋

## 🧪 測試

```bash
# 運行測試（尚未配置）
npm test

# 類型檢查
npx tsc --noEmit

# Lint 檢查
npm run lint
```

## 📱 構建

### Development Build
```bash
# 安裝 EAS CLI
npm install -g eas-cli

# 登入 Expo
eas login

# 創建 Development Build
eas build --profile development --platform ios
eas build --profile development --platform android
```

### Production Build
```bash
eas build --profile production --platform all
```

### Cloud iOS Build via GitHub Actions

This repo includes `.github/workflows/eas-ios-build.yml`.

Required one-time setup:

```bash
# 1. Log in locally once
npx eas-cli login

# 2. Create a GitHub Actions token
npx eas-cli token:create
```

Then add the generated token to GitHub:

```text
GitHub repo -> Settings -> Secrets and variables -> Actions -> New repository secret
Name: EXPO_TOKEN
Value: <token from eas token:create>
```

Behavior:

- Push to `main` starts an iOS `production` EAS cloud build.
- `Actions -> EAS iOS Build -> Run workflow` lets you choose `development`, `preview`, or `production`.
- In manual mode, enable `auto_submit` to submit the latest successful production build to App Store Connect / TestFlight.

## 🤝 貢獻指南

1. 閱讀 `.cursorrules` 了解開發規範
2. 創建功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交變更 (`git commit -m 'Add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 開啟 Pull Request

## 📄 授權

Private - All Rights Reserved

## 📞 聯絡方式

Project Lead: [Your Name]  
Email: [Your Email]

---

**Happy Coding! 🚀**
