// 建構 generate_card 的 payload。
// 抽成純函數，讓非串流路徑也能附上 generationId（免費使用者 starter card 契約要求），
// 且可在 Node 環境單獨測試（不依賴 native module）。

export type GenerateCardPayloadInput = {
  targetWord: string;
  originalSentence: string;
  includePronunciation: boolean;
  replyLanguage?: string;
  sourceLanguage?: string;
  aiBreakdownMode?: string;
  generationId?: string;
};

export type GenerateCardPayload = {
  targetWord: string;
  originalSentence: string;
  includePronunciation: boolean;
  replyLanguage?: string;
  sourceLanguage?: string;
  aiBreakdownMode?: string;
  generationId?: string;
};

export function buildGenerateCardPayload(
  input: GenerateCardPayloadInput
): GenerateCardPayload {
  const payload: GenerateCardPayload = {
    targetWord: input.targetWord,
    originalSentence: input.originalSentence,
    includePronunciation: input.includePronunciation,
  };
  if (input.replyLanguage) payload.replyLanguage = input.replyLanguage;
  if (input.sourceLanguage) payload.sourceLanguage = input.sourceLanguage;
  if (input.aiBreakdownMode) payload.aiBreakdownMode = input.aiBreakdownMode;
  if (input.generationId) payload.generationId = input.generationId;
  return payload;
}

export type GenerateCardStreamPayloadInput = Omit<
  GenerateCardPayloadInput,
  'generationId'
> & {
  // 串流路徑的冪等鍵為必填：core 與 enrichment 兩階段必須共用同一個
  // generationId，才能讓後端額度計數與重試去重（守則 A）。
  generationId: string;
};

export type GenerateCardStreamPayload = GenerateCardPayload & {
  // 串流路徑的冪等鍵為必填（守則 A）。
  generationId: string;
};

/**
 * 建構 generate_card_core_stream / generate_card_enrichment_stream 的 payload。
 * 與非串流路徑共用同一個底層 builder，確保兩條路徑的欄位組裝一致，
 * 且 generationId 冪等鍵永遠不會漏帶。
 */
export function buildGenerateCardStreamPayload(
  input: GenerateCardStreamPayloadInput
): GenerateCardStreamPayload {
  const payload = buildGenerateCardPayload(input);
  payload.generationId = input.generationId;
  return payload as GenerateCardStreamPayload;
}
