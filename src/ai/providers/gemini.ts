/**
 * Google (Gemini) adapter. Uses generateContent with responseSchema +
 * responseMimeType=application/json for structured output. Returns RAW JSON.
 *
 * Gemini's schema dialect is an OpenAPI subset: no `additionalProperties`,
 * `enum` only on strings. toGeminiSchema() down-converts our JSON Schema.
 */

import type { AIProvider, Capability, JsonSchema, StructuredRequest, StructuredResult } from '../provider.ts';
import { parseLooseJson, postJson, splitParts, type HttpProviderConfig } from './http.ts';

const DEFAULT_MODEL = 'gemini-2.5-flash';
const DEFAULT_BASE = 'https://generativelanguage.googleapis.com';

export class GeminiProvider implements AIProvider {
  readonly name = 'gemini';
  readonly capabilities: ReadonlySet<Capability> = new Set<Capability>(['structured_output', 'vision', 'ocr']);
  private cfg: HttpProviderConfig;
  constructor(cfg: HttpProviderConfig) {
    this.cfg = cfg;
  }

  async generateStructured(req: StructuredRequest): Promise<StructuredResult> {
    const model = this.cfg.model ?? DEFAULT_MODEL;
    const { texts, images } = splitParts(req.input);
    const parts: unknown[] = [
      { text: texts.join('\n') || '(no text)' },
      ...images.map((im) => ({ inlineData: { mimeType: im.mime, data: im.base64 } })),
    ];
    const body = {
      systemInstruction: { parts: [{ text: req.instruction }] },
      contents: [{ role: 'user', parts }],
      generationConfig: {
        temperature: req.temperature ?? 0,
        maxOutputTokens: this.cfg.maxOutputTokens ?? 2048,
        responseMimeType: 'application/json',
        responseSchema: toGeminiSchema(req.schema),
      },
    };
    const base = this.cfg.baseUrl ?? DEFAULT_BASE;
    const json = (await postJson('gemini', `${base}/v1beta/models/${model}:generateContent?key=${this.cfg.apiKey}`, {}, body, this.cfg)) as GeminiResponse;

    const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '{}';
    return {
      raw: parseLooseJson(text),
      meta: {
        provider: this.name,
        model,
        promptVersion: req.promptVersion,
        tokensIn: json.usageMetadata?.promptTokenCount,
        tokensOut: json.usageMetadata?.candidatesTokenCount,
        finishReason: json.candidates?.[0]?.finishReason,
      },
    };
  }
}

/** Down-convert our JSON Schema to Gemini's OpenAPI subset. */
export function toGeminiSchema(schema: JsonSchema): JsonSchema {
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (node && typeof node === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        if (k === 'additionalProperties') continue; // unsupported
        out[k] = walk(v);
      }
      return out;
    }
    return node;
  };
  return walk(schema) as JsonSchema;
}

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}
