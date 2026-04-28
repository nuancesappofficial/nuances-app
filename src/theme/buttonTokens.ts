export const BUTTON_TOKENS = {
  radius: {
    sm: 12,
    md: 14,
    lg: 18,
    pill: 999,
  },
  height: {
    compact: 40,
    regular: 48,
    prominent: 52,
  },
  text: {
    regular: 14,
    strong: 15,
    prominent: 16,
  },
  weight: {
    regular: '700' as const,
    strong: '800' as const,
  },
  border: {
    subtle: 'rgba(255,255,255,0.18)',
    stronger: 'rgba(255,255,255,0.3)',
  },
  shadow: {
    // Intentionally soft/flat, avoiding glossy 3D look.
    color: '#000000',
    opacity: 0.12,
    radius: 6,
    offsetY: 4,
    elevation: 3,
  },
} as const;

