import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expandConstraints, type ExpandableConstraint } from './constraints.ts';

// 2026-06-29 is a Monday; 2026-07-05 is a Sunday.
test('before-time -> forbids from midnight to the boundary', () => {
  const c: ExpandableConstraint = { label: 'No meetings before 10', kind: 'before', timeLocal: '10:00' };
  const f = expandConstraints([c], '2026-06-29', '2026-06-29', 'UTC');
  assert.equal(f.length, 1);
  assert.equal(f[0]!.start, '2026-06-29T00:00:00.000Z');
  assert.equal(f[0]!.end, '2026-06-29T10:00:00.000Z');
});

test('after-time -> forbids from the boundary to end of day', () => {
  const f = expandConstraints([{ label: 'No work after 8', kind: 'after', timeLocal: '20:00' }], '2026-06-29', '2026-06-29', 'UTC');
  assert.equal(f[0]!.start, '2026-06-29T20:00:00.000Z');
  assert.equal(f[0]!.end, '2026-06-30T00:00:00.000Z');
});

test('between -> forbids the window (kids nap)', () => {
  const f = expandConstraints([{ label: 'Nap', kind: 'between', startLocal: '13:00', endLocal: '15:00' }], '2026-06-29', '2026-06-29', 'UTC');
  assert.equal(f[0]!.start, '2026-06-29T13:00:00.000Z');
  assert.equal(f[0]!.end, '2026-06-29T15:00:00.000Z');
});

test('day_off only fires on its weekdays', () => {
  const c: ExpandableConstraint = { label: 'Sundays free', kind: 'day_off', weekdays: ['SU'] };
  const f = expandConstraints([c], '2026-06-29', '2026-07-05', 'UTC'); // Mon..Sun
  assert.equal(f.length, 1); // only Sunday the 5th
  assert.equal(f[0]!.start, '2026-07-05T00:00:00.000Z');
  assert.equal(f[0]!.end, '2026-07-06T00:00:00.000Z');
});

test('weekday scoping limits a before-rule to chosen days', () => {
  const c: ExpandableConstraint = { label: 'No early Mondays', kind: 'before', timeLocal: '10:00', weekdays: ['MO'] };
  const f = expandConstraints([c], '2026-06-29', '2026-07-01', 'UTC'); // Mon, Tue, Wed
  assert.equal(f.length, 1);
  assert.equal(f[0]!.start.slice(0, 10), '2026-06-29');
});

test('timezone is honored', () => {
  const f = expandConstraints([{ label: 'x', kind: 'before', timeLocal: '10:00' }], '2026-06-29', '2026-06-29', 'Asia/Kolkata');
  // 10:00 IST = 04:30 UTC
  assert.equal(f[0]!.end, '2026-06-29T04:30:00.000Z');
});
