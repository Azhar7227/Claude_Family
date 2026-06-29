/**
 * Extraction service — the business-logic seam over the AI provider port.
 *
 * It knows about the canonical contract (ExtractionResult) and validation; it
 * does NOT know which provider is in use. Swapping providers never touches this
 * file. Every provider response is schema-validated here before returning, so
 * nothing unvalidated can reach the Proposal engine.
 */

import { assertCanHandle, type AIProvider, type InputPart, type StructuredRequest } from './provider.ts';
import { EXTRACTION_RESULT_SCHEMA, validateExtractionResult } from './schema.ts';
import type { ExtractionResult } from './types.ts';

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

export interface ExtractOutput {
  result: ExtractionResult;
  meta: { provider: string; model: string; promptVersion: string };
}

/**
 * Run extraction through a provider and validate the response.
 * Throws SchemaValidationError if the provider returns malformed output, and
 * UnsupportedCapabilityError if an input part needs a capability the provider lacks.
 */
export async function extract(provider: AIProvider, input: ExtractInput): Promise<ExtractOutput> {
  assertCanHandle(provider, input.parts);

  const req: StructuredRequest = {
    instruction: INSTRUCTION,
    input: input.parts,
    schema: EXTRACTION_RESULT_SCHEMA,
    schemaName: 'ExtractionResult',
    promptVersion: EXTRACTION_PROMPT_VERSION,
    temperature: 0,
  };

  const { raw, meta } = await provider.generateStructured(req);
  const result = validateExtractionResult(raw); // boundary: never trust the provider

  return {
    result,
    meta: { provider: meta.provider, model: meta.model, promptVersion: meta.promptVersion },
  };
}
