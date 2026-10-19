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

export function resolveStreamingFollowScrollTarget(params: {
  previewY: number;
  previewHeight: number;
  viewportHeight: number;
  currentScrollY: number;
  bottomPadding?: number;
}): number {
  const bottomPadding = params.bottomPadding ?? 48;
  if (params.viewportHeight <= 0) return params.currentScrollY;

  const cardBottomY = params.previewY + params.previewHeight + bottomPadding;
  const visibleBottomY = params.currentScrollY + params.viewportHeight;

  if (cardBottomY > visibleBottomY) {
    return Math.max(0, cardBottomY - params.viewportHeight);
  }
  return params.currentScrollY;
}
