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
import type { ExtractedItem, ExtractionResult, Ambiguity, Goal, ProfileFact, ExtractedConstraint } from './types.ts';

const PROFILE_KINDS: ReadonlySet<string> = new Set(['role', 'work', 'family', 'health', 'location', 'preference', 'faith', 'other']);
const CONSTRAINT_KINDS: ReadonlySet<string> = new Set(['before', 'after', 'between', 'day_off']);
const WEEKDAYS: ReadonlySet<string> = new Set(['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']);

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

const TIME_OF_DAY = ['early_morning', 'morning', 'midday', 'afternoon', 'evening', 'night'] as const;

/** The JSON Schema providers are asked to honor (ontology v2). */
export const EXTRACTION_RESULT_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['profile', 'items', 'goals', 'constraints', 'ambiguities', 'warnings'],
  properties: {
    profile: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'value'],
        properties: {
          kind: { enum: ['role', 'work', 'family', 'health', 'location', 'preference', 'faith', 'other'] },
          value: { type: 'string' },
          sourceSpan: { type: 'string' },
        },
      },
    },
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
          protected: { type: 'boolean' },
          startTimeLocal: { type: 'string' },
          endTimeLocal: { type: 'string' },
          timeOfDay: { enum: [...TIME_OF_DAY] },
          durationMin: { type: 'number' },
          frequency: {
            type: 'object',
            additionalProperties: false,
            required: ['unit', 'count'],
            properties: { unit: { enum: ['day', 'week', 'month'] }, count: { type: 'integer', minimum: 1 } },
          },
          rrule: { type: 'string' },
          dtStart: { type: 'string' },
          assigneeName: { type: 'string' },
          priorityHint: { type: 'integer', minimum: 1, maximum: 5 },
          notes: { type: 'string' },
          sourceSpan: { type: 'string' },
        },
      },
    },
    goals: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title'],
        properties: {
          title: { type: 'string' },
          metric: { type: 'string' },
          target: { type: 'string' },
          deadline: { type: 'string' },
          sourceSpan: { type: 'string' },
        },
      },
    },
    constraints: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['label', 'kind'],
        properties: {
          label: { type: 'string' },
          kind: { enum: ['before', 'after', 'between', 'day_off'] },
          timeLocal: { type: 'string' },
          startLocal: { type: 'string' },
          endLocal: { type: 'string' },
          weekdays: { type: 'array', items: { enum: ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] } },
          category: { enum: [...CATEGORIES] },
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
    if (rawItem.protected === true) item.protected = true;
    if (typeof rawItem.timeOfDay === 'string' && (TIME_OF_DAY as readonly string[]).includes(rawItem.timeOfDay)) {
      item.timeOfDay = rawItem.timeOfDay as ExtractedItem['timeOfDay'];
    }
    if (isObject(rawItem.frequency) && typeof rawItem.frequency.count === 'number' && rawItem.frequency.count >= 1
        && ['day', 'week', 'month'].includes(String(rawItem.frequency.unit))) {
      item.frequency = { unit: rawItem.frequency.unit as 'day' | 'week' | 'month', count: Math.round(rawItem.frequency.count) };
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

  // profile + goals are optional (default []), so v1-shaped fixtures still validate.
  const profile: ProfileFact[] = Array.isArray(raw.profile)
    ? (raw.profile as unknown[]).flatMap((p) => {
        if (!isObject(p) || typeof p.value !== 'string' || !PROFILE_KINDS.has(String(p.kind))) return [];
        const fact: ProfileFact = { kind: p.kind as ProfileFact['kind'], value: p.value };
        if (typeof p.sourceSpan === 'string') fact.sourceSpan = p.sourceSpan;
        return [fact];
      })
    : [];

  const goals: Goal[] = Array.isArray(raw.goals)
    ? (raw.goals as unknown[]).flatMap((g) => {
        if (!isObject(g) || typeof g.title !== 'string' || !g.title.trim()) return [];
        const goal: Goal = { title: g.title.trim() };
        if (typeof g.metric === 'string') goal.metric = g.metric;
        if (typeof g.target === 'string') goal.target = g.target;
        if (typeof g.deadline === 'string') goal.deadline = g.deadline;
        if (typeof g.sourceSpan === 'string') goal.sourceSpan = g.sourceSpan;
        return [goal];
      })
    : [];

  const constraints: ExtractedConstraint[] = Array.isArray(raw.constraints)
    ? (raw.constraints as unknown[]).flatMap((c) => {
        if (!isObject(c) || typeof c.label !== 'string' || !CONSTRAINT_KINDS.has(String(c.kind))) return [];
        const con: ExtractedConstraint = { label: c.label, kind: c.kind as ExtractedConstraint['kind'] };
        if (typeof c.timeLocal === 'string' && HHMM.test(c.timeLocal)) con.timeLocal = c.timeLocal;
        if (typeof c.startLocal === 'string' && HHMM.test(c.startLocal)) con.startLocal = c.startLocal;
        if (typeof c.endLocal === 'string' && HHMM.test(c.endLocal)) con.endLocal = c.endLocal;
        if (Array.isArray(c.weekdays)) con.weekdays = c.weekdays.filter((w): w is string => typeof w === 'string' && WEEKDAYS.has(w));
        if (typeof c.category === 'string' && CATEGORIES.has(c.category as Category)) con.category = c.category as Category;
        if (typeof c.sourceSpan === 'string') con.sourceSpan = c.sourceSpan;
        return [con];
      })
    : [];

  return { profile, items, goals, constraints, ambiguities, warnings };
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
