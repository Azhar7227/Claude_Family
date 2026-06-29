/**
 * OpenAI (GPT) adapter. Uses Chat Completions with response_format json_schema
 * for reliable structured output. Returns RAW, unvalidated JSON.
 */

import type { AIProvider, Capability, StructuredRequest, StructuredResult } from '../provider.ts';
import { parseLooseJson, postJson, splitParts, type HttpProviderConfig } from './http.ts';

const DEFAULT_MODEL = 'gpt-4o-mini';
const DEFAULT_BASE = 'https://api.openai.com';

export class OpenAIProvider implements AIProvider {
  readonly name = 'openai';
  readonly capabilities: ReadonlySet<Capability> = new Set<Capability>(['structured_output', 'vision', 'ocr', 'tool_calling']);
  private cfg: HttpProviderConfig;
  constructor(cfg: HttpProviderConfig) {
    this.cfg = cfg;
  }

  async generateStructured(req: StructuredRequest): Promise<StructuredResult> {
    const model = this.cfg.model ?? DEFAULT_MODEL;
    const { texts, images } = splitParts(req.input);
    const userContent: unknown[] = [
      { type: 'text', text: texts.join('\n') || '(no text)' },
      ...images.map((im) => ({ type: 'image_url', image_url: { url: `data:${im.mime};base64,${im.base64}` } })),
    ];
    const body = {
      model,
      temperature: req.temperature ?? 0,
      max_tokens: this.cfg.maxOutputTokens ?? 2048,
      messages: [
        { role: 'system', content: req.instruction },
        { role: 'user', content: userContent },
      ],
      response_format: { type: 'json_schema', json_schema: { name: req.schemaName, schema: req.schema, strict: false } },
    };
    const json = (await postJson('openai', `${this.cfg.baseUrl ?? DEFAULT_BASE}/v1/chat/completions`, {
      authorization: `Bearer ${this.cfg.apiKey}`,
    }, body, this.cfg)) as OpenAIResponse;

    const text = json.choices?.[0]?.message?.content ?? '{}';
    return {
      raw: parseLooseJson(text),
      meta: {
        provider: this.name,
        model,
        promptVersion: req.promptVersion,
        tokensIn: json.usage?.prompt_tokens,
        tokensOut: json.usage?.completion_tokens,
        finishReason: json.choices?.[0]?.finish_reason,
      },
    };
  }
}

interface OpenAIResponse {
  choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}
