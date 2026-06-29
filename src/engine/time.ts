/**
 * Timezone-aware local<->UTC helpers, dependency-free (uses Intl).
 *
 * The engine reasons about local calendar dates + wall-clock times, then
 * materializes UTC instants for storage. We deliberately avoid a tz library:
 * Intl.DateTimeFormat already ships the IANA database in Node.
 */

export interface LocalDate {
  y: number;
  m: number; // 1-12
  d: number; // 1-31
}

const WEEKDAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const;
export type WeekdayCode = (typeof WEEKDAY_CODES)[number];

export function parseLocalDate(iso: string): LocalDate {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) throw new Error(`invalid local date: ${iso}`);
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

export function formatLocalDate(d: LocalDate): string {
  const mm = String(d.m).padStart(2, '0');
  const dd = String(d.d).padStart(2, '0');
  return `${d.y}-${mm}-${dd}`;
}

/** Days since an arbitrary epoch — for stable date arithmetic & comparison. */
export function dayNumber(d: LocalDate): number {
  return Math.floor(Date.UTC(d.y, d.m - 1, d.d) / 86_400_000);
}

export function addDays(d: LocalDate, n: number): LocalDate {
  const t = Date.UTC(d.y, d.m - 1, d.d) + n * 86_400_000;
  const dt = new Date(t);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

export function addMonths(d: LocalDate, n: number): LocalDate {
  const total = (d.y * 12 + (d.m - 1)) + n;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  // clamp day to the month's length (e.g. Jan 31 +1mo -> Feb 28/29)
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { y, m, d: Math.min(d.d, lastDay) };
}

/** Weekday code for a local calendar date (tz-independent). */
export function weekday(d: LocalDate): WeekdayCode {
  const dow = new Date(Date.UTC(d.y, d.m - 1, d.d)).getUTCDay();
  return WEEKDAY_CODES[dow]!;
}

export function isWeekdayCode(s: string): s is WeekdayCode {
  return (WEEKDAY_CODES as readonly string[]).includes(s);
}

/** Offset (minutes) such that localTime = utcTime + offset, for an instant in tz. */
function tzOffsetMinutes(tz: string, utcMs: number): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = dtf.formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  let hour = get('hour');
  if (hour === 24) hour = 0; // some ICU builds emit 24 for midnight
  const asIfUtc = Date.UTC(get('year'), get('month') - 1, get('day'), hour, get('minute'), get('second'));
  return Math.round((asIfUtc - utcMs) / 60_000);
}

/**
 * Convert a local wall-clock datetime in `tz` to a UTC instant (ms).
 * Handles DST by refining the offset estimate once.
 */
export function zonedLocalToUtcMs(date: LocalDate, time: { h: number; min: number }, tz: string): number {
  const guess = Date.UTC(date.y, date.m - 1, date.d, time.h, time.min);
  const off1 = tzOffsetMinutes(tz, guess);
  let utc = guess - off1 * 60_000;
  const off2 = tzOffsetMinutes(tz, utc);
  if (off2 !== off1) utc = guess - off2 * 60_000;
  return utc;
}

export function parseHHmm(s: string): { h: number; min: number } {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) throw new Error(`invalid HH:mm: ${s}`);
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) throw new Error(`out-of-range HH:mm: ${s}`);
  return { h, min };
}

export function toISO(utcMs: number): string {
  return new Date(utcMs).toISOString();
}
