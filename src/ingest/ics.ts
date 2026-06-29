/**
 * Deterministic .ics (iCalendar / RFC 5545) parser.
 *
 * Calendar files are STRUCTURED — no LLM needed. This parser turns VEVENTs into
 * the same canonical ExtractionResult shape the AI providers emit, so .ics
 * feeds the existing routine-creation pipeline unchanged. (Exposed to the
 * pipeline via IcsExtractionProvider, an AIProvider with no model.)
 *
 * MVP scope: SUMMARY, DTSTART, DTEND, RRULE. Times are read as local wall-clock
 * (the value the user sees); the space timezone is applied downstream. TZID/Z
 * normalization is a documented follow-up.
 */

import type { Category } from '../domain/types.ts';

export interface VEvent {
  summary?: string;
  dtStart?: string; // raw value
  dtEnd?: string; // raw value
  rrule?: string;
}

interface ParsedDateTime {
  date: string; // YYYY-MM-DD
  time?: string; // HH:mm
}

const CATEGORY_KEYWORDS: Array<[Category, string[]]> = [
  ['faith', ['pray', 'prayer', 'mass', 'service']],
  ['work', ['meeting', 'standup', 'stand-up', 'work', 'sync', '1:1', 'review', 'call', 'interview']],
  ['health', ['doctor', 'dentist', 'gym', 'workout', 'clinic', 'appointment']],
  ['family', ['school', 'pickup', 'drop', 'kids', 'parent', 'birthday']],
  ['social', ['dinner', 'lunch', 'party', 'coffee']],
];

/** Unfold folded lines (RFC 5545 §3.1) and split into logical lines. */
function unfold(ics: string): string[] {
  return ics.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
}

/** Parse one content line into { name, value } (params after ';' are ignored for MVP). */
function parseLine(line: string): { name: string; value: string } | null {
  const colon = line.indexOf(':');
  if (colon === -1) return null;
  const left = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const name = left.split(';')[0]!.toUpperCase();
  return { name, value };
}

export function parseIcs(ics: string): VEvent[] {
  const lines = unfold(ics);
  const events: VEvent[] = [];
  let current: VEvent | null = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (line === 'BEGIN:VEVENT') {
      current = {};
      continue;
    }
    if (line === 'END:VEVENT') {
      if (current) events.push(current);
      current = null;
      continue;
    }
    if (!current) continue;
    const parsed = parseLine(line);
    if (!parsed) continue;
    switch (parsed.name) {
      case 'SUMMARY':
        current.summary = parsed.value.trim();
        break;
      case 'DTSTART':
        current.dtStart = parsed.value.trim();
        break;
      case 'DTEND':
        current.dtEnd = parsed.value.trim();
        break;
      case 'RRULE':
        current.rrule = parsed.value.trim();
        break;
    }
  }
  return events;
}

function parseDateTime(value: string): ParsedDateTime | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?)?Z?$/.exec(value.trim());
  if (!m) return null;
  const date = `${m[1]}-${m[2]}-${m[3]}`;
  if (m[4] !== undefined) return { date, time: `${m[4]}:${m[5]}` };
  return { date }; // all-day (VALUE=DATE)
}

function classify(summary: string): Category {
  const lower = summary.toLowerCase();
  for (const [cat, words] of CATEGORY_KEYWORDS) {
    if (words.some((w) => lower.includes(w))) return cat;
  }
  return 'other';
}

/** Convert .ics text into the canonical ExtractionResult shape (raw object). */
export function icsToExtractionResult(ics: string): unknown {
  const events = parseIcs(ics);
  const items: unknown[] = [];
  const ambiguities: unknown[] = [];
  const warnings: string[] = [];

  events.forEach((ev, i) => {
    const tempId = `ics${i + 1}`;
    const title = ev.summary?.trim() || 'Event';
    if (!ev.dtStart) {
      warnings.push(`event "${title}" has no start time — skipped`);
      return;
    }
    const start = parseDateTime(ev.dtStart);
    if (!start) {
      warnings.push(`event "${title}" has an unparseable DTSTART — skipped`);
      return;
    }
    const end = ev.dtEnd ? parseDateTime(ev.dtEnd) : null;

    const item: Record<string, unknown> = {
      tempId,
      title,
      type: 'fixed', // calendar events are commitments
      category: classify(title),
      confidence: 0.95, // structured source: deterministic, high confidence
      dtStart: start.date,
      sourceSpan: title,
    };
    if (start.time) item.startTimeLocal = start.time;
    if (end?.time && end.date === start.date) item.endTimeLocal = end.time;
    if (ev.rrule) item.rrule = ev.rrule; // validated downstream by the engine
    if (!start.time) warnings.push(`event "${title}" is all-day; no time set`);

    items.push(item);
  });

  if (!items.length && !warnings.length) warnings.push('no VEVENTs found in .ics input');
  return { items, ambiguities, warnings };
}
