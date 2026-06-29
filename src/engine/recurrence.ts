/**
 * Deterministic RRULE parsing + occurrence expansion (MVP subset of RFC 5545).
 *
 * Supported: FREQ=DAILY|WEEKLY|MONTHLY, INTERVAL, BYDAY (weekly), BYMONTHDAY
 * (monthly), COUNT, UNTIL. This covers the schedules our capture pipeline
 * produces. The model PROPOSES an rrule; this code is the authority that
 * validates and expands it (TECH_SPEC §3 contract rule).
 */

import type { RecurrenceRule } from '../domain/types.ts';
import {
  type LocalDate,
  type WeekdayCode,
  addDays,
  addMonths,
  dayNumber,
  formatLocalDate,
  isWeekdayCode,
  parseHHmm,
  parseLocalDate,
  toISO,
  weekday,
  zonedLocalToUtcMs,
} from './time.ts';

export type Freq = 'DAILY' | 'WEEKLY' | 'MONTHLY';

export interface ParsedRRule {
  freq: Freq;
  interval: number;
  byDay?: WeekdayCode[];
  byMonthDay?: number[];
  count?: number;
  until?: LocalDate;
}

const MAX_ITERATIONS = 3650; // safety bound (~10y daily)

/** Parse an RRULE string into a validated structure. Throws on malformed input. */
export function parseRRule(rrule: string): ParsedRRule {
  const parts = rrule
    .replace(/^RRULE:/i, '')
    .split(';')
    .map((p) => p.trim())
    .filter(Boolean);

  const kv = new Map<string, string>();
  for (const part of parts) {
    const idx = part.indexOf('=');
    if (idx === -1) throw new Error(`malformed RRULE segment: ${part}`);
    kv.set(part.slice(0, idx).toUpperCase(), part.slice(idx + 1).toUpperCase());
  }

  const freqRaw = kv.get('FREQ');
  if (freqRaw !== 'DAILY' && freqRaw !== 'WEEKLY' && freqRaw !== 'MONTHLY') {
    throw new Error(`unsupported or missing FREQ: ${freqRaw ?? '(none)'}`);
  }

  const interval = kv.has('INTERVAL') ? Number(kv.get('INTERVAL')) : 1;
  if (!Number.isInteger(interval) || interval < 1) throw new Error(`invalid INTERVAL`);

  let byDay: WeekdayCode[] | undefined;
  if (kv.has('BYDAY')) {
    byDay = kv.get('BYDAY')!.split(',').map((d) => {
      if (!isWeekdayCode(d)) throw new Error(`invalid BYDAY token: ${d}`);
      return d;
    });
  }

  let byMonthDay: number[] | undefined;
  if (kv.has('BYMONTHDAY')) {
    byMonthDay = kv.get('BYMONTHDAY')!.split(',').map((n) => {
      const v = Number(n);
      if (!Number.isInteger(v) || v < 1 || v > 31) throw new Error(`invalid BYMONTHDAY: ${n}`);
      return v;
    });
  }

  const count = kv.has('COUNT') ? Number(kv.get('COUNT')) : undefined;
  if (count !== undefined && (!Number.isInteger(count) || count < 1)) throw new Error('invalid COUNT');

  let until: LocalDate | undefined;
  if (kv.has('UNTIL')) {
    const u = kv.get('UNTIL')!;
    const m = /^(\d{4})(\d{2})(\d{2})/.exec(u);
    if (!m) throw new Error(`invalid UNTIL: ${u}`);
    until = { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
  }

  return { freq: freqRaw, interval, byDay, byMonthDay, count, until };
}

/** True if `rrule` is a valid, supported rule. */
export function isValidRRule(rrule: string): boolean {
  try {
    parseRRule(rrule);
    return true;
  } catch {
    return false;
  }
}

export interface ExpandedOccurrence {
  /** Local calendar date of the occurrence (the matched recurrence date). */
  date: string;
  start: string; // UTC ISO
  end: string; // UTC ISO
}

/**
 * Expand a recurrence rule into concrete occurrences within [windowFrom, windowTo]
 * (inclusive local dates). COUNT/UNTIL are evaluated from dtStart regardless of window.
 */
export function expandOccurrences(
  rule: RecurrenceRule,
  windowFrom: string,
  windowTo: string,
): ExpandedOccurrence[] {
  const parsed = parseRRule(rule.rrule);
  const dtStart = parseLocalDate(rule.dtStart);
  const winFrom = parseLocalDate(windowFrom);
  const winTo = parseLocalDate(windowTo);
  const winFromN = dayNumber(winFrom);
  const winToN = dayNumber(winTo);
  const exSet = new Set((rule.exDates ?? []).map((d) => formatLocalDate(parseLocalDate(d))));

  const start = rule.startTimeLocal ? parseHHmm(rule.startTimeLocal) : { h: 0, min: 0 };
  const durationMin = computeDurationMin(rule);

  const out: ExpandedOccurrence[] = [];
  let emitted = 0; // counts toward COUNT (all matches from dtStart, even before window)

  const consider = (date: LocalDate): boolean => {
    // returns false to signal "stop the whole expansion" (COUNT/UNTIL exhausted)
    if (parsed.until && dayNumber(date) > dayNumber(parsed.until)) return false;
    if (parsed.count !== undefined && emitted >= parsed.count) return false;

    emitted += 1;
    const key = formatLocalDate(date);
    const n = dayNumber(date);
    if (n >= winFromN && n <= winToN && !exSet.has(key)) {
      const startMs = zonedLocalToUtcMs(date, start, rule.timezone);
      out.push({ date: key, start: toISO(startMs), end: toISO(startMs + durationMin * 60_000) });
    }
    return true;
  };

  let iterations = 0;
  if (parsed.freq === 'DAILY') {
    let cur = dtStart;
    while (iterations++ < MAX_ITERATIONS) {
      if (dayNumber(cur) > winToN && parsed.count === undefined) break;
      if (!consider(cur)) break;
      cur = addDays(cur, parsed.interval);
    }
  } else if (parsed.freq === 'WEEKLY') {
    const days = parsed.byDay ?? [weekday(dtStart)];
    // anchor to the Sunday of dtStart's week so INTERVAL steps whole weeks
    const dtStartDow = new Date(Date.UTC(dtStart.y, dtStart.m - 1, dtStart.d)).getUTCDay();
    let weekAnchor = addDays(dtStart, -dtStartDow);
    while (iterations++ < MAX_ITERATIONS) {
      let stop = false;
      for (const wd of days) {
        const offset = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'].indexOf(wd);
        const date = addDays(weekAnchor, offset);
        if (dayNumber(date) < dayNumber(dtStart)) continue; // before series start
        if (!consider(date)) {
          stop = true;
          break;
        }
      }
      if (stop) break;
      if (dayNumber(weekAnchor) > winToN && parsed.count === undefined) break;
      weekAnchor = addDays(weekAnchor, 7 * parsed.interval);
    }
  } else {
    // MONTHLY. Explicit BYMONTHDAY follows RFC "skip months without that day";
    // a day derived from dtStart clamps to month-end (friendlier for routines).
    const monthDays = parsed.byMonthDay ?? [dtStart.d];
    const clampToMonthEnd = parsed.byMonthDay === undefined;
    let cur: LocalDate = { y: dtStart.y, m: dtStart.m, d: 1 };
    while (iterations++ < MAX_ITERATIONS) {
      let stop = false;
      for (const md of monthDays) {
        const lastDay = new Date(Date.UTC(cur.y, cur.m, 0)).getUTCDate();
        if (md > lastDay && !clampToMonthEnd) continue; // RFC: skip e.g. day 31 in a 30-day month
        const day = Math.min(md, lastDay);
        const date: LocalDate = { y: cur.y, m: cur.m, d: day };
        if (dayNumber(date) < dayNumber(dtStart)) continue;
        if (!consider(date)) {
          stop = true;
          break;
        }
      }
      if (stop) break;
      if (dayNumber(cur) > winToN && parsed.count === undefined) break;
      cur = addMonths(cur, parsed.interval);
    }
  }

  out.sort((a, b) => a.start.localeCompare(b.start));
  return out;
}

function computeDurationMin(rule: RecurrenceRule): number {
  if (rule.startTimeLocal && rule.endTimeLocal) {
    const s = parseHHmm(rule.startTimeLocal);
    const e = parseHHmm(rule.endTimeLocal);
    const diff = e.h * 60 + e.min - (s.h * 60 + s.min);
    return diff > 0 ? diff : 60; // guard against inverted/zero ranges
  }
  return 60; // sane default for timed tasks without an explicit end
}
