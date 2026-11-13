import React from 'react';
import { countRevealTokens, revealFadeTokens, revealTokensPerSecond } from './steadyReveal';

type Options = {
  /** The text being revealed (used for its length and to pick the pace). */
  text: string;
  active: boolean;
  animate: boolean;
  isStreamComplete?: boolean;
  /** Fired once when the reveal reaches the end of the text (the fade may still be finishing). */
  onComplete?: () => void;
};

const ALL = Number.MAX_SAFE_INTEGER;

/**
 * Web-LLM style reveal position, in tokens (words / CJK characters). It advances at one constant
 * speed every animation frame, so every section reads at the same pace, and it
 * keeps running past the end by `fadeChars` so the last words finish fading in.
 */
export function useSteadyReveal({ text, active, animate, isStreamComplete = true, onComplete }: Options) {
  const units = React.useMemo(() => Array.from(text), [text]);
  // Position is measured in tokens (words / CJK characters).
  const total = React.useMemo(() => countRevealTokens(text), [text]);
  const rate = revealTokensPerSecond(text);
  const fadeChars = revealFadeTokens(text);

  const [pos, setPos] = React.useState(active ? (animate ? 0 : ALL) : 0);
  const posRef = React.useRef(pos);
  const totalRef = React.useRef(total);
  totalRef.current = total;
  const rateRef = React.useRef(rate);
  rateRef.current = rate;
  const fadeRef = React.useRef(fadeChars);
  fadeRef.current = fadeChars;
  const onCompleteRef = React.useRef(onComplete);
  onCompleteRef.current = onComplete;
  const isStreamCompleteRef = React.useRef(isStreamComplete);
  isStreamCompleteRef.current = isStreamComplete;
  const completedRef = React.useRef(false);
  const frameRef = React.useRef<number | null>(null);
  const previousUnitsRef = React.useRef(units);

  const setPosSynced = React.useCallback((next: number) => {
    posRef.current = next;
    setPos(next);
  }, []);

  const maybeComplete = React.useCallback(() => {
    if (completedRef.current || totalRef.current === 0) return;
    if (posRef.current >= totalRef.current && isStreamCompleteRef.current) {
      completedRef.current = true;
      onCompleteRef.current?.();
    }
  }, []);

  const stop = React.useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
  }, []);

  const start = React.useCallback(() => {
    if (frameRef.current !== null) return;
    let last: number | null = null;
    const tick = (now: number) => {
      const dt = last === null ? 16 : Math.min(64, now - last);
      last = now;
      const end = totalRef.current + fadeRef.current;
      const next = Math.min(end, posRef.current + (rateRef.current * dt) / 1000);
      setPosSynced(next);
      maybeComplete();
      if (next >= end) {
        frameRef.current = null;
        return;
      }
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
  }, [maybeComplete, setPosSynced]);

  React.useEffect(() => {
    const previous = previousUnitsRef.current;
    previousUnitsRef.current = units;

    if (!active) {
      stop();
      completedRef.current = false;
      setPosSynced(0);
      return;
    }
    if (!animate) {
      stop();
      setPosSynced(ALL);
      maybeComplete();
      return;
    }
    if (posRef.current >= ALL) setPosSynced(0);

    // Streaming normally appends; if earlier text was rewritten, step back to
    // the unchanged prefix so no stale characters stay visible.
    let common = 0;
    while (common < previous.length && common < units.length && previous[common] === units[common]) common += 1;
    if (common < previous.length) {
      const commonTokens = countRevealTokens(units.slice(0, common).join(''));
      if (posRef.current > commonTokens) setPosSynced(commonTokens);
    }

    if (total > posRef.current) completedRef.current = false;
    start();
  }, [active, animate, maybeComplete, setPosSynced, start, stop, total, units]);

  React.useEffect(() => {
    maybeComplete();
  }, [isStreamComplete, maybeComplete]);

  React.useEffect(() => stop, [stop]);

  return { pos, fadeChars };
}
