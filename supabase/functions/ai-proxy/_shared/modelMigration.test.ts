import { assertEquals } from 'jsr:@std/assert';
import { OPENAI_ALLOWED_MODELS } from './runtimeConfig.ts';
import { routeOpenAIModelForAction } from '../providers/openaiProvider.ts';

Deno.test('OPENAI_ALLOWED_MODELS defaults to gpt-5.6-terra', () => {
  assertEquals(OPENAI_ALLOWED_MODELS[0], 'gpt-5.6-terra');
});

Deno.test('routeOpenAIModelForAction defaults to gpt-5.6-terra', () => {
  const route = routeOpenAIModelForAction({
    action: 'analyze_text',
    payloadSize: 100,
  });
  assertEquals(route.model, 'gpt-5.6-terra');
});
