/**
 * Deterministic constraint expansion. Turns declarative boundaries
 * ("no meetings before 10", "keep Sundays free", "avoid the kids' nap") into
 * concrete forbidden UTC intervals for a date range, so the same machinery that
 * enforces protected time can keep these clear. Pure; tz-aware.
 */

import type { Constraint } from '../domain/types.ts';
import { addDays, formatLocalDate, parseHHmm, parseLocalDate, weekday, zonedLocalToUtcMs, type LocalDate } from './time.ts';

export interface ForbiddenInterval {
  constraintId: string;
  label: string;
  start: string; // UTC ISO
  end: string; // UTC ISO
}

/** Constraint shape accepted for expansion (id optional so freshly-extracted ones work). */
export type ExpandableConstraint = Omit<Constraint, 'id' | 'spaceId' | 'source'> & { id?: string };

function startOfDayUtc(date: LocalDate, tz: string): number {
  return zonedLocalToUtcMs(date, { h: 0, min: 0 }, tz);
}

/** Expand constraints into forbidden intervals across [fromLocalDate, toLocalDate] inclusive. */
export function expandConstraints(
  constraints: ExpandableConstraint[],
  fromLocalDate: string,
  toLocalDate: string,
  tz: string,
): ForbiddenInterval[] {
  const out: ForbiddenInterval[] = [];
  const from = parseLocalDate(fromLocalDate);
  const to = parseLocalDate(toLocalDate);
  const toN = dayNum(to);

  let cur = from;
  let guard = 0;
  while (dayNum(cur) <= toN && guard++ < 800) {
    const wd = weekday(cur);
    const nextDayStart = startOfDayUtc(addDays(cur, 1), tz);
    for (const c of constraints) {
      const id = c.id ?? `c_${c.kind}_${c.label}`;
      const applies = c.kind === 'day_off' ? (c.weekdays ?? []).includes(wd) : !c.weekdays || c.weekdays.includes(wd);
      if (!applies) continue;

      if (c.kind === 'day_off') {
        out.push({ constraintId: id, label: c.label, start: toISO(startOfDayUtc(cur, tz)), end: toISO(nextDayStart) });
      } else if (c.kind === 'before' && c.timeLocal) {
        const t = parseHHmm(c.timeLocal);
        out.push({ constraintId: id, label: c.label, start: toISO(startOfDayUtc(cur, tz)), end: toISO(zonedLocalToUtcMs(cur, t, tz)) });
      } else if (c.kind === 'after' && c.timeLocal) {
        const t = parseHHmm(c.timeLocal);
        out.push({ constraintId: id, label: c.label, start: toISO(zonedLocalToUtcMs(cur, t, tz)), end: toISO(nextDayStart) });
      } else if (c.kind === 'between' && c.startLocal && c.endLocal) {
        const s = parseHHmm(c.startLocal);
        const e = parseHHmm(c.endLocal);
        out.push({ constraintId: id, label: c.label, start: toISO(zonedLocalToUtcMs(cur, s, tz)), end: toISO(zonedLocalToUtcMs(cur, e, tz)) });
      }
    }
    cur = addDays(cur, 1);
  }
  return out.filter((i) => Date.parse(i.end) > Date.parse(i.start));
}

function dayNum(d: LocalDate): number {
  return Math.floor(Date.UTC(d.y, d.m - 1, d.d) / 86_400_000);
}
function toISO(ms: number): string {
  return new Date(ms).toISOString();
}
export { formatLocalDate };
