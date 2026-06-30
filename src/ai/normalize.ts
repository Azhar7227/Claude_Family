/**
 * Deterministic extraction normalization — the layer that makes LifeFlow think
 * like a PLANNER instead of copying sentences. Runs on EVERY provider's output
 * (stub or frontier model) so capture quality does not depend on one model's
 * phrasing. The model proposes; this canonicalizes (engine owns logic, LLM owns
 * language).
 *
 * Responsibilities:
 *   1. Title canonicalization — strip directives ("I need to…"), schedule noise
 *      ("four times", "every evening", "at 6pm"), and fluff ("is important").
 *   2. Profile / goal rescue — move "I'm a Business Analyst" / "lose 15 kg" out
 *      of items so they never become tasks.
 *   3. Domain lexicon — Jumu'ah, the five prayers, sleep, family time, gym, etc.
 *   4. Type correction — quality-time/gym/study are flexible; prayer/appointments fixed.
 *   5. Time-of-day bands -> approximate clock times; frequency counts -> RRULE.
 */

import type { Category, TaskType } from '../domain/types.ts';
import { isValidRRule } from '../engine/recurrence.ts';
import type { ExtractedItem, ExtractionResult, Frequency, Goal, ProfileFact, TimeOfDay } from './types.ts';

const NUM_WORDS: Record<string, number> = {
  once: 1, one: 1, twice: 2, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
};

const TIME_OF_DAY_DEFAULT: Record<TimeOfDay, string> = {
  early_morning: '06:00', morning: '08:00', midday: '12:30', afternoon: '15:00', evening: '19:00', night: '21:00',
};

interface LexEntry {
  re: RegExp;
  title: string;
  category: Category;
  type: TaskType;
  protected?: boolean;
  rrule?: string;
  timeOfDay?: TimeOfDay;
  note?: string;
  ambiguousTime?: boolean; // exact clock time is location-dependent
}

