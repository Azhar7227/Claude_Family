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
import { normalizeExtraction } from './normalize.ts';
import type { ExtractionResult } from './types.ts';
import { confidenceStats, NoopEvalSink, type EvalSink, type InputMethod } from '../eval/sink.ts';

export const EXTRACTION_PROMPT_VERSION = 'extract-v2';

const INSTRUCTION = [
  'You are a planner that EXTRACTS STRUCTURED INTENT from a person describing their life.',
  'Do NOT copy sentences. Understand what the person means, then fill the schema.',
  '',
  'Route each statement to the right slot:',
  '- profile: durable facts about the person, NOT tasks. "I\'m a Business Analyst" -> profile {kind:"role", value:"Business Analyst"}. "I have two kids" -> profile {kind:"family", value:"Two kids"}.',
  '- goals: aspirations that need a plan, not one task. "lose 15 kg" / "become a Salesforce Architect" -> goals.',
  '- constraints: scheduling BOUNDARIES that are not tasks. "No meetings before 10" -> {kind:"before", timeLocal:"10:00"}. "Keep Sundays free" -> {kind:"day_off", weekdays:["SU"]}. "Don\'t schedule over Maghrib" / "avoid the kids\' nap" -> {kind:"between", startLocal, endLocal}. "No work after 8pm" -> {kind:"after", timeLocal:"20:00"}.',
  '- items: schedulable tasks/routines/habits.',
  '',
  'For each item:',
  '- title: a SHORT canonical noun phrase, not the sentence. "Need gym four times" -> title "Gym". "Need Quran reading" -> title "Quran reading". Put the original phrasing in sourceSpan.',
  '- type: "fixed" = immovable commitments (meetings, school, appointments, prayers, flights); "flexible" = movable (gym, study, reading, family time, walks). "Spend time with my kids" is flexible.',
  '- protected: true when it must never be scheduled over (prayers, sleep, family dinner, or stated as "important").',
  '- frequency: counts like "four times a week" -> {unit:"week", count:4} (do NOT put a clock time).',
  '- timeOfDay: when only a part of day is implied ("every evening") and no clock time is given, set the band (morning/midday/afternoon/evening/night) and leave startTimeLocal empty.',
  '- startTimeLocal/endTimeLocal: only when an explicit clock time is stated.',
  '- rrule: RFC 5545 when a concrete recurrence is clear.',
  '- Domain knowledge: "Friday prayer"/Jumu\'ah is a weekly Friday congregational prayer (fixed, protected, faith). The five daily prayers are fixed/protected/faith. Exact prayer times are location-dependent — do not invent them; add an ambiguity instead.',
  '',
  'Never invent times/dates not implied; when unsure, add an "ambiguities" entry. Give a confidence in [0,1] and the sourceSpan for every item.',
  'Return ONLY JSON matching the schema, with keys profile, items, goals, constraints, ambiguities, warnings (use [] when empty).',
].join('\n');

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
    // boundary: never trust the provider, then canonicalize (planner-grade normalization)
    const result = normalizeExtraction(validateExtractionResult(raw));
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
