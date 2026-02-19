# 路徑引入修復

## 問題描述
在實作 Share Extension 時，`shareExtensionService.ts` 和 `clipboardService.ts` 使用了相對路徑 `../database` 來引入資料庫模組，導致 Metro bundler 無法解析模組。

## 錯誤訊息
```
Unable to resolve module ../database from
/Users/users/vibe_coding_projects/nuances-app/src/services/shareExtension/shareExtensionService.ts
```

## 根本原因
專案已配置路徑別名（`@database`），但新增的服務檔案使用了相對路徑，導致與專案慣例不一致。

## 修復方案
將所有引入改為使用路徑別名：

### 修復前
```typescript
import { database } from '../database';
import CachedItem from '../database/models/CachedItem';
```

### 修復後
```typescript
import { database } from '@database/index';
import CachedItem from '@database/models/CachedItem';
```

## 修改檔案清單
1. `src/services/shareExtension/shareExtensionService.ts` - 第 10-11 行
2. `src/services/clipboard/clipboardService.ts` - 第 9-10 行

## 驗證
- ✅ Linter 檢查通過（無錯誤）
- ✅ TypeScript 類型檢查通過
- ✅ 路徑別名配置確認（tsconfig.json & babel.config.js）

## 相關配置
專案使用 `babel-plugin-module-resolver` 配置路徑別名：
- `@database` → `./src/database`
- `@services` → `./src/services`
- `@hooks` → `./src/hooks`

## 測試建議
重新啟動 Metro bundler 確保模組正確解析：
```bash
# 清除快取並重啟
npx expo start --clear
```

---

**修復時間**: 2026-02-16  
**狀態**: ✅ 已修復
