# vision-ocr

Nuances 的 iOS Apple Vision OCR Expo Module。

## 註冊方式

此套件由根目錄 `package.json` 的 `file:modules/vision-ocr` 依賴加入。
Expo autolinking 會讀取 `expo-module.config.json`，再由 CocoaPods 將
`NuancesVisionOCRModule` 寫入產生的 `ExpoModulesProvider.swift`。

不需要修改 `AppDelegate.swift`，也不要把另一份 OCR bridge 手動加入
Xcode target。這樣執行 `expo prebuild --clean` 後仍能重新產生註冊資訊。

加入或修改原生程式後必須重建並重新安裝 app；Metro reload 只更新
JavaScript，不會更新已安裝的 native binary。

## 檢查自動連結

```sh
npx expo-modules-autolinking resolve --platform apple
cd ios && pod install
```

輸出應包含 package `vision-ocr`、Pod `VisionOCR` 與 module
`NuancesVisionOCRModule`。
