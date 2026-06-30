/**
 * Proves the extraction now thinks like a planner, not a sentence-copier.
 * Each test maps to a real failure from the bug report.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalTitle, normalizeExtraction, spreadWeekdays } from './normalize.ts';
import type { ExtractedItem, ExtractionResult } from './types.ts';

function res(items: Partial<ExtractedItem>[], extra: Partial<ExtractionResult> = {}): ExtractionResult {
  return {
    profile: extra.profile ?? [],
    goals: extra.goals ?? [],
    ambiguities: extra.ambiguities ?? [],
    warnings: extra.warnings ?? [],
    items: items.map((p, i) => ({ tempId: `t${i}`, title: p.title ?? '', type: p.type ?? 'flexible', category: p.category ?? 'other', confidence: p.confidence ?? 0.8, ...p })),
  };
}
const only = (r: ExtractionResult) => r.items[0];

test('canonicalTitle strips directives, schedule noise, and fluff', () => {
  assert.equal(canonicalTitle('Need gym four times'), 'Gym');
  assert.equal(canonicalTitle('I need to read 30 minutes daily'), 'Read');
  assert.equal(canonicalTitle('study salesforce at 8pm every day'), 'Study salesforce');
  assert.equal(canonicalTitle('Friday prayer is important'), 'Friday prayer');
});

test('BUG: "I\'m a Business Analyst" becomes profile, not a task', () => {
  const r = normalizeExtraction(res([{ title: "I'm a Business Analyst", sourceSpan: "I'm a Business Analyst" }]));
  assert.equal(r.items.length, 0);
  assert.equal(r.profile.length, 1);
  assert.equal(r.profile[0]!.kind, 'role');
  assert.equal(r.profile[0]!.value, 'Business Analyst');
});

test('BUG: "Need gym four times" -> title "Gym" + weekly frequency', () => {
  const r = normalizeExtraction(res([{ title: 'Need gym four times', sourceSpan: 'Need gym four times' }]));
  const item = only(r)!;
  assert.equal(item.title, 'Gym');
  assert.equal(item.category, 'health');
  assert.equal(item.type, 'flexible');
  assert.deepEqual(item.frequency, { unit: 'week', count: 4 });
  assert.equal(item.rrule, 'FREQ=WEEKLY;BYDAY=MO,TU,TH,SA');
});

test('BUG: "Need Quran reading" -> title "Quran reading", faith', () => {
  const r = normalizeExtraction(res([{ title: 'Need Quran reading', sourceSpan: 'Need Quran reading' }]));
  const item = only(r)!;
  assert.equal(item.title, 'Quran reading');
  assert.equal(item.category, 'faith');
});

test('BUG: "Spend time with my kids every evening" -> flexible, evening time, family', () => {
  const r = normalizeExtraction(res([{ title: 'Spend time with my kids every evening', type: 'fixed', sourceSpan: 'Spend time with my kids every evening' }]));
  const item = only(r)!;
  assert.equal(item.type, 'flexible'); // corrected from the model's wrong "fixed"
  assert.equal(item.category, 'family');
  assert.equal(item.title, 'Time with kids');
  assert.equal(item.startTimeLocal, '19:00'); // evening band resolved
});

test('BUG: "Friday prayer is important" -> protected weekly Jumu\'ah', () => {
  const r = normalizeExtraction(res([{ title: 'Friday prayer is important', sourceSpan: 'Friday prayer is important' }]));
  const item = only(r)!;
  assert.equal(item.title, "Jumu'ah");
  assert.equal(item.category, 'faith');
  assert.equal(item.type, 'fixed');
  assert.equal(item.protected, true);
  assert.equal(item.rrule, 'FREQ=WEEKLY;BYDAY=FR');
  // exact time is location-dependent -> asked, not invented
  assert.ok(r.ambiguities.some((a) => a.tempId === item.tempId && a.field === 'startTimeLocal'));
});

test('goals are rescued from items', () => {
  const r = normalizeExtraction(res([{ title: 'lose 15 kg', sourceSpan: 'I want to lose 15 kg' }]));
  assert.equal(r.items.length, 0);
  assert.equal(r.goals.length, 1);
});

test('the five daily prayers are protected faith routines', () => {
  for (const p of ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha']) {
    const r = normalizeExtraction(res([{ title: p, sourceSpan: p }]));
    const item = only(r)!;
    assert.equal(item.category, 'faith');
    assert.equal(item.protected, true);
    assert.equal(item.rrule, 'FREQ=DAILY');
  }
});

test('spreadWeekdays distributes counts sensibly', () => {
  assert.equal(spreadWeekdays(3), 'FREQ=WEEKLY;BYDAY=MO,WE,FR');
  assert.equal(spreadWeekdays(7), 'FREQ=DAILY');
});

test('explicit clock time is preserved over a band default', () => {
  const r = normalizeExtraction(res([{ title: 'Gym', startTimeLocal: '06:00', timeOfDay: 'evening', sourceSpan: 'gym at 6am' }]));
  assert.equal(only(r)!.startTimeLocal, '06:00');
});
