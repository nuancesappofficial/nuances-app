// Steady text reveal for the ghost card: the full text is always laid out and
// only its visibility changes, so line breaks and height are fixed from the
// first frame. Rendering just the revealed prefix made half-typed words jump to
// the next line and the block grow line by line, which read as a wobble.

export type RevealSegment = { text: string; isBold: boolean };

/**
 * Splits styled segments at `visibleCount` characters. `visible` + `hidden`
 * always spell the full text with the same bold runs, so rendering `hidden`
 * transparently keeps the layout identical at every step.
 */
export function splitRevealSegments(
  segments: readonly RevealSegment[],
  visibleCount: number
): { visible: RevealSegment[]; hidden: RevealSegment[] } {
  const visible: RevealSegment[] = [];
  const hidden: RevealSegment[] = [];
  let remaining = Math.max(0, visibleCount);

  for (const seg of segments) {
    const units = Array.from(seg.text);
    if (units.length === 0) continue;
    const take = Math.min(remaining, units.length);
    if (take > 0) visible.push({ text: units.slice(0, take).join(''), isBold: seg.isBold });
    if (take < units.length) hidden.push({ text: units.slice(take).join(''), isBold: seg.isBold });
    remaining -= take;
  }

  return { visible, hidden };
}

// Letters, digits and the punctuation that sticks to a word. CJK characters
// are deliberately excluded so Chinese/Japanese still reveal per character.
const WORD_CHAR = /[A-Za-z0-9À-ɏ'’\-.,!?;:)"”]/;

/**
 * Next visible character count: advance at least `minStep`, then finish the
 * current word (and its trailing space) so a half word is never shown.
 */
export function nextRevealCount(units: readonly string[], current: number, minStep: number): number {
  const total = units.length;
  let next = Math.min(total, current + Math.max(1, minStep));
  if (next >= total) return total;
  if (!WORD_CHAR.test(units[next - 1])) return next;
  while (next < total && WORD_CHAR.test(units[next])) next += 1;
  if (next < total && /\s/.test(units[next])) next += 1;
  return next;
}

// ── Web-LLM style reveal ────────────────────────────────────────────────────
// A reveal position moves forward through tokens (words / CJK characters) at
// one constant speed; each token fades from transparent to solid on its own.
// The full text is always laid out (hidden text is transparent), so nothing moves.

export type RevealBand = RevealSegment & { alpha: number };

const CJK = /[぀-ヿ㐀-鿿가-힯]/;
const CJK_PUNCT = /[　-〿＀-￯]/;

/**
 * Token index for every character: English words (with trailing spaces and
 * punctuation) and single CJK characters. Words emerge as whole units, the
 * way a web LLM UI streams tokens.
 */
export function revealTokenIndexes(text: string): number[] {
  const out: number[] = [];
  let token = -1;
  let prev = '';
  for (const ch of Array.from(text)) {
    const startsToken =
      token < 0 ||
      (CJK.test(ch)) ||
      (!/\s/.test(ch) && !CJK_PUNCT.test(ch) && (/\s/.test(prev) || CJK.test(prev) || CJK_PUNCT.test(prev)));
    if (startsToken) token += 1;
    out.push(token);
    prev = ch;
  }
  return out;
}

export function countRevealTokens(text: string): number {
  const idx = revealTokenIndexes(text);
  return idx.length ? idx[idx.length - 1] + 1 : 0;
}

/** Tokens per second: one steady pace (~10 English words or ~22 CJK characters a second). */
export function revealTokensPerSecond(text: string): number {
  return CJK.test(text) ? 22 : 10;
}

/** Each token fades in over about 250ms, so two or three are emerging at once. */
export function revealFadeTokens(text: string): number {
  return Math.max(1.5, revealTokensPerSecond(text) * 0.25);
}

/**
 * Splits styled segments into runs of equal opacity for reveal position `pos`
 * (in tokens). Every character of a token shares one opacity, so words emerge
 * whole instead of a gradient sliding across them. Opacity is quantised into
 * `levels` steps to keep the number of nested Text runs small. Joined, the runs
 * always spell the full text.
 */
export function splitRevealBands(
  segments: readonly RevealSegment[],
  pos: number,
  fadeTokens: number,
  levels = 5
): RevealBand[] {
  const tokens = revealTokenIndexes(segments.map((seg) => seg.text).join(''));
  const fade = Math.max(0.5, fadeTokens);
  const bands: RevealBand[] = [];
  let index = 0;

  for (const seg of segments) {
    for (const ch of Array.from(seg.text)) {
      const raw = (pos - tokens[index]) / fade;
      const alpha = raw >= 1 ? 1 : raw <= 0 ? 0 : Math.ceil(raw * levels) / levels;
      const last = bands[bands.length - 1];
      if (last && last.isBold === seg.isBold && last.alpha === alpha) {
        last.text += ch;
      } else {
        bands.push({ text: ch, isBold: seg.isBold, alpha });
      }
      index += 1;
    }
  }
  return bands;
}

/** `color` at `alpha` opacity, for hex and rgb()/rgba(). Unknown formats are returned unchanged. */
export function colorWithAlpha(color: string, alpha: number): string {
  const c = color.trim();
  let r: number, g: number, b: number, a = 1;
  const hex = c.match(/^#([0-9a-f]{3,8})$/i);
  if (hex) {
    const h = hex[1];
    if (h.length === 3 || h.length === 4) {
      [r, g, b] = [h[0], h[1], h[2]].map((x) => parseInt(x + x, 16));
      if (h.length === 4) a = parseInt(h[3] + h[3], 16) / 255;
    } else if (h.length === 6 || h.length === 8) {
      [r, g, b] = [h.slice(0, 2), h.slice(2, 4), h.slice(4, 6)].map((x) => parseInt(x, 16));
      if (h.length === 8) a = parseInt(h.slice(6, 8), 16) / 255;
    } else {
      return color;
    }
  } else {
    const rgb = c.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i);
    if (!rgb) return color;
    [r, g, b] = [rgb[1], rgb[2], rgb[3]].map(Number);
    if (rgb[4] !== undefined) a = Number(rgb[4]);
  }
  const out = Math.round(a * alpha * 1000) / 1000;
  return `rgba(${r}, ${g}, ${b}, ${out})`;
}
