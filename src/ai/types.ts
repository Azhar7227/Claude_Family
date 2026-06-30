/**
 * AI extraction contract types (TECH_SPEC §3) — ontology v2.
 *
 * The v1 schema modelled only "tasks", so the model crammed everything into a
 * task title (profile facts, goals, habit counts, time-of-day bands). v2 gives
 * the extractor the right slots so it can EXTRACT STRUCTURED INTENT instead of
 * copying sentences:
 *   - profile facts  ("I'm a Business Analyst", "I have two kids")
 *   - goals          ("lose 15 kg", "become a Salesforce Architect")
 *   - schedule items (tasks / routines / habits) with normalized titles,
 *     time-of-day bands, frequency counts, and a protected flag.
 *
 * A deterministic normalization pass (normalize.ts) canonicalizes whatever any
 * provider returns, so quality does not depend on a single model's phrasing.
 */

import type { Category, ConstraintKind, TaskType } from '../domain/types.ts';

export type TimeOfDay = 'early_morning' | 'morning' | 'midday' | 'afternoon' | 'evening' | 'night';

/** "four times a week" -> { unit: 'week', count: 4 }. */
export interface Frequency {
  unit: 'day' | 'week' | 'month';
  count: number;
}

export interface ExtractedItem {
  tempId: string;
  /** Normalized canonical noun phrase ("Gym", "Quran reading", "Jumu'ah") — NOT the raw sentence. */
  title: string;
  type: TaskType;
  category: Category;
  /** 0..1; below CONFIDENCE_THRESHOLD the item is flagged for review. */
  confidence: number;
  /** Never schedule over this (prayer, sleep, family dinner, "is important"). */
  protected?: boolean;
  startTimeLocal?: string; // explicit clock time only ("HH:mm")
  endTimeLocal?: string;
  /** When only a band is implied ("every evening") and no clock time was given. */
  timeOfDay?: TimeOfDay;
  durationMin?: number;
  /** Count-based cadence ("4 times a week") when specific days/times aren't given. */
  frequency?: Frequency;
  /** RFC 5545 RRULE when recurrence is determinable; engine re-validates. */
  rrule?: string;
  dtStart?: string; // "YYYY-MM-DD"
  assigneeName?: string;
  priorityHint?: 1 | 2 | 3 | 4 | 5;
  notes?: string;
  /** Exact input span this was derived from — for the trust UI & debugging. */
  sourceSpan?: string;
}

/** A durable fact about the person, not a schedulable thing. */
export interface ProfileFact {
  kind: 'role' | 'work' | 'family' | 'health' | 'location' | 'preference' | 'faith' | 'other';
  value: string; // normalized: "Business Analyst", "Two kids"
  sourceSpan?: string;
}

/** An aspiration that should generate a plan, not a single task. */
export interface Goal {
  title: string; // "Lose 15 kg", "Become a Salesforce Architect"
  metric?: string;
  target?: string;
  deadline?: string; // "YYYY-MM-DD"
  sourceSpan?: string;
}

/** A declarative scheduling boundary extracted from the user (pre-persistence). */
export interface ExtractedConstraint {
  label: string;
  kind: ConstraintKind;
  timeLocal?: string; // before/after ("HH:mm")
  startLocal?: string; // between
  endLocal?: string;
  weekdays?: string[]; // SU MO TU WE TH FR SA
  category?: Category;
  sourceSpan?: string;
}

export interface Ambiguity {
  tempId: string;
  field: string;
  question: string;
  options?: string[];
}

export interface ExtractionResult {
  /** Facts about the person (never turned into tasks). */
  profile: ProfileFact[];
  /** Schedulable items. */
  items: ExtractedItem[];
  /** Aspirations to plan toward. */
  goals: Goal[];
  /** Declarative scheduling boundaries. */
  constraints: ExtractedConstraint[];
  ambiguities: Ambiguity[];
  warnings: string[];
}

export const CONFIDENCE_THRESHOLD = 0.6;
