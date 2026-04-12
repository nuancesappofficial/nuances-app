import { AI_OUTPUT_TOKEN_CAP } from './runtimeConfig.ts';

export function sanitizeText(input: unknown, maxLen: number): string {
  if (typeof input !== 'string') return '';
  return input.trim().slice(0, maxLen);
}

export function normalizeTargetToken(input: string): string {
  return input
    .replace(/^[\s\"'“”‘’()[\]{}<>.,!?;:]+|[\s\"'“”‘’()[\]{}<>.,!?;:]+$/g, '')
    .trim();
}

export function clampTokens(value: unknown, maxAllowed: number): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return maxAllowed;
  return Math.max(1, Math.min(Math.floor(value), Math.min(maxAllowed, AI_OUTPUT_TOKEN_CAP)));
}
