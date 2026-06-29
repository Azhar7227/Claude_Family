/**
 * AI extraction contract types (TECH_SPEC §3).
 *
 * This is the ONLY shape the orchestration layer accepts from any AI provider.
 * Providers emit raw JSON; it is validated into these types at the boundary
 * (see schema.ts) before anything reaches the Proposal engine.
 */

import type { Category, TaskType } from '../domain/types.ts';

export interface ExtractedItem {
  /** Local id for referencing this item within one extraction result. */
  tempId: string;
  title: string;
  type: TaskType;
  category: Category;
  /** 0..1; below CONFIDENCE_THRESHOLD the item is flagged for review, never silently committed. */
  confidence: number;
  startTimeLocal?: string; // "HH:mm"
  endTimeLocal?: string; // "HH:mm"
  durationMin?: number;
  /** RFC 5545 RRULE the model PROPOSES; engine re-validates and is the authority. */
  rrule?: string;
  /** Anchor date for the series, if the input implies one. Defaults applied downstream. */
  dtStart?: string; // "YYYY-MM-DD"
  assigneeName?: string;
  priorityHint?: 1 | 2 | 3 | 4 | 5;
  notes?: string;
  /** Exact input span this item was derived from — powers the trust UI & debugging. */
  sourceSpan?: string;
}

export interface Ambiguity {
  tempId: string;
  field: string;
  question: string;
  options?: string[];
}

export interface ExtractionResult {
  items: ExtractedItem[];
  ambiguities: Ambiguity[];
  warnings: string[];
}

export const CONFIDENCE_THRESHOLD = 0.6;
