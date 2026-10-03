export type BackSectionKey =
  | 'collocations'
  | 'semanticRelations'
  | 'examples'
  | 'personalNotes';

export type CardBackLayoutInput = {
  viewportHeight: number;
  activeSections: Partial<Record<BackSectionKey, boolean>>;
  measuredHeights: Partial<Record<BackSectionKey, number>>;
  lineHeight?: number;
  exampleCount?: number;
  footerClearance?: number;
  supplementarySensesCount?: number;
};

export type CardBackLayoutResult = {
  availableContentHeight: number;
  limits: Record<BackSectionKey, number>;
  shouldOfferExpansion: Record<BackSectionKey, boolean>;
  fitsWithoutCollapse: boolean;
};

const DEFAULT_VIEWPORT_FALLBACK = 520;
const FOOTER_CLEARANCE = 48;
const PER_SECTION_CHROME = 36;
const SAFETY_BUFFER = 16;

const DEFAULT_SECTION_SHARES: Record<BackSectionKey, number> = {
  collocations: 0.24,
  semanticRelations: 0.22,
  examples: 0.34,
  personalNotes: 0.20,
};

const MIN_SECTION_LINES: Record<BackSectionKey, number> = {
  collocations: 2,
  semanticRelations: 2,
  examples: 3,
  personalNotes: 2,
};

export function resolveCardBackDynamicLayout(
  input: CardBackLayoutInput
): CardBackLayoutResult {
  const {
    viewportHeight,
    activeSections,
    measuredHeights,
    lineHeight = 24,
    footerClearance = FOOTER_CLEARANCE,
    supplementarySensesCount = 0,
  } = input;

  const effectiveViewport =
    viewportHeight > 0 ? viewportHeight : DEFAULT_VIEWPORT_FALLBACK;

  const allKeys: BackSectionKey[] = [
    'collocations',
    'semanticRelations',
    'examples',
    'personalNotes',
  ];

  const presentKeys = allKeys.filter((key) => Boolean(activeSections[key]));
  const activeCount = presentKeys.length;

  const limits: Record<BackSectionKey, number> = {
    collocations: 0,
    semanticRelations: 0,
    examples: 0,
    personalNotes: 0,
  };

  const shouldOfferExpansion: Record<BackSectionKey, boolean> = {
    collocations: false,
    semanticRelations: false,
    examples: false,
    personalNotes: false,
  };

  if (activeCount === 0) {
    return {
      availableContentHeight: 0,
      limits,
      shouldOfferExpansion,
      fitsWithoutCollapse: true,
    };
  }

  const SUPPLEMENTARY_SENSE_BASE_CHROME = 28;
  const SUPPLEMENTARY_SENSE_PER_ITEM = 32;
  const supplementaryOverhead =
    supplementarySensesCount > 0
      ? SUPPLEMENTARY_SENSE_BASE_CHROME + supplementarySensesCount * SUPPLEMENTARY_SENSE_PER_ITEM
      : 0;

  const totalOverhead =
    footerClearance +
    activeCount * PER_SECTION_CHROME +
    supplementaryOverhead +
    SAFETY_BUFFER;
  const availableContentHeight = Math.max(0, effectiveViewport - totalOverhead);

  // 1. 計算初版權重（依目前存在的區塊重新歸一化）
  const totalWeight = presentKeys.reduce(
    (sum, key) => sum + DEFAULT_SECTION_SHARES[key],
    0
  );

  const currentAllocations: Record<BackSectionKey, number> = {
    collocations: 0,
    semanticRelations: 0,
    examples: 0,
    personalNotes: 0,
  };

  presentKeys.forEach((key) => {
    const normalizedWeight =
      totalWeight > 0 ? DEFAULT_SECTION_SHARES[key] / totalWeight : 1 / activeCount;
    currentAllocations[key] = Math.round(availableContentHeight * normalizedWeight);
  });

  // 2. 空間讓渡演算法（多輪迭代：短區塊把多餘預算回吐給超額區塊）
  let unsatisfiedKeys = [...presentKeys];

  for (let round = 0; round < 3; round += 1) {
    let freedSpaceThisRound = 0;
    const nextUnsatisfied: BackSectionKey[] = [];

    unsatisfiedKeys.forEach((key) => {
      const measured = Math.max(0, measuredHeights[key] || 0);
      const allocated = currentAllocations[key];

      if (measured > 0 && measured <= allocated) {
        // 此區塊完全放得下，只佔用其實際測量值，多餘空間讓渡
        freedSpaceThisRound += allocated - measured;
        currentAllocations[key] = measured;
      } else {
        nextUnsatisfied.push(key);
      }
    });

    unsatisfiedKeys = nextUnsatisfied;
    if (freedSpaceThisRound <= 0 || unsatisfiedKeys.length === 0) {
      break;
    }

    // 將多餘空間均分給尚未被滿足的長區塊
    const bonusPerSection = Math.floor(freedSpaceThisRound / unsatisfiedKeys.length);
    unsatisfiedKeys.forEach((key) => {
      currentAllocations[key] += bonusPerSection;
    });
  }

  // 3. 整行對齊與收合判定
  let allFit = true;

  presentKeys.forEach((key) => {
    const measured = Math.max(0, measuredHeights[key] || 0);
    const allocated = currentAllocations[key];
    const minLines = MIN_SECTION_LINES[key];
    const minHeight = minLines * lineHeight;

    if (measured === 0) {
      // 尚未測量完成前，保留初始預算且不觸發收合
      limits[key] = Math.max(minHeight, allocated);
      shouldOfferExpansion[key] = false;
      return;
    }

    if (measured <= allocated) {
      // 完全放得下：零收合
      limits[key] = measured;
      shouldOfferExpansion[key] = false;
    } else {
      // 超出空間：必須收合，且收合高度嚴格整行對齊
      allFit = false;
      shouldOfferExpansion[key] = true;
      const budgetLines = Math.max(minLines, Math.floor(allocated / lineHeight));
      limits[key] = budgetLines * lineHeight;
    }
  });

  return {
    availableContentHeight,
    limits,
    shouldOfferExpansion,
    fitsWithoutCollapse: allFit,
  };
}