// Domain ontology. First match wins. Patterns test the raw source span (or title).
const LEXICON: LexEntry[] = [
  { re: /\b(jumu'?ah|jum[au]'?a|friday\s+prayer|jumma)\b/i, title: "Jumu'ah", category: 'faith', type: 'fixed', protected: true, rrule: 'FREQ=WEEKLY;BYDAY=FR', timeOfDay: 'midday', ambiguousTime: true, note: 'Weekly Friday congregational prayer — set your local time.' },
  { re: /\bfajr\b/i, title: 'Fajr prayer', category: 'faith', type: 'fixed', protected: true, rrule: 'FREQ=DAILY', timeOfDay: 'early_morning', ambiguousTime: true },
  { re: /\b(dhuhr|zuhr|duhr)\b/i, title: 'Dhuhr prayer', category: 'faith', type: 'fixed', protected: true, rrule: 'FREQ=DAILY', timeOfDay: 'midday', ambiguousTime: true },
  { re: /\basr\b/i, title: 'Asr prayer', category: 'faith', type: 'fixed', protected: true, rrule: 'FREQ=DAILY', timeOfDay: 'afternoon', ambiguousTime: true },
  { re: /\bmaghrib\b/i, title: 'Maghrib prayer', category: 'faith', type: 'fixed', protected: true, rrule: 'FREQ=DAILY', timeOfDay: 'evening', ambiguousTime: true },
  { re: /\bisha\b/i, title: 'Isha prayer', category: 'faith', type: 'fixed', protected: true, rrule: 'FREQ=DAILY', timeOfDay: 'night', ambiguousTime: true },
  { re: /\b(qur'?an|quran|koran)\b/i, title: 'Quran reading', category: 'faith', type: 'flexible' },
  { re: /\b(pray|prayer|namaz|salah|salat)\b/i, title: 'Prayer', category: 'faith', type: 'fixed', protected: true },
  { re: /\b(meditat)/i, title: 'Meditation', category: 'health', type: 'flexible' },
  { re: /\b(time\s+with|spend\s+time\s+with|play\s+with).*(kid|child|family|son|daughter)/i, title: 'Time with kids', category: 'family', type: 'flexible' },
  { re: /\b(family\s+dinner|dinner\s+with\s+(the\s+)?family)\b/i, title: 'Family dinner', category: 'family', type: 'fixed', protected: true },
  { re: /\b(gym|workout|work\s*out|lift|exercise)\b/i, title: 'Gym', category: 'health', type: 'flexible' },
  { re: /\b(sleep|bed\s*time|go\s+to\s+bed)\b/i, title: 'Sleep', category: 'health', type: 'fixed', protected: true },
  { re: /\b(walk|jog|run|cardio)\b/i, title: 'Walk', category: 'health', type: 'flexible' },
];

const FLEXIBLE_HINT = /\b(gym|workout|exercise|study|read|reading|walk|jog|run|learn|practice|meditat|time with|hobby|side\s*hustle)\b/i;
const FIXED_HINT = /\b(meeting|appointment|doctor|dentist|flight|class|lecture|school|pickup|drop\s*off|prayer|interview|call with|standup)\b/i;

const PROFILE_PATTERNS: Array<{ re: RegExp; kind: ProfileFact['kind'] }> = [
  { re: /^\s*i'?m\s+(?:a|an)\s+(.+?)[.!]?$/i, kind: 'role' },
  { re: /^\s*i\s+am\s+(?:a|an)\s+(.+?)[.!]?$/i, kind: 'role' },
  { re: /\bi\s+work\s+(?:as|in|at)\s+(.+?)[.!]?$/i, kind: 'work' },
  { re: /\bi\s+have\s+((?:a|an|one|two|three|\d+)\s+(?:kid|kids|child|children|son|daughter|baby))/i, kind: 'family' },
  { re: /^\s*i\s+live\s+in\s+(.+?)[.!]?$/i, kind: 'location' },
];

const GOAL_PATTERNS: RegExp[] = [
  /\b(lose|gain)\s+\d+\s*(kg|kgs|kilos?|pounds?|lbs?)\b/i,
  /\bbecome\s+(?:a|an)\s+.+/i,
  /\b(launch|build|start)\s+(?:a|an|my)\s+.+/i,
  /\b(get|run)\s+(?:a|my)?\s*(?:promotion|marathon|startup)\b/i,
];

/** Strip leading filler / schedule noise / fluff and Title-case the core noun phrase. */
export function canonicalTitle(raw: string): string {
  let t = (raw || '').trim();
  t = t.replace(/^(?:i\s+)?(?:really\s+|just\s+)?(?:need(?:\s+to)?|want(?:\s+to)?|have\s+to|gotta|got\s+to|would\s+like\s+to|like\s+to|wish\s+to|remember(?:\s+to)?|remind\s+me\s+to|please|let\s+me|i\s+should|i\s+must|i\s+will|i'?ll|do)\s+/i, '');
  // schedule noise
  t = t.replace(/\b(?:every\s+(?:single\s+)?(?:day|morning|afternoon|evening|night|week|month|other\s+day)|each\s+(?:day|morning|afternoon|evening|night)|everyday|daily|weekly|monthly|fortnightly|twice\s+a\s+\w+|once\s+a\s+\w+|(?:\d+|once|twice|one|two|three|four|five|six|seven)\s+times?(?:\s+(?:a|per)\s+\w+)?)\b/gi, '');
  t = t.replace(/\b(?:at|from|by|around|before|after)\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?(?:\s*(?:to|-|–|until)\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)?)?/gi, '');
  t = t.replace(/\b(?:for\s+)?(?:\d+|one|two|three|four|half(?:\s+an)?)\s*(?:hour|hours|hr|hrs|min|mins|minute|minutes)\b/gi, '');
  t = t.replace(/\b(?:in\s+the\s+)?(?:early\s+morning|morning|afternoon|evening|night|midday|noon)\b/gi, '');
  t = t.replace(/\bafter\s+(?:work|breakfast|lunch|dinner)\b/gi, '');
  t = t.replace(/\s+(?:is\s+(?:important|a\s+must|essential|critical)|matters|is\s+key)\b.*$/i, '');
  t = t.replace(/\bmy\b/gi, ' ');
  t = t.replace(/[.,;!]+$/g, '').replace(/\s{2,}/g, ' ').trim();
  if (!t) return '';
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function detectProfile(span: string): ProfileFact | null {
  for (const p of PROFILE_PATTERNS) {
    const m = p.re.exec(span);
    if (m) {
      const value = (m[1] ?? span).trim().replace(/\s{2,}/g, ' ');
      return { kind: p.kind, value: value.charAt(0).toUpperCase() + value.slice(1), sourceSpan: span };
    }
  }
  return null;
}

function looksLikeGoal(span: string): boolean {
  return GOAL_PATTERNS.some((re) => re.test(span));
}

const BAND_PATTERNS: Array<[RegExp, TimeOfDay]> = [
  [/\b(early\s+morning|dawn|sunrise)\b/i, 'early_morning'],
  [/\b(morning)\b/i, 'morning'],
  [/\b(noon|midday|lunch\s*time)\b/i, 'midday'],
  [/\b(afternoon)\b/i, 'afternoon'],
  [/\b(evening|after\s+work|after\s+dinner|dinner\s*time)\b/i, 'evening'],
  [/\b(night|tonight|before\s+bed|bed\s*time)\b/i, 'night'],
];

function detectTimeOfDay(span: string): TimeOfDay | undefined {
  for (const [re, band] of BAND_PATTERNS) if (re.test(span)) return band;
  return undefined;
}

function parseFrequency(span: string): Frequency | undefined {
  const m = /\b(\d+|once|twice|one|two|three|four|five|six|seven)\s+times?(?:\s+(?:a|per)\s+(day|week|month))?\b/i.exec(span)
    ?? /\b(once|twice)(?:\s+(?:a|per)\s+(day|week|month))?\b/i.exec(span);
  if (!m) return undefined;
  const count = NUM_WORDS[m[1]!.toLowerCase()] ?? Number(m[1]);
  if (!count || count < 1) return undefined;
  const unit = (m[2]?.toLowerCase() as Frequency['unit']) ?? 'week';
  return { unit, count };
}

/** Spread N weekly occurrences across sensible days. */
export function spreadWeekdays(n: number): string {
  const dist: Record<number, string[]> = {
    1: ['MO'], 2: ['MO', 'TH'], 3: ['MO', 'WE', 'FR'], 4: ['MO', 'TU', 'TH', 'SA'],
    5: ['MO', 'TU', 'WE', 'TH', 'FR'], 6: ['MO', 'TU', 'WE', 'TH', 'FR', 'SA'],
  };
  if (n >= 7) return 'FREQ=DAILY';
  return `FREQ=WEEKLY;BYDAY=${(dist[n] ?? ['MO']).join(',')}`;
}

function applyLexicon(item: ExtractedItem, span: string): { entry?: LexEntry } {
  for (const e of LEXICON) {
    if (e.re.test(span) || e.re.test(item.title)) {
      item.title = e.title;
      item.category = e.category;
      item.type = e.type;
      if (e.protected) item.protected = true;
      if (e.rrule && !item.rrule) item.rrule = e.rrule;
      if (e.timeOfDay && !item.startTimeLocal && !item.timeOfDay) item.timeOfDay = e.timeOfDay;
      if (e.note) item.notes = item.notes ? `${item.notes} ${e.note}` : e.note;
      return { entry: e };
    }
  }
  return {};
}

function correctType(item: ExtractedItem): void {
  const span = `${item.title} ${item.sourceSpan ?? ''}`;
  if (FLEXIBLE_HINT.test(span) && !FIXED_HINT.test(span)) item.type = 'flexible';
  else if (FIXED_HINT.test(span)) item.type = 'fixed';
}

export interface NormalizeOptions {
  /** Override default band -> clock-time mapping. */
  timeOfDayDefaults?: Record<TimeOfDay, string>;
}

/** Canonicalize a raw ExtractionResult from any provider. Pure. */
export function normalizeExtraction(result: ExtractionResult, opts: NormalizeOptions = {}): ExtractionResult {
  const bands = opts.timeOfDayDefaults ?? TIME_OF_DAY_DEFAULT;
  const profile: ProfileFact[] = [...(result.profile ?? [])];
  const goals: Goal[] = [...(result.goals ?? [])];
  const ambiguities = [...(result.ambiguities ?? [])];
  const warnings = [...(result.warnings ?? [])];
  const items: ExtractedItem[] = [];

  for (const original of result.items ?? []) {
    const span = original.sourceSpan ?? original.title;

    // 1. profile / goal rescue — never let these become tasks
    const fact = detectProfile(span);
    if (fact) {
      profile.push(fact);
      continue;
    }
    if (looksLikeGoal(span) && !LEXICON.some((e) => e.re.test(span))) {
      goals.push({ title: canonicalTitle(span) || span, sourceSpan: span });
      continue;
    }

    const item: ExtractedItem = { ...original };

    // 2. domain lexicon (sets title/category/type/protected/rrule/band)
    const { entry } = applyLexicon(item, span);

    // 3. title canonicalization (unless the lexicon already set a canonical title)
    if (!entry) {
      const cleaned = canonicalTitle(item.title);
      if (cleaned) item.title = cleaned;
    }

    // 4. frequency -> recurrence (only if no explicit rrule)
    if (!item.frequency) item.frequency = parseFrequency(span);
    if (item.frequency && !item.rrule) {
      if (item.frequency.unit === 'week') item.rrule = spreadWeekdays(item.frequency.count);
      else if (item.frequency.unit === 'month') item.rrule = 'FREQ=MONTHLY';
      else if (item.frequency.unit === 'day' && item.frequency.count >= 1) item.rrule = 'FREQ=DAILY';
      if (item.frequency.unit === 'week' && item.frequency.count < 7) {
        item.notes = appendNote(item.notes, 'Suggested days — adjust freely.');
      }
    }

    // 5. time-of-day band -> approximate clock time (so it lands on the timeline)
    if (!item.startTimeLocal && !item.timeOfDay) item.timeOfDay = detectTimeOfDay(span);
    if (!item.startTimeLocal && item.timeOfDay) {
      item.startTimeLocal = bands[item.timeOfDay];
      item.notes = appendNote(item.notes, `Approximate ${item.timeOfDay.replace('_', ' ')} time — adjust if needed.`);
    }

    // 6. type correction (quality-time/gym flexible; appointments fixed) unless lexicon fixed it
    if (!entry) correctType(item);

    // 7. invalid rrule guard (engine is authority)
    if (item.rrule && !isValidRRule(item.rrule)) {
      warnings.push(`dropped invalid rrule "${item.rrule}" for "${item.title}"`);
      delete item.rrule;
    }

    // 8. ambiguous-time domain items: ask instead of inventing an exact clock time
    if (entry?.ambiguousTime && !hasExplicitTime(original)) {
      ambiguities.push({ tempId: item.tempId, field: 'startTimeLocal', question: `What time is ${item.title}? (location-dependent)` });
    }

    if (!item.title) item.title = capitalize(item.category);
    items.push(item);
  }

  return { profile: dedupeProfile(profile), items, goals, ambiguities, warnings };
}

function hasExplicitTime(item: ExtractedItem): boolean {
  return Boolean(item.startTimeLocal);
}
function appendNote(existing: string | undefined, note: string): string {
  return existing ? `${existing} ${note}` : note;
}
function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function dedupeProfile(facts: ProfileFact[]): ProfileFact[] {
  const seen = new Set<string>();
  return facts.filter((f) => {
    const k = `${f.kind}|${f.value.toLowerCase()}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
