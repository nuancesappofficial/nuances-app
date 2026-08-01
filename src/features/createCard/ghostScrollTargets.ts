export function resolveCardTopAlignedScrollTarget(params: {
  previewY: number;
  cardYWithinPreview: number;
}): number {
  return Math.max(0, params.previewY + params.cardYWithinPreview);
}

export function resolveBottomAlignedScrollTarget(params: {
  contentHeight: number;
  viewportHeight: number;
}): number {
  return Math.max(0, params.contentHeight - params.viewportHeight);
}
