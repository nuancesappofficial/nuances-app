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
