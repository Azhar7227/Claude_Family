import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AnthropicProvider } from './anthropic.ts';
import { OpenAIProvider } from './openai.ts';
import { GeminiProvider, toGeminiSchema } from './gemini.ts';
import { EXTRACTION_RESULT_SCHEMA, validateExtractionResult } from '../schema.ts';
import { extract } from '../extraction.ts';
import { createProvider, providerConfigFromEnv, MissingApiKeyError, priceFor } from '../registry.ts';
import type { StructuredRequest } from '../provider.ts';

const REQ: StructuredRequest = {
  instruction: 'x',
  input: [{ kind: 'text', text: 'Gym daily at 6pm' }],
  schema: EXTRACTION_RESULT_SCHEMA,
  schemaName: 'ExtractionResult',
  promptVersion: 'test',
};

const GOLD = { items: [{ tempId: 'a', title: 'Gym', type: 'flexible', category: 'health', confidence: 0.9, startTimeLocal: '18:00', rrule: 'FREQ=DAILY' }], ambiguities: [], warnings: [] };

function mockFetch(payload: unknown): typeof fetch {
  return (async () => new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch;
}

test('Anthropic adapter maps tool_use input -> valid ExtractionResult', async () => {
  const p = new AnthropicProvider({ apiKey: 'k', fetchImpl: mockFetch({ content: [{ type: 'tool_use', input: GOLD }], usage: { input_tokens: 120, output_tokens: 40 }, stop_reason: 'tool_use' }) });
  const out = await extract(p, { parts: REQ.input });
  assert.equal(out.result.items[0]!.title, 'Gym');
  assert.equal(out.meta.provider, 'anthropic');
});

test('OpenAI adapter maps message.content JSON -> valid ExtractionResult', async () => {
  const p = new OpenAIProvider({ apiKey: 'k', fetchImpl: mockFetch({ choices: [{ message: { content: JSON.stringify(GOLD) }, finish_reason: 'stop' }], usage: { prompt_tokens: 100, completion_tokens: 30 } }) });
  const r = await p.generateStructured(REQ);
  const result = validateExtractionResult(r.raw);
  assert.equal(result.items[0]!.category, 'health');
  assert.equal(r.meta.tokensIn, 100);
});

test('OpenAI adapter tolerates code-fenced JSON', async () => {
  const fenced = '```json\n' + JSON.stringify(GOLD) + '\n```';
  const p = new OpenAIProvider({ apiKey: 'k', fetchImpl: mockFetch({ choices: [{ message: { content: fenced } }] }) });
  const r = await p.generateStructured(REQ);
  assert.equal(validateExtractionResult(r.raw).items.length, 1);
});

test('Gemini adapter maps candidates parts -> valid ExtractionResult', async () => {
  const p = new GeminiProvider({ apiKey: 'k', fetchImpl: mockFetch({ candidates: [{ content: { parts: [{ text: JSON.stringify(GOLD) }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 90, candidatesTokenCount: 25 } }) });
  const r = await p.generateStructured(REQ);
  assert.equal(validateExtractionResult(r.raw).items[0]!.rrule, 'FREQ=DAILY');
  assert.equal(r.meta.tokensOut, 25);
});

test('toGeminiSchema strips additionalProperties recursively', () => {
  const g = toGeminiSchema(EXTRACTION_RESULT_SCHEMA);
  assert.equal(JSON.stringify(g).includes('additionalProperties'), false);
});

test('registry: config-only selection; missing key throws', () => {
  assert.equal(createProvider({ provider: 'stub' }).name, 'stub');
  assert.throws(() => createProvider({ provider: 'gemini' }), MissingApiKeyError);
  assert.equal(createProvider({ provider: 'gemini', apiKey: 'k' }).name, 'gemini');
});

test('registry: env config maps provider + key', () => {
  const cfg = providerConfigFromEnv({ LIFEFLOW_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'sk' });
  assert.equal(cfg.provider, 'anthropic');
  assert.equal(cfg.apiKey, 'sk');
  assert.equal(createProvider(cfg).name, 'anthropic');
});

test('pricing table has entries for default models', () => {
  assert.ok(priceFor('gemini-2.5-flash').inPerM > 0);
  assert.equal(priceFor('deterministic-stub-v1').inPerM, 0);
});

test('a provider returning malformed JSON is rejected at the boundary (not trusted)', async () => {
  const p = new OpenAIProvider({ apiKey: 'k', fetchImpl: mockFetch({ choices: [{ message: { content: '{"items":[{"tempId":"x"}],"ambiguities":[],"warnings":[]}' } }] }) });
  await assert.rejects(() => extract(p, { parts: REQ.input }));
});
