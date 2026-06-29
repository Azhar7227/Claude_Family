/**
 * Self-test for the benchmark scorer. A benchmark is only as trustworthy as its
 * metrics — these tests pin down F1, field accuracy, validation handling, and
 * calibration (ECE / gap) against hand-computed expectations, so the numbers in
 * report.md mean what they claim.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregate, classifyRecurrence, scoreCase } from './score.ts';
import type { BenchCase } from './dataset.ts';
import type { ExtractedItem } from '../src/ai/types.ts';

function item(p: Partial<ExtractedItem> & Pick<ExtractedItem, 'title'>): ExtractedItem {
  return { tempId: 't', type: 'flexible', category: 'other', confidence: 0.9, ...p };
}

test('classifyRecurrence maps rrules to coarse classes', () => {
  assert.equal(classifyRecurrence(undefined), 'once');
  assert.equal(classifyRecurrence('FREQ=DAILY'), 'daily');
  assert.equal(classifyRecurrence('FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR'), 'weekdays');
  assert.equal(classifyRecurrence('FREQ=WEEKLY;BYDAY=MO'), 'weekly');
  assert.equal(classifyRecurrence('FREQ=MONTHLY'), 'monthly');
});

test('scoreCase: a perfect match scores all fields', () => {
  const cse: BenchCase = { id: 'x', input: '', expect: [{ kw: 'gym', type: 'flexible', cat: 'health', rec: 'daily', time: '18:00' }] };
  const s = scoreCase(cse, [item({ title: 'Gym', type: 'flexible', category: 'health', rrule: 'FREQ=DAILY', startTimeLocal: '18:00' })]);
  assert.equal(s.matchedExpected, 1);
  assert.equal(s.fieldHits, 4);
  assert.equal(s.fieldTotal, 4);
  assert.equal(s.items[0]!.matched, true);
});

test('scoreCase: wrong fields count against field accuracy but item still matches', () => {
  const cse: BenchCase = { id: 'x', input: '', expect: [{ kw: 'gym', type: 'fixed', rec: 'daily', time: '18:00' }] };
  const s = scoreCase(cse, [item({ title: 'Gym', type: 'flexible', startTimeLocal: '09:00' })]);
  assert.equal(s.matchedExpected, 1);
  assert.equal(s.fieldHits, 0); // type wrong, rec wrong (no rrule->once), time wrong
  assert.equal(s.fieldTotal, 3);
});

test('scoreCase: an unmatched expectation still charges its fields', () => {
  const cse: BenchCase = { id: 'x', input: '', expect: [{ kw: 'yoga', type: 'flexible', time: '07:00' }] };
  const s = scoreCase(cse, [item({ title: 'Gym' })]);
  assert.equal(s.matchedExpected, 0);
  assert.equal(s.fieldTotal, 2); // type + time charged, 0 hits
  assert.equal(s.items[0]!.matched, false); // the extra extracted item hurts precision
});

test('aggregate: recall / precision / f1 computed correctly', () => {
  // case A: 1 expected, 1 extracted, matched -> P=R=1
  // case B: 1 expected, 2 extracted, 1 matched -> recall 1, precision 0.5
  const a = scoreCase({ id: 'a', input: '', expect: [{ kw: 'gym' }] }, [item({ title: 'Gym' })]);
  const b = scoreCase({ id: 'b', input: '', expect: [{ kw: 'read' }] }, [item({ title: 'Read' }), item({ title: 'Noise' })]);
  const agg = aggregate([a, b], 0);
  assert.equal(agg.recall, 1); // 2/2 expected matched
  assert.equal(agg.precision, 2 / 3); // 2 matched of 3 extracted
  assert.ok(Math.abs(agg.f1 - (2 * (2 / 3) * 1) / (2 / 3 + 1)) < 1e-9);
});

test('aggregate: ECE and calibration gap reflect over/under-confidence', () => {
  // all items confidence 0.9; half matched -> precision 0.5, overconfident
  const matched = scoreCase({ id: 'm', input: '', expect: [{ kw: 'gym' }] }, [item({ title: 'Gym', confidence: 0.9 })]);
  const missed = scoreCase({ id: 'n', input: '', expect: [{ kw: 'zzz' }] }, [item({ title: 'Other', confidence: 0.9 })]);
  const agg = aggregate([matched, missed], 0);
  assert.equal(agg.precision, 0.5);
  assert.ok(Math.abs(agg.meanConfidence - 0.9) < 1e-9);
  assert.ok(agg.calibrationGap > 0); // overconfident (0.9 vs 0.5)
  assert.ok(Math.abs(agg.ece - 0.4) < 1e-9); // single bin: |0.5 acc - 0.9 conf|
});

test('aggregate: validation failures are surfaced', () => {
  const empty = scoreCase({ id: 'v', input: '', expect: [{ kw: 'gym' }] }, []);
  const agg = aggregate([empty], 3);
  assert.equal(agg.validationFailures, 3);
  assert.equal(agg.recall, 0);
});
