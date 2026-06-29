/**
 * Extraction service — the business-logic seam over the AI provider port.
 *
 * It knows about the canonical contract (ExtractionResult) and validation; it
 * does NOT know which provider is in use. Swapping providers never touches this
 * file. Every provider response is schema-validated here before returning, so
 * nothing unvalidated can reach the Proposal engine.
 *
 * Observability: if an EvalSink is provided, each request records an
 * ExtractionTrace (provider/model/prompt/latency/tokens/confidence/validation).
 * Telemetry is best-effort and wrapped — it can never change extraction's
 * behavior or fail the request.
 */

import { assertCanHandle, type AIProvider, type InputPart, type StructuredRequest } from './provider.ts';
import { EXTRACTION_RESULT_SCHEMA, SchemaValidationError, validateExtractionResult } from './schema.ts';
import type { ExtractionResult } from './types.ts';
import { confidenceStats, NoopEvalSink, type EvalSink, type InputMethod } from '../eval/sink.ts';

export const EXTRACTION_PROMPT_VERSION = 'extract-v1';

const INSTRUCTION = [
  'You extract schedulable items from a user describing their life.',
  'Return ONLY JSON matching the provided schema.',
  'Classify each item as "fixed" (immovable: work, meetings, school, prayer, appointments)',
  'or "flexible" (movable: study, gym, reading, walking).',
  'Use RFC 5545 RRULE for recurrence. Never invent times or dates not implied by the input;',
  'when unsure, add an entry to "ambiguities" instead of guessing.',
  'Provide a confidence in [0,1] and the source span for each item.',
].join(' ');

export interface ExtractInput {
  parts: InputPart[];
}

export interface ExtractObservability {
  sink?: EvalSink;
  traceId?: string;
  inputMethod?: InputMethod;
  /** Monotonic clock for latency (ms). Injectable for deterministic tests. */
  monotonicMs?: () => number;
  /** Wall-clock for the trace timestamp. */
  now?: () => string;
}

export interface ExtractOutput {
  result: ExtractionResult;
  meta: { provider: string; model: string; promptVersion: string; traceId?: string };
}

/**
 * Run extraction through a provider and validate the response.
 * Throws SchemaValidationError if the provider returns malformed output, and
 * UnsupportedCapabilityError if an input part needs a capability the provider lacks.
 */
export async function extract(
  provider: AIProvider,
  input: ExtractInput,
  obs: ExtractObservability = {},
): Promise<ExtractOutput> {
  assertCanHandle(provider, input.parts);

  const sink = obs.sink ?? new NoopEvalSink();
  const monotonic = obs.monotonicMs ?? (() => performance.now());
  const now = obs.now ?? (() => new Date().toISOString());
  const traceId = obs.traceId;
  const inputMethod: InputMethod = obs.inputMethod ?? inferMethod(input.parts);

  const req: StructuredRequest = {
    instruction: INSTRUCTION,
    input: input.parts,
    schema: EXTRACTION_RESULT_SCHEMA,
    schemaName: 'ExtractionResult',
    promptVersion: EXTRACTION_PROMPT_VERSION,
    temperature: 0,
  };

  const startedAt = monotonic();
  const { raw, meta } = await provider.generateStructured(req);
  const latencyMs = Math.round(monotonic() - startedAt);

  try {
    const result = validateExtractionResult(raw); // boundary: never trust the provider
    safeRecord(() => {
      const stats = confidenceStats(result.items.map((i) => i.confidence));
      sink.recordExtraction({
        traceId: traceId ?? meta.promptVersion + ':' + startedAt,
        at: now(),
        inputMethod,
        provider: meta.provider,
        model: meta.model,
        promptVersion: meta.promptVersion,
        latencyMs,
        tokensIn: meta.tokensIn,
        tokensOut: meta.tokensOut,
        itemCount: result.items.length,
        ...stats,
        validation: { ok: true, issueCount: 0 },
      });
    });
    return {
      result,
      meta: { provider: meta.provider, model: meta.model, promptVersion: meta.promptVersion, traceId },
    };
  } catch (err) {
    // Validation failures ARE signal — record them for quality monitoring, then rethrow.
    safeRecord(() => {
      const issues = err instanceof SchemaValidationError ? err.issues : [String(err)];
      sink.recordExtraction({
        traceId: traceId ?? meta.promptVersion + ':' + startedAt,
        at: now(),
        inputMethod,
        provider: meta.provider,
        model: meta.model,
        promptVersion: meta.promptVersion,
        latencyMs,
        tokensIn: meta.tokensIn,
        tokensOut: meta.tokensOut,
        itemCount: 0,
        avgConfidence: null,
        minConfidence: null,
        lowConfidenceCount: 0,
        validation: { ok: false, issueCount: issues.length, issues },
      });
    });
    throw err;
  }
}

function inferMethod(parts: InputPart[]): InputMethod {
  if (parts.some((p) => p.kind === 'image')) return 'image';
  if (parts.some((p) => p.kind === 'audio')) return 'voice';
  return 'text';
}

/** Telemetry must never break extraction. */
function safeRecord(fn: () => void): void {
  try {
    fn();
  } catch {
    /* swallow: observability is best-effort */
  }
}
