// Cache 卡上的來源標籤（Netflix、Share Sheet…）。Cache 畫面和 paywall 的第 21 張卡共用。
export function toSourceLabel(sourceApp?: string | null): string {
  const value = (sourceApp || '').trim().toLowerCase();
  if (!value) return 'Unknown';

  if (value === 'share_sheet' || value === 'share sheet') return 'Share Sheet';
  if (value === 'clipboard') return 'Clipboard';
  if (value === 'manual entry') return 'Manual Entry';
  if (value === 'quick add') return 'Quick Add';
  if (value === 'camera') return 'Camera';

  return sourceApp || 'Unknown';
}
