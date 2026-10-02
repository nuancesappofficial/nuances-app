export type CardFrontLayoutInput = {
  viewportHeight: number;
  meaningHeight: number;
  sentenceMeasuredHeight: number;
  contextMeasuredHeight: number;
  sentenceLineHeight: number;
  contextLineHeight: number;
  hasInsightMetrics?: boolean;
  minSentenceLines?: number;
  minContextLines?: number;
  chromeOverhead?: number;
};

export type CardFrontLayoutResult = {
  availableTextHeight: number;
  shouldOfferFullSentence: boolean;
  shouldOfferFullContext: boolean;
  sentenceBudgetHeight: number;
  contextBudgetHeight: number;
  sentenceBudgetLines: number;
  contextBudgetLines: number;
  fitsWithoutCollapse: boolean;
};

const BASE_CHROME_WITHOUT_METRICS = 186;
const BASE_CHROME_WITH_METRICS = 228;
const DEFAULT_VIEWPORT_FALLBACK = 480;

export function resolveCardFrontDynamicLayout(
  input: CardFrontLayoutInput
): CardFrontLayoutResult {
  const {
    viewportHeight,
    meaningHeight,
    sentenceMeasuredHeight,
    contextMeasuredHeight,
    sentenceLineHeight = 28,
    contextLineHeight = 25,
    hasInsightMetrics = false,
    minSentenceLines = 3,
    minContextLines = 3,
  } = input;

  const defaultChrome = hasInsightMetrics
    ? BASE_CHROME_WITH_METRICS
    : BASE_CHROME_WITHOUT_METRICS;
  const chromeOverhead =
    typeof input.chromeOverhead === 'number'
      ? input.chromeOverhead
      : defaultChrome;

  const effectiveViewport =
    viewportHeight > 0 ? viewportHeight : DEFAULT_VIEWPORT_FALLBACK;
  const safeMeaning = Math.max(0, meaningHeight || 0);
  const availableTextHeight = Math.max(
    0,
    effectiveViewport - safeMeaning - chromeOverhead
  );

  const sentenceMeasured = Math.max(0, sentenceMeasuredHeight || 0);
  const contextMeasured = Math.max(0, contextMeasuredHeight || 0);
  const minSentence = Math.max(0, minSentenceLines * sentenceLineHeight);
  const minContext = Math.max(0, minContextLines * contextLineHeight);

  // 若尚未測量完畢（初次渲染），採安全保底
  if (sentenceMeasured === 0 && contextMeasured === 0) {
    return {
      availableTextHeight,
      shouldOfferFullSentence: false,
      shouldOfferFullContext: false,
      sentenceBudgetHeight: minSentence,
      contextBudgetHeight: minContext,
      sentenceBudgetLines: minSentenceLines,
      contextBudgetLines: minContextLines,
      fitsWithoutCollapse: true,
    };
  }

  const totalNeeded = sentenceMeasured + contextMeasured;

  // 階層 1：零收合（全部空間充裕）
  if (totalNeeded <= availableTextHeight) {
    const sentenceBudgetLines = Math.max(
      minSentenceLines,
      Math.ceil(sentenceMeasured / sentenceLineHeight)
    );
    const contextBudgetLines = Math.max(
      minContextLines,
      Math.ceil(contextMeasured / contextLineHeight)
    );
    return {
      availableTextHeight,
      shouldOfferFullSentence: false,
      shouldOfferFullContext: false,
      sentenceBudgetHeight: sentenceMeasured,
      contextBudgetHeight: contextMeasured,
      sentenceBudgetLines,
      contextBudgetLines,
      fitsWithoutCollapse: true,
    };
  }

  // 階層 2：動態空間讓渡
  // 若 Context 極短，檢查剩下空間能否讓 Sentence 完全展示
  const spaceForSentence = availableTextHeight - contextMeasured;
  if (sentenceMeasured <= spaceForSentence) {
    return {
      availableTextHeight,
      shouldOfferFullSentence: false,
      shouldOfferFullContext: false,
      sentenceBudgetHeight: sentenceMeasured,
      contextBudgetHeight: contextMeasured,
      sentenceBudgetLines: Math.ceil(sentenceMeasured / sentenceLineHeight),
      contextBudgetLines: Math.ceil(contextMeasured / contextLineHeight),
      fitsWithoutCollapse: true,
    };
  }

  // 若 Sentence 極短，檢查剩下空間能否讓 Context 完全展示
  const spaceForContext = availableTextHeight - sentenceMeasured;
  if (contextMeasured <= spaceForContext) {
    return {
      availableTextHeight,
      shouldOfferFullSentence: false,
      shouldOfferFullContext: false,
      sentenceBudgetHeight: sentenceMeasured,
      contextBudgetHeight: contextMeasured,
      sentenceBudgetLines: Math.ceil(sentenceMeasured / sentenceLineHeight),
      contextBudgetLines: Math.ceil(contextMeasured / contextLineHeight),
      fitsWithoutCollapse: true,
    };
  }

  // 階層 3：兩者無法同時完全容納，進行配額與收合
  let sentenceBudgetHeight = minSentence;
  let contextBudgetHeight = minContext;

  const totalMinRequired = minSentence + minContext;
  if (availableTextHeight > totalMinRequired) {
    const surplus = availableTextHeight - totalMinRequired;
    // 核心例句佔 60% 剩餘空間，語境佔 40%
    const sentenceExtra = Math.min(
      Math.max(0, sentenceMeasured - minSentence),
      Math.round(surplus * 0.6)
    );
    sentenceBudgetHeight = minSentence + sentenceExtra;
    const remainingForContext = surplus - sentenceExtra;
    const contextExtra = Math.min(
      Math.max(0, contextMeasured - minContext),
      remainingForContext
    );
    contextBudgetHeight = minContext + contextExtra;
  }

  const sentenceBudgetLines = Math.max(
    minSentenceLines,
    Math.floor(sentenceBudgetHeight / sentenceLineHeight)
  );
  const contextBudgetLines = Math.max(
    minContextLines,
    Math.floor(contextBudgetHeight / contextLineHeight)
  );

  // 整行對齊：收合時的高度必須精確等於整數行高，杜絕字形被水平腰斬
  const snappedSentenceHeight = sentenceBudgetLines * sentenceLineHeight;
  const snappedContextHeight = contextBudgetLines * contextLineHeight;

  const shouldOfferFullSentence = sentenceMeasured > snappedSentenceHeight + 1;
  const shouldOfferFullContext = contextMeasured > snappedContextHeight + 1;

  return {
    availableTextHeight,
    shouldOfferFullSentence,
    shouldOfferFullContext,
    sentenceBudgetHeight: snappedSentenceHeight,
    contextBudgetHeight: snappedContextHeight,
    sentenceBudgetLines,
    contextBudgetLines,
    fitsWithoutCollapse: false,
  };
}
