/**
 * IcsExtractionProvider — a deterministic AIProvider backed by the .ics parser,
 * not a model. It demonstrates the dependency-inversion payoff: a structured
 * input source plugs into the SAME extraction → validation → proposal pipeline
 * as the LLM providers, with zero orchestration changes. The schema/instruction
 * are ignored; output still passes the same validation boundary.
 */

import { icsToExtractionResult } from '../ingest/ics.ts';
import type { AIProvider, Capability, StructuredRequest, StructuredResult } from './provider.ts';

export class IcsExtractionProvider implements AIProvider {
  readonly name = 'ics';
  readonly capabilities: ReadonlySet<Capability> = new Set<Capability>(['structured_output']);

  async generateStructured(req: StructuredRequest): Promise<StructuredResult> {
    const icsText = req.input
      .filter((p) => p.kind === 'text' && p.text)
      .map((p) => p.text!)
      .join('\n');
    return {
      raw: icsToExtractionResult(icsText),
      meta: { provider: this.name, model: 'ics-parser-v1', promptVersion: req.promptVersion, tokensIn: 0, tokensOut: 0, finishReason: 'stop' },
    };
  }
}
