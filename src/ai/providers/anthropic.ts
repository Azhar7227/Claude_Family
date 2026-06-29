/**
 * Anthropic (Claude) adapter. Uses the Messages API with a forced tool call to
 * guarantee the model emits our schema as the tool input (reliable structured
 * output). Returns RAW, unvalidated JSON — the boundary validator decides.
 */

import type { AIProvider, Capability, StructuredRequest, StructuredResult } from '../provider.ts';
import { postJson, splitParts, type HttpProviderConfig } from './http.ts';

const DEFAULT_MODEL = 'claude-haiku-4-5';
const DEFAULT_BASE = 'https://api.anthropic.com';

export class AnthropicProvider implements AIProvider {
  readonly name = 'anthropic';
  readonly capabilities: ReadonlySet<Capability> = new Set<Capability>(['structured_output', 'vision', 'ocr', 'tool_calling']);
  private cfg: HttpProviderConfig;
  constructor(cfg: HttpProviderConfig) {
    this.cfg = cfg;
  }

  async generateStructured(req: StructuredRequest): Promise<StructuredResult> {
    const model = this.cfg.model ?? DEFAULT_MODEL;
    const { texts, images } = splitParts(req.input);
    const content: unknown[] = [
      ...images.map((im) => ({ type: 'image', source: { type: 'base64', media_type: im.mime, data: im.base64 } })),
      { type: 'text', text: texts.join('\n') || '(no text)' },
    ];
    const body = {
      model,
      max_tokens: this.cfg.maxOutputTokens ?? 2048,
      temperature: req.temperature ?? 0,
      system: req.instruction,
      tools: [{ name: 'emit_extraction', description: 'Return the extracted routine items.', input_schema: req.schema }],
      tool_choice: { type: 'tool', name: 'emit_extraction' },
      messages: [{ role: 'user', content }],
    };
    const json = (await postJson('anthropic', `${this.cfg.baseUrl ?? DEFAULT_BASE}/v1/messages`, {
      'x-api-key': this.cfg.apiKey,
      'anthropic-version': '2023-06-01',
    }, body, this.cfg)) as AnthropicResponse;

    const toolBlock = json.content?.find((b) => b.type === 'tool_use');
    const raw = toolBlock?.input ?? {};
    return {
      raw,
      meta: {
        provider: this.name,
        model,
        promptVersion: req.promptVersion,
        tokensIn: json.usage?.input_tokens,
        tokensOut: json.usage?.output_tokens,
        finishReason: json.stop_reason,
      },
    };
  }
}

interface AnthropicResponse {
  content?: Array<{ type: string; input?: unknown }>;
  usage?: { input_tokens?: number; output_tokens?: number };
  stop_reason?: string;
}
