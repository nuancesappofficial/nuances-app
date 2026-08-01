# Ghost Card UI Handoff

## Purpose

Ghost Card 是 `CreateCardFlow` 進行 AI 單字卡生成時的載入與即時預覽畫面。它不是一般 skeleton、進度條或 spinner，而是直接沿用最終 Card Detail 的正反面卡片版型，讓生成完成前後沒有明顯 layout shift。

## Main Files

- `src/screens/flow/CacheScreenFlow/CreateCardFlow.tsx`
  - 控制生成流程、串流 token、partial card state、多卡順序、自動捲動、儲存與錯誤狀態。
- `src/components/UI/CacheScreenUI/CreateCardGhostPreviewSceneUI.tsx`
  - Ghost Card 的正反面 UI、狀態文字、逐字顯示、發音按鈕與 save scene。
- `src/components/UI/DeckScreenUI/CardDetailCarouselCardUI.tsx`
  - 最終 Card Detail 卡片 UI 的視覺與結構參考。
- `src/services/ai/aiActionService.ts`
  - `generateCardContentStream`、兩階段生成結果解析與最終資料合併。
- `src/services/ai/edgeAiClient.ts`
  - React Native 端以 XHR 接收 SSE，逐 chunk 呼叫 `onToken`。
- `supabase/functions/ai-proxy/index.ts`
  - Core stream 與 enrichment stream 的 prompt、模型與輸出格式。
- `DESIGN.md`
  - Ghost Card animation、glow、pressable 與其他共用動效規格。

## Layout Contract

每個單字固定使用兩個由上到下排列的卡片容器：

1. Card 1 front
2. Card 1 back
3. Card 2 front
4. Card 2 back
5. Card 3 front
6. Card 3 back

第一個選取並開始生成的單字必須位於最上方，最後一個位於最下方。Ghost Card 與完成後的卡片順序必須一致，不能把最新完成的卡片插到頂部。

正反面容器應盡可能與最終 Card Detail 使用相同的：

- 外框尺寸與圓角
- margin 與 padding
- 背景色與邊框色
- 字體層級
- section 間距
- light / dark mode 色彩

已有正反面 Ghost Card 後，不要在底部再顯示額外的 `Card Preview`。最底部只保留 `Save` 按鈕。

## Loading State

- 不使用 0-100% progress bar。
- 不使用一般 `ActivityIndicator` 作為主要生成畫面。
- 使用空的 Card Detail 正反面容器承載生成狀態。
- 卡片容器使用低強度 metal-blue pulsing glow，呈現硬體呼吸感。
- 分析狀態文字要比正式卡片內容更小、更淡，清楚表示它不是卡片資料。
- 狀態文字切換速度不可過快，可使用約 1.5-2.5 秒的節奏。

狀態文字範例：

- `Extracting vocabulary...`
- `Analyzing linguistic context...`
- `Structuring premium flashcard...`
- `Finalizing definitions...`

所有狀態與 section label 都必須走 UI localization，不能固定為英文。中文 UI 內的 `Context` 應顯示自然中文，例如 `語境`。

## Streaming Architecture

目前生成採兩階段：

### Phase 1: Core Stream

使用純文字 delimiters，優先讓主要視覺欄位快速出現：

```text
==DEF==
...
==TRANS==
...
==WORD==
...
==POS==
...
```

主要欄位：

- `normalizedTargetWord`
- `partOfSpeech`
- `definition`
- `sentenceTranslation`

### Phase 2: Enrichment Stream

補齊較深入內容：

- `culturalBackground`
- `semanticRelations`
- `frequentCollocations`
- `example`
- tags 與其他 metadata

Collocations 與 example sentences 都需要包含翻譯，而且 Ghost Card 與最終 Card Detail 必須顯示同一份內容。

React Native 端的資料流：

```text
ai-proxy SSE
  -> edgeAiClient.streamAIAction (XHR)
  -> aiActionService.generateCardContentStream
  -> CreateCardFlow onToken
  -> partial generated card state
  -> CreateCardGhostPreviewSceneUI
```

`CreateCardFlow` 應在每次收到 token 時解析可用欄位並更新 partial state。不能等待整份 JSON 或 enrichment 完成後才一次顯示。

## Progressive Reveal

- 內容依畫面由上到下逐步出現。
- 前一個 section 尚未完成時，不應讓下方 section 搶先完成動畫。
- 第一個可顯示字元抵達時，可讓該 section 的 placeholder 消失。
- 正式內容的顯示速度需可讀，不要瞬間全部跳出，也不要慢到拖延流程。
- 文字開始出現的第一刻可觸發一次 light haptic，不可每個字都震動。
- Ghost Card 內容生成完成後，應自然成為完成卡片，不要整張突然替換。

