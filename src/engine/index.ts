/**
 * LifeFlow AI — deterministic scheduling engine (public surface).
 *
 * This module owns ALL time math: recurrence expansion, conflict detection,
 * and re-import reconciliation. It is pure, dependency-free, and the
 * most-tested code in the system. The LLM never does this work
 * (see docs/TECH_SPEC.md §0 principle 2).
 */

export * from './recurrence.ts';
export * from './conflicts.ts';
export * from './dedup.ts';
export * from './reminders.ts';
export * from './notifications.ts';
export {
  type LocalDate,
  type WeekdayCode,
  zonedLocalToUtcMs,
  toISO,
  weekday,
  addDays,
  addMonths,
} from './time.ts';
