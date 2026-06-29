/**
 * DeterministicStubProvider — a real AIProvider implementation that uses simple
 * deterministic heuristics instead of a model. It exists so the ENTIRE pipeline
 * (capture -> extract -> validate -> proposal -> accept -> commit) is testable
 * and demoable in CI with zero network and zero tokens.
 *
 * It is NOT trying to be good NLP. It is trying to be *predictable* and produce
 * realistically-shaped ExtractionResults. Swapping in Gemini/Claude/OpenAI later
 * changes only this class — never the pipeline.
 */

import type { Category, TaskType } from '../domain/types.ts';
import type { AIProvider, Capability, StructuredRequest, StructuredResult } from './provider.ts';

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, half: 0.5,
};

interface CategoryRule {
  category: Category;
  type: TaskType;
  words: string[];
}

// Order matters: first match wins.
const CATEGORY_RULES: CategoryRule[] = [
  { category: 'faith', type: 'fixed', words: ['pray', 'prayer', 'namaz', 'salah', 'meditate', 'meditation'] },
  { category: 'work', type: 'fixed', words: ['work', 'office', 'meeting', 'standup', 'stand-up', 'shift', 'job'] },
  { category: 'health', type: 'flexible', words: ['gym', 'workout', 'exercise', 'run', 'walk', 'yoga', 'water', 'medicine', 'medication', 'protein', 'supplement'] },
  { category: 'learning', type: 'flexible', words: ['study', 'learn', 'read', 'reading', 'course', 'practice', 'revise'] },
  { category: 'family', type: 'fixed', words: ['school', 'pickup', 'drop', 'kids', 'child', 'children', 'family', 'milk', 'homework'] },
  { category: 'chore', type: 'flexible', words: ['clean', 'laundry', 'cook', 'groceries', 'chore', 'dishes'] },
  { category: 'social', type: 'fixed', words: ['call', 'dinner', 'lunch with', 'meet ', 'appointment', 'doctor', 'flight'] },
];

export class DeterministicStubProvider implements AIProvider {
  readonly name = 'stub';
  readonly capabilities: ReadonlySet<Capability> = new Set<Capability>(['structured_output', 'ocr', 'vision']);

  async generateStructured(req: StructuredRequest): Promise<StructuredResult> {
    const text = req.input
      .filter((p) => p.kind === 'text' && p.text)
      .map((p) => p.text!)
      .join('\n')
      // for image/audio parts, the stub treats any provided OCR text the same way
      .concat(req.input.filter((p) => p.kind !== 'text').map(() => '').join(''));

    const raw = parseToExtraction(text);
    return {
      raw,
      meta: {
        provider: this.name,
        model: 'deterministic-stub-v1',
        promptVersion: req.promptVersion,
        tokensIn: 0,
        tokensOut: 0,
        finishReason: 'stop',
      },
    };
  }
}

/** Split free text into candidate task clauses. */
function splitClauses(text: string): string[] {
  return text
    .split(/\n|(?:,\s*and\s+)|(?:\.\s+)|;|(?:\s+and\s+)|,/i)
    .map((c) => c.trim())
    .filter((c) => c.length > 1);
}

function parseToExtraction(text: string): unknown {
  const clauses = splitClauses(text);
  const items: unknown[] = [];
  const ambiguities: unknown[] = [];
  const warnings: string[] = [];

  clauses.forEach((clause, i) => {
    const lower = clause.toLowerCase();
    const tempId = `s${i + 1}`;

    const { category, type } = classify(lower);
    const times = parseTimes(lower);
    const rrule = parseRecurrence(lower);
    const durationMin = parseDuration(lower);

    let confidence = 0.5;
    if (times.length) confidence += 0.2;
    if (rrule) confidence += 0.2;
    confidence = Math.min(0.95, confidence);

    const item: Record<string, unknown> = {
      tempId,
      title: titleCase(stripDirectives(clause)),
      type,
      category,
      confidence,
      sourceSpan: clause,
    };
    if (times[0]) item.startTimeLocal = times[0];
    if (times[1]) item.endTimeLocal = times[1];
    if (durationMin) item.durationMin = durationMin;
    if (rrule) item.rrule = rrule;

    if (times.length > 2) {
      // multiple times in one clause (e.g. prayers) — surface rather than guess
      ambiguities.push({
        tempId,
        field: 'startTimeLocal',
        question: `"${item.title}" mentions multiple times (${times.join(', ')}). Create one per time?`,
        options: times,
      });
    }

    items.push(item);
  });

  if (!items.length) warnings.push('no schedulable items found in input');
  return { items, ambiguities, warnings };
}

