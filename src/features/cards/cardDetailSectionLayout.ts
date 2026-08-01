export const CARD_DETAIL_HORIZONTAL_INSET = {
  left: 12,
  right: 12,
} as const;

const COLLAPSED_BACK_SECTION_SHARES = {
  collocations: 0.16,
  semanticRelations: 0.14,
  examples: 0.22,
  personalNotes: 0.14,
} as const;

export type CardDetailSectionLayout = {
  [Section in keyof typeof COLLAPSED_BACK_SECTION_SHARES]: number;
};

export function resolveFrontTextWrapGuard(fontSize: number): number {
  return Math.max(0, Math.ceil(fontSize));
}

export function resolveExamplePreviewLayout(
  allocatedHeight: number,
  measuredHeight: number,
  isExpanded: boolean
): { height: number; hasOverflow: boolean } {
  const allocation = Math.max(0, allocatedHeight);
  const measured = Math.max(0, measuredHeight);
  const hasOverflow = measured > allocation + 1;

  return {
    height: isExpanded && hasOverflow ? measured : allocation,
    hasOverflow,
  };
}

export function shouldOfferExampleExpansion(
  exampleCount: number,
  measuredHeight: number,
  allocatedHeight: number
): boolean {
  return (
    exampleCount > 1 ||
    resolveExamplePreviewLayout(allocatedHeight, measuredHeight, false)
      .hasOverflow
  );
}

export function resolveCardDetailSectionLayout(
  viewportHeight: number
): CardDetailSectionLayout {
  const safeViewportHeight = Math.max(0, viewportHeight);

  return {
    collocations: Math.round(
      safeViewportHeight * COLLAPSED_BACK_SECTION_SHARES.collocations
    ),
    semanticRelations: Math.round(
      safeViewportHeight * COLLAPSED_BACK_SECTION_SHARES.semanticRelations
    ),
    examples: Math.round(
      safeViewportHeight * COLLAPSED_BACK_SECTION_SHARES.examples
    ),
    personalNotes: Math.round(
      safeViewportHeight * COLLAPSED_BACK_SECTION_SHARES.personalNotes
    ),
  };
}
