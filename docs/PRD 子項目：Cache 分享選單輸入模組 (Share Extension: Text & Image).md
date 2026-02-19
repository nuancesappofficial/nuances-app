PRD 子項目：Cache 分享選單輸入模組 (Share Extension: Text & Image)
模組概述
此模組隸屬於「Cache (快取區)」，主要定義使用者如何透過 iOS 系統原生的 Share Sheet，將外部內容無縫傳送至 Nuances App 中。本階段 MVP 僅支援**純文字（Plain Text）與圖片（Images/Photos）**兩種資料類型，暫不處理 URL 網址的解析。

Feature A: 透過 Share Sheet 傳送「純文字」
1. 使用者流程 (User Flow)
使用者在外部 App 反白一段純文字。

點擊系統選單中的「分享 (Share)」，並選擇「Nuances」。

系統彈出 Nuances 分享擴充介面 (Share Extension UI)，預覽純文字。

點擊「Save」後寫入 Cache，擴充介面關閉，使用者不需跳轉回主 App。

2. 業務邏輯與限制條件
資料過濾： 若分享內容包含超連結或富文本，僅擷取純文字字串 (public.plain-text)。

字數限制： 建議設定單次最高 2,000 字元上限。

儲存機制： 透過 App Groups 輕量寫入本地共享儲存空間。

Feature B: 透過 Share Sheet 傳送「圖片/照片」
1. 使用者流程 (User Flow)
使用者在外部 App（如相簿、LINE、網頁）選取一張或多張圖片/截圖。

點擊「分享 (Share)」，並選擇「Nuances」。

Nuances 分享擴充介面顯示圖片縮圖預覽。

點擊「Save」後，圖片存入 Cache，擴充介面關閉。

2. 業務邏輯與限制條件 (重點開發防護網)
支援格式： 系統需能接收常用的圖片格式（PNG, JPEG, HEIC）。

格式標準化與壓縮 (Crucial)： * 若來源為 iOS 預設的 HEIC 格式，需在背景自動轉換為 JPEG 或 PNG，以便後續 App 內的 AI 視覺模型（如 OCR）能夠順利讀取。

記憶體與容量控管： 圖片存入 Cache 前，必須進行適度的尺寸壓縮（例如長邊不超過 1920px），以避免塞爆使用者的手機容量，並防止 Share Extension 因記憶體超載（>120MB）而閃退。

儲存機制： 圖片實體檔案必須寫入 App Groups 的 Shared File Manager，並在資料庫中記錄該圖片的檔案路徑（File Path）。

數量限制： 單次透過 Share Sheet 傳送的圖片數量上限建議設為 1~3 張。

Feature C: 剪貼簿純文字快速貼上 (Clipboard Text Paste)
(保留上一版的內容：在主 App 內提供一鍵貼上純文字的按鈕，需符合 iOS 隱私規範，不觸發系統警告。)

總結
這樣一來，這個 PRD 就完美涵蓋了使用者最常用的兩個動作：「反白文字分享」跟「截圖分享」，而且把技術上容易踩坑的「圖片壓縮與格式轉換」明確列出來，Tech Stack 專家看到就會覺得這份需求寫得非常專業。