function classify(lower: string): { category: Category; type: TaskType } {
  for (const rule of CATEGORY_RULES) {
    if (rule.words.some((w) => lower.includes(w))) return { category: rule.category, type: rule.type };
  }
  return { category: 'other', type: 'flexible' };
}

/** Parse times like "5", "5pm", "5:10", "9 to 6", "9am-6pm". Returns ["HH:mm", ...]. */
function parseTimes(lower: string): string[] {
  const out: string[] = [];
  const re = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/g;
  let m: RegExpExecArray | null;
  const meridiemHint = /pm/.test(lower);
  while ((m = re.exec(lower)) !== null) {
    // skip standalone numbers that are clearly durations ("1 hour", "2 hours")
    const after = lower.slice(re.lastIndex).trimStart();
    if (/^(hour|hours|hr|hrs|min|mins|minute|minutes|kg|km|times?)/.test(after)) continue;
    let h = Number(m[1]);
    const min = m[2] ? Number(m[2]) : 0;
    const mer = m[3];
    if (h > 23 || min > 59) continue;
    if (mer === 'pm' && h < 12) h += 12;
    if (mer === 'am' && h === 12) h = 0;
    // heuristic: bare hour with a pm context and small value -> afternoon
    if (!mer && meridiemHint && h <= 7) h += 12;
    out.push(`${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`);
  }
  return out;
}

function parseRecurrence(lower: string): string | undefined {
  if (/\bmon(day)?\s*(-|to|–|—)\s*fri(day)?\b/.test(lower) || /\bweekdays?\b/.test(lower)) {
    return 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR';
  }
  if (/\b(every day|each day|daily|everyday)\b/.test(lower)) return 'FREQ=DAILY';
  if (/\b(every week|weekly)\b/.test(lower)) return 'FREQ=WEEKLY';
  if (/\b(every month|monthly)\b/.test(lower)) return 'FREQ=MONTHLY';
  // explicit weekday
  const days: Array<[RegExp, string]> = [
    [/\bmondays?\b/, 'MO'], [/\btuesdays?\b/, 'TU'], [/\bwednesdays?\b/, 'WE'],
    [/\bthursdays?\b/, 'TH'], [/\bfridays?\b/, 'FR'], [/\bsaturdays?\b/, 'SA'], [/\bsundays?\b/, 'SU'],
  ];
  const matched = days.filter(([re]) => re.test(lower)).map(([, code]) => code);
  if (matched.length) return `FREQ=WEEKLY;BYDAY=${matched.join(',')}`;
  return undefined;
}

function parseDuration(lower: string): number | undefined {
  const m = /\b(\d+|one|two|three|four|five|half)\s*(hour|hours|hr|hrs|min|mins|minute|minutes)\b/.exec(lower);
  if (!m) return undefined;
  const qty = NUMBER_WORDS[m[1]!] ?? Number(m[1]);
  const unit = m[2]!;
  if (/min/.test(unit)) return Math.round(qty);
  return Math.round(qty * 60);
}

function stripDirectives(clause: string): string {
  return clause
    .replace(/^\s*(remind me to|i want to|i need to|please|i will|i)\s+/i, '')
    .replace(/\b(every day|each day|daily|everyday|weekly|monthly|weekdays?)\b/gi, '')
    .replace(/\b(at|from)\s+\d.*$/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function titleCase(s: string): string {
  const t = s.trim();
  if (!t) return 'Untitled';
  return t.charAt(0).toUpperCase() + t.slice(1);
}
