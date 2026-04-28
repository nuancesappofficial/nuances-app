declare const Deno: any;

import { GEMINI_ALLOWED_MODELS } from '../_shared/runtimeConfig.ts';

type ProviderExecutionMetrics = {
  provider: 'openai' | 'gemini';
  model: string;
  latencyMs: number;
  ttfbMs?: number;
  inputTokens?: number;
  outputTokens?: number;
};

type ProviderResponse = {
  content: string;
  metrics: ProviderExecutionMetrics;
};

export type ProviderModelRoute = {
  model: string;
  tier: 'fast' | 'balanced' | 'quality';
  reason: string;
};

function pickModel(
  requested: unknown,
  allowed: string[],
  fallback: string
): string {
  if (typeof requested === 'string' && allowed.includes(requested)) {
    return requested;
  }
  return fallback;
}

export function routeGeminiModelForAction(params: {
  action:
    | 'analyze_text'
    | 'generate_card'
    | 'analyze_context'
    | 'analyze_and_generate_card'
    | 'legacy_gemini';
  payloadSize: number;
  requested?: unknown;
}): ProviderModelRoute {
  if (typeof params.requested === 'string' && GEMINI_ALLOWED_MODELS.includes(params.requested)) {
    return {
      model: params.requested,
      tier: 'quality',
      reason: 'explicit_model_override',
    };
  }

  const fast = GEMINI_ALLOWED_MODELS[0] ?? 'gemini-2.0-flash-lite';
  const balanced = GEMINI_ALLOWED_MODELS[Math.min(1, GEMINI_ALLOWED_MODELS.length - 1)] ?? fast;
  const quality = GEMINI_ALLOWED_MODELS[Math.min(2, GEMINI_ALLOWED_MODELS.length - 1)] ?? balanced;

  if (params.action === 'analyze_text') {
    return { model: fast, tier: 'fast', reason: 'short_keyword_extraction' };
  }
  if (params.payloadSize > 1200 || params.action === 'analyze_context') {
    return { model: quality, tier: 'quality', reason: 'long_or_context_heavy' };
  }
  if (params.action === 'generate_card' || params.action === 'analyze_and_generate_card') {
    return { model: fast, tier: 'fast', reason: 'content_generation' };
  }
  return { model: fast, tier: 'fast', reason: 'default_low_latency' };
}

function toGeminiContents(messages: { role: string; content: unknown }[]) {
  const contents = messages.map((msg) => ({
    role: msg.role === 'system' ? 'user' : msg.role,
    parts: [{ text: String(msg.content ?? '') }],
  }));

  if (messages[0]?.role === 'system' && messages.length > 1) {
    contents[0] = {
      role: 'user',
      parts: [
        {
          text: `[System Instructions]\n${String(
            messages[0].content ?? ''
          )}\n\n[User Query]\n${String(messages[1].content ?? '')}`,
        },
      ],
    };
    contents.splice(1, 1);
  }

  return contents;
}

function stripMarkdownFences(raw: string): string {
  const trimmed = raw.trim();
  return trimmed
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();
}

export async function callGeminiLegacy(params: {
  model: string;
  messages: { role: string; content: unknown }[];
  temperature?: number;
  maxTokens: number;
  jsonMode?: boolean;
}): Promise<ProviderResponse> {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) {
    throw new Error('Missing GEMINI_API_KEY in Edge Function secrets');
  }

  const startedAt = Date.now();
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${params.model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: toGeminiContents(params.messages),
        // 🚀 關鍵修正 1：關閉所有安全濾網，避免 OCR 亂碼被誤判為有害內容
        safetySettings: [
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
        ],
        generationConfig: {
          temperature: params.temperature ?? 0.7,
          maxOutputTokens: params.maxTokens,
          ...(params.jsonMode ? { responseMimeType: 'application/json' } : {}),
        },
      }),
    }
  );

  const data = await response.json();
  if (!response.ok) {
    throw new Error(
      (data as { error?: { message?: string } })?.error?.message
        || `Gemini request failed (${response.status})`
    );
  }

  const candidate = (data as any)?.candidates?.[0];
  
  // 記錄是否被安全機制擋下
  if (candidate?.finishReason === 'SAFETY') {
    console.error('[ai-proxy] Gemini generation blocked by SAFETY filters!');
  }

  const usage = (data as any)?.usageMetadata;
  const rawContent = Array.isArray(candidate?.content?.parts)
    ? candidate.content.parts
      .map((part: any) => (typeof part?.text === 'string' ? part.text : ''))
      .join('')
    : '';
  
  // 即使不強制 JSON Mode，我們依然呼叫 stripMarkdownFences 來清理頭尾
  const cleanedContent = params.jsonMode
    ? stripMarkdownFences(rawContent)
    : rawContent;

  return {
    content: cleanedContent,
    metrics: {
      provider: 'gemini',
      model: params.model,
      latencyMs: Date.now() - startedAt,
      inputTokens: typeof usage?.promptTokenCount === 'number' ? usage.promptTokenCount : undefined,
      outputTokens: typeof usage?.candidatesTokenCount === 'number' ? usage.candidatesTokenCount : undefined,
    },
  };
}