## Auto-Scroll Rules

生成多張卡片時，自動捲動應維持目前正在出字的區域接近螢幕中央：

```text
Card 1 front -> Card 1 back -> Card 2 front -> Card 2 back -> ...
```

規則：

- 一張卡完成並開始下一張時，平順捲動到下一張，而不是突然跳位。
- 現行 scroll-to-next-card 動畫速度已要求調為原本的一半。
- 不要在所有卡片完成時將畫面拉回頂部。
- 不要在完成時強制把鏡頭移到第二張卡。
- 使用者手動捲動後，完成事件應保留目前 scroll position。
- 所有卡片完成後，只把 `Save` 按鈕放在內容下方。
- Save scene 不應有 shake 或異常 haptic。

## Card Content Rules

Ghost Card 與完成卡片都應使用 canonical subject：

- 一般單字：使用修正後的 target word。
- 真正固定片語、慣用語或 idiom：當 target 在片語中的意思與單字本身不同時，subject 可提升為完整最小語意單位。
- subject 一旦變成片語，整張卡都必須跟著片語更新，包括標題、詞性、翻譯、定義、collocations、examples 與 context。
- 不可只更改卡片標題，卻仍用原始單字生成其餘欄位。

## Did You Mean

拼字修正提示應位於 Create Card 畫面上方，不應要求使用者捲到底部才看見。

使用者需要能夠：

- 接受建議修正
- 拒絕修正
- 自己輸入另一個正確版本

如果接受或手動修改 subject，所有依賴 subject 的欄位都應保持一致。串流 core path 目前不一定會提供完整 typo metadata；同步 fallback 的 `isLikelyTypo`、`correctedTargetWord`、`typoReason` 通常較完整，後續修改時要注意兩條路徑的一致性。

## Pronunciation

- 單字旁的發音按鈕在 Ghost Card 完成後應可按。
- 使用與 Card Detail 相同的 Azure TTS / audio cache 邏輯。
- 已有音檔時立即播放並顯示輕量 active state。
- 需要下載時才顯示 downloading buffer animation。
- 不要使用系統 Expo Speech 取代既有 Azure 音檔流程。

## Localization

Ghost Card 的所有 UI 文案必須跟隨 app 的 `uiLanguage`：

- section headers
- status text
- action labels
- save button
- error / retry states
- Context、Definition、Translation、Examples、Collocations 等標題

AI 內容的 reply language 與 UI language 是不同概念；畫面標籤跟隨 UI language，AI 產生內容則跟隨設定的 AI reply/native language。

## Error and Retry State

- API 失敗時不要把 `Generating meaning`、`Example`、`Card` 等 placeholder 當作完成資料。
- Streaming core 若解析不到必要欄位，應進入明確 fail/retry state。
- 不可靜默完成並讓使用者儲存空卡。
- Retry 應保留原始輸入、選取順序與使用者目前畫面位置。

## Regression Checklist

- [ ] 第一張卡在最上方，最後一張在最下方。
- [ ] 多卡排列為 front/back 交錯，而不是所有 front 後接所有 back。
- [ ] 串流內容會逐步出現，不是等待完整回應後一次跳出。
- [ ] section 依上到下順序 reveal。
- [ ] collocations 與 examples 的翻譯會顯示在 Ghost Card。
- [ ] 中文 UI 沒有固定英文 `Context` 或其他 label。
- [ ] 生成完成後不 auto-scroll 到頂部。
- [ ] 使用者手動捲動位置不會被完成事件重設。
- [ ] 下一張卡的自動捲動平順且速度適中。
- [ ] Save scene 沒有 shake。
- [ ] 底部只有 `Save`，沒有重複 Card Preview。
- [ ] 發音按鈕可操作，下載與 cached audio 狀態正確。
- [ ] API 失敗不會顯示 placeholder 假資料。
- [ ] Ghost Card 與最終 Card Detail 顯示相同欄位與 canonical subject。

## Recommended Verification

至少測試以下情境：

1. 單一普通單字。
2. 多個單字同時生成。
3. subject 提升為片語。
4. 有拼字錯誤並接受 `Did you mean`。
5. 使用者拒絕修正並手動輸入新 subject。
6. English UI 與 Traditional Chinese UI。
7. Light mode 與 dark mode。
8. API stream 中斷、retry 與 fallback。
9. 生成途中手動上下捲動。
10. 完成後直接按發音與 Save。
