/**
 * Schema validation boundary (TECH_SPEC §3 contract rules).
 *
 * EVERY AI response passes through validateExtractionResult() before it can
 * enter the Proposal engine. Providers are never trusted:
 *   - structural violations  -> throw SchemaValidationError (reject the response)
 *   - soft contract issues    -> sanitized + recorded as warnings (e.g. an
 *                                invalid rrule is dropped to a single occurrence)
 * The engine — not the model — is the authority on RRULE validity.
 */

import type { Category, TaskType } from '../domain/types.ts';
import { isValidRRule } from '../engine/recurrence.ts';
import type { JsonSchema } from './provider.ts';
import type { ExtractedItem, ExtractionResult, Ambiguity } from './types.ts';

const CATEGORIES: ReadonlySet<Category> = new Set<Category>([
  'work',
  'health',
  'family',
  'faith',
  'learning',
  'chore',
  'social',
  'other',
]);
const TASK_TYPES: ReadonlySet<TaskType> = new Set<TaskType>(['fixed', 'flexible']);

const HHMM = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const YMD = /^\d{4}-\d{2}-\d{2}$/;

export class SchemaValidationError extends Error {
  readonly issues: string[];
  constructor(message: string, issues: string[]) {
    super(message);
    this.name = 'SchemaValidationError';
    this.issues = issues;
  }
}

/** The JSON Schema providers are asked to honor. Exported so adapters send the contract. */
export const EXTRACTION_RESULT_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['items', 'ambiguities', 'warnings'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['tempId', 'title', 'type', 'category', 'confidence'],
        properties: {
          tempId: { type: 'string' },
          title: { type: 'string' },
          type: { enum: ['fixed', 'flexible'] },
          category: { enum: [...CATEGORIES] },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          startTimeLocal: { type: 'string' },
          endTimeLocal: { type: 'string' },
          durationMin: { type: 'number' },
          rrule: { type: 'string' },
          dtStart: { type: 'string' },
          assigneeName: { type: 'string' },
          priorityHint: { type: 'integer', minimum: 1, maximum: 5 },
          notes: { type: 'string' },
          sourceSpan: { type: 'string' },
        },
      },
    },
    ambiguities: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['tempId', 'field', 'question'],
        properties: {
          tempId: { type: 'string' },
          field: { type: 'string' },
          question: { type: 'string' },
          options: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    warnings: { type: 'array', items: { type: 'string' } },
  },
};

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Validate + sanitize a raw provider response into an ExtractionResult.
 * Throws SchemaValidationError on structural violations.
 */
export function validateExtractionResult(raw: unknown): ExtractionResult {
  const issues: string[] = [];
  if (!isObject(raw)) throw new SchemaValidationError('response is not an object', ['root: not an object']);

  if (!Array.isArray(raw.items)) issues.push('items: must be an array');
  if (raw.ambiguities !== undefined && !Array.isArray(raw.ambiguities)) issues.push('ambiguities: must be an array');
  if (raw.warnings !== undefined && !Array.isArray(raw.warnings)) issues.push('warnings: must be an array');
  if (issues.length) throw new SchemaValidationError('structural validation failed', issues);

  const warnings: string[] = Array.isArray(raw.warnings) ? raw.warnings.filter((w): w is string => typeof w === 'string') : [];
  const items: ExtractedItem[] = [];

  (raw.items as unknown[]).forEach((rawItem, idx) => {
    if (!isObject(rawItem)) {
      issues.push(`items[${idx}]: not an object`);
      return;
    }
    const where = `items[${idx}]`;

    // --- structural (hard) checks ---
    if (typeof rawItem.tempId !== 'string' || !rawItem.tempId) issues.push(`${where}.tempId: required string`);
    if (typeof rawItem.title !== 'string' || !rawItem.title.trim()) issues.push(`${where}.title: required non-empty string`);
    if (typeof rawItem.type !== 'string' || !TASK_TYPES.has(rawItem.type as TaskType)) {
      issues.push(`${where}.type: must be 'fixed' | 'flexible'`);
    }
    if (typeof rawItem.category !== 'string' || !CATEGORIES.has(rawItem.category as Category)) {
      issues.push(`${where}.category: invalid category`);
    }
    if (typeof rawItem.confidence !== 'number' || Number.isNaN(rawItem.confidence)) {
      issues.push(`${where}.confidence: required number`);
    }
    if (issues.length) return; // collect this item's structural problems, skip soft pass

    // --- soft (sanitizing) checks ---
    const item: ExtractedItem = {
      tempId: rawItem.tempId as string,
      title: (rawItem.title as string).trim(),
      type: rawItem.type as TaskType,
      category: rawItem.category as Category,
      confidence: clamp01(rawItem.confidence as number),
    };

    if (typeof rawItem.startTimeLocal === 'string') {
      if (HHMM.test(rawItem.startTimeLocal)) item.startTimeLocal = rawItem.startTimeLocal;
      else warnings.push(`${where}.startTimeLocal "${rawItem.startTimeLocal}" ignored (not HH:mm)`);
    }
    if (typeof rawItem.endTimeLocal === 'string') {
      if (HHMM.test(rawItem.endTimeLocal)) item.endTimeLocal = rawItem.endTimeLocal;
      else warnings.push(`${where}.endTimeLocal "${rawItem.endTimeLocal}" ignored (not HH:mm)`);
    }
    if (typeof rawItem.durationMin === 'number' && rawItem.durationMin > 0) item.durationMin = rawItem.durationMin;
    if (typeof rawItem.dtStart === 'string') {
      if (YMD.test(rawItem.dtStart)) item.dtStart = rawItem.dtStart;
      else warnings.push(`${where}.dtStart "${rawItem.dtStart}" ignored (not YYYY-MM-DD)`);
    }
    // RRULE: engine is the authority. Invalid -> drop to single occurrence + warning.
    if (typeof rawItem.rrule === 'string' && rawItem.rrule.trim()) {
      if (isValidRRule(rawItem.rrule)) item.rrule = rawItem.rrule;
      else warnings.push(`${where}.rrule "${rawItem.rrule}" invalid — treated as one-off`);
    }
    if (typeof rawItem.assigneeName === 'string') item.assigneeName = rawItem.assigneeName;
    if (typeof rawItem.priorityHint === 'number' && rawItem.priorityHint >= 1 && rawItem.priorityHint <= 5) {
      item.priorityHint = Math.round(rawItem.priorityHint) as 1 | 2 | 3 | 4 | 5;
    }
    if (typeof rawItem.notes === 'string') item.notes = rawItem.notes;
    if (typeof rawItem.sourceSpan === 'string') item.sourceSpan = rawItem.sourceSpan;

    items.push(item);
  });

  if (issues.length) throw new SchemaValidationError('structural validation failed', issues);

  const ambiguities: Ambiguity[] = Array.isArray(raw.ambiguities)
    ? (raw.ambiguities as unknown[]).flatMap((a) => {
        if (!isObject(a) || typeof a.tempId !== 'string' || typeof a.field !== 'string' || typeof a.question !== 'string') {
          return [];
        }
        const amb: Ambiguity = { tempId: a.tempId, field: a.field, question: a.question };
        if (Array.isArray(a.options)) amb.options = a.options.filter((o): o is string => typeof o === 'string');
        return [amb];
      })
    : [];

  return { items, ambiguities, warnings };
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
