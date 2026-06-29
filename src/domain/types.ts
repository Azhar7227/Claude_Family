/**
 * LifeFlow AI — canonical domain model (MVP).
 * Mirrors docs/TECH_SPEC.md §1. These types are the contract every input
 * method converges on, and what the deterministic engine operates over.
 */

export type UUID = string;
export type IANATz = string; // e.g. "Asia/Kolkata"
export type ISO = string; // ISO-8601 datetime with offset, e.g. "2026-06-29T09:00:00+05:30"
export type ISODate = string; // "YYYY-MM-DD"
export type LocalTime = string; // "HH:mm" (24h)

export type TaskType = 'fixed' | 'flexible';

export type Category =
  | 'work'
  | 'health'
  | 'family'
  | 'faith'
  | 'learning'
  | 'chore'
  | 'social'
  | 'other';

export type CaptureMethod = 'text' | 'image' | 'ics' | 'voice' | 'pdf' | 'csv';

export interface CaptureSource {
  method: CaptureMethod;
  uploadId?: UUID;
  capturedAt: ISO;
}

export interface Task {
  id: UUID;
  spaceId: UUID;
  routineId?: UUID;
  title: string;
  type: TaskType;
  category: Category;
  assigneePersonId?: UUID;
  priority: 1 | 2 | 3 | 4 | 5; // 1 = highest
  estDurationMin?: number;
  notes?: string;
  source: CaptureSource;
}

export interface RecurrenceRule {
  id: UUID;
  taskId: UUID;
  /** RFC 5545 RRULE text, e.g. "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR". */
  rrule: string;
  /** Anchor date of the series (RFC 5545 DTSTART date part), local calendar date. */
  dtStart: ISODate;
  startTimeLocal?: LocalTime;
  endTimeLocal?: LocalTime;
  timezone: IANATz;
  /** Exception dates (skip these occurrences), local calendar dates. */
  exDates?: ISODate[];
}

export type OccStatus = 'planned' | 'done' | 'missed' | 'skipped' | 'moved';

export interface Occurrence {
  id: UUID;
  taskId: UUID;
  spaceId: UUID;
  start: ISO;
  end: ISO;
  status: OccStatus;
  /** Set when an occurrence is moved, so the ledger can show before/after. */
  originalStart?: ISO;
  completedAt?: ISO;
}

/** A user-declared block nothing may schedule over (sleep, family dinner). */
export interface ProtectedTime {
  id: UUID;
  spaceId: UUID;
  label: string;
  /** RRULE describing when the protection recurs. */
  rrule: string;
  startTimeLocal: LocalTime;
  endTimeLocal: LocalTime;
  timezone: IANATz;
}
