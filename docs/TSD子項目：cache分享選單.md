以下是針對新版 PRD 的系統架構解析，以及為 Cursor (Sonnet 4.5) 準備的防呆實作規格書。

⚠️ 核心技術挑戰：120MB 記憶體生死線
在 iOS 系統中，Share Extension 的可用記憶體被嚴格限制在 120MB 左右（Out-Of-Memory, OOM 門檻）。

如果按照一般 React Native 開發者的直覺，在 Share Extension 啟動完整的 React Native JS 引擎，並把一張 4K 的 HEIC 照片載入 JS 記憶體中進行壓縮，App 會在瞬間突破 120MB 導致靜默閃退 (Silent Crash)，使用者只會看到分享選單閃了一下就消失了。

解決策略 (Native-First Processing)：
必須指示 Sonnet 4.5 撰寫原生 Swift 程式碼。當系統分享圖片時，直接在 Swift 原生層接手，利用 iOS 內建的 UIImageJPEGRepresentation 進行降級與壓縮，最後把輕量化的 .jpg 檔案寫入 App Groups 的 Shared FileManager。React Native 主程式只負責「讀取路徑」，絕不讓 JS 引擎在擴充套件中處理重度影像運算。

🏛️ 資料庫與儲存架構更新
配合純文字與圖片雙軌輸入，底層架構需做以下擴充：

Shared Container (實體檔案中繼站)

路徑：group.com.yourname.nuances/Library/Caches/SharedMedia/

機制：Swift 處理完圖片後，存入此資料夾，並產生一個 JSON 紀錄檔（包含文字內容與圖片路徑）。

WatermelonDB Schema (caches 表)
必須新增欄位以相容多媒體資料：

id: string

type: string (Enum: text, image) -> [新增] 區分資料類型。

content: string (存放純文字，若為圖片則存放未來 OCR 辨識出的文字，初始可為 null)。

media_uri: string -> [新增] 記錄圖片在本地沙盒的絕對路徑。

source: string (share_sheet, clipboard)

status: string (pending_ai, processed)

created_at: number

🚀 給 Cursor (Sonnet 4.5) 的終極指令
請複製以下這段英文指令，連同你最新的 PRD 貼給 Cursor（使用 Plan 模式 Shift + Tab）。這段指令設立了極其嚴格的工安護欄，防止 AI 寫出會導致 OOM 閃退的程式碼：

@Tech Stack Doc
Strict Execution Guidelines & Architecture for Sonnet 4.5:

Review the provided PRD. We are building this for an EAS Build / Xcode Simulator environment (NO Expo Go). Pay extreme attention to the 120MB memory limit of iOS Share Extensions.

CRITICAL ARCHITECTURE CONSTRAINTS:

Avoid JS-Engine in Extension for Image Processing: Do NOT load the full React Native bridge inside the Share Extension just to compress images. The 120MB OOM limit will kill the extension.

Native Swift Image Processing: The Expo Config Plugin must generate a Swift-based ShareViewController. This Swift code MUST handle:

Intercepting public.plain-text and public.image.

Converting HEIC to JPEG natively.

Downsizing images (max edge 1920px) natively.

Writing the compressed .jpg to the App Group's Shared FileManager.

Writing a lightweight metadata JSON to App Group's UserDefaults.

Main App Handoff: The React Native main app will only read the UserDefaults and the file paths from the shared container when it comes to the foreground.

Step-by-Step Delivery Plan (Do not code everything at once):

Phase 1: Database: Update WatermelonDB caches schema (add type and media_uri). Create/update the Model.

Phase 2: Feature C (Clipboard): Implement the clipboard text paste functionality on the main UI using expo-clipboard.

Phase 3: App Groups & Config Plugin: Write the Expo Config Plugin to set up App Groups, Entitlements, and the NSExtensionActivationRule (allowing 1 text or up to 3 images).

Phase 4: Native Swift Extension: Implement the native Swift logic for memory-safe image compression and UserDefaults handoff.

Please acknowledge these constraints and output your Markdown execution plan for Phase 1.