import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expandOccurrences, isValidRRule, parseRRule } from './recurrence.ts';
import type { RecurrenceRule } from '../domain/types.ts';

function rule(partial: Partial<RecurrenceRule> & Pick<RecurrenceRule, 'rrule' | 'dtStart'>): RecurrenceRule {
  return {
    id: 'r1',
    taskId: 't1',
    timezone: 'UTC',
    ...partial,
  };
}

test('parseRRule parses a weekly weekday rule', () => {
  const p = parseRRule('FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR');
  assert.equal(p.freq, 'WEEKLY');
  assert.equal(p.interval, 1);
  assert.deepEqual(p.byDay, ['MO', 'TU', 'WE', 'TH', 'FR']);
});

test('parseRRule rejects unsupported FREQ', () => {
  assert.throws(() => parseRRule('FREQ=YEARLY'));
  assert.equal(isValidRRule('FREQ=YEARLY'), false);
  assert.equal(isValidRRule('FREQ=DAILY'), true);
});

test('daily expansion respects window bounds', () => {
  const occ = expandOccurrences(
    rule({ rrule: 'FREQ=DAILY', dtStart: '2026-06-01', startTimeLocal: '09:00', endTimeLocal: '10:00' }),
    '2026-06-03',
    '2026-06-05',
  );
  assert.deepEqual(occ.map((o) => o.date), ['2026-06-03', '2026-06-04', '2026-06-05']);
  assert.equal(occ[0]!.start, '2026-06-03T09:00:00.000Z');
  assert.equal(occ[0]!.end, '2026-06-03T10:00:00.000Z');
});

test('daily INTERVAL=2 skips alternate days from dtStart', () => {
  const occ = expandOccurrences(
    rule({ rrule: 'FREQ=DAILY;INTERVAL=2', dtStart: '2026-06-01' }),
    '2026-06-01',
    '2026-06-07',
  );
  assert.deepEqual(occ.map((o) => o.date), ['2026-06-01', '2026-06-03', '2026-06-05', '2026-06-07']);
});

test('weekly BYDAY only emits matching weekdays within window', () => {
  // 2026-06-01 is a Monday
  const occ = expandOccurrences(
    rule({ rrule: 'FREQ=WEEKLY;BYDAY=MO,WE,FR', dtStart: '2026-06-01' }),
    '2026-06-01',
    '2026-06-07',
  );
  assert.deepEqual(occ.map((o) => o.date), ['2026-06-01', '2026-06-03', '2026-06-05']);
});

test('weekly INTERVAL=2 steps whole weeks', () => {
  const occ = expandOccurrences(
    rule({ rrule: 'FREQ=WEEKLY;BYDAY=MO;INTERVAL=2', dtStart: '2026-06-01' }),
    '2026-06-01',
    '2026-06-30',
  );
  assert.deepEqual(occ.map((o) => o.date), ['2026-06-01', '2026-06-15', '2026-06-29']);
});

test('COUNT caps the series from dtStart regardless of window', () => {
  const occ = expandOccurrences(
    rule({ rrule: 'FREQ=DAILY;COUNT=3', dtStart: '2026-06-01' }),
    '2026-06-01',
    '2026-06-30',
  );
  assert.deepEqual(occ.map((o) => o.date), ['2026-06-01', '2026-06-02', '2026-06-03']);
});

test('UNTIL caps the series by date', () => {
  const occ = expandOccurrences(
    rule({ rrule: 'FREQ=DAILY;UNTIL=20260603', dtStart: '2026-06-01' }),
    '2026-06-01',
    '2026-06-30',
  );
  assert.deepEqual(occ.map((o) => o.date), ['2026-06-01', '2026-06-02', '2026-06-03']);
});

test('exDates remove specific occurrences but still count toward COUNT', () => {
  const occ = expandOccurrences(
    rule({ rrule: 'FREQ=DAILY;COUNT=3', dtStart: '2026-06-01', exDates: ['2026-06-02'] }),
    '2026-06-01',
    '2026-06-30',
  );
  // 06-02 is excluded from output, but COUNT still stops the series at 3 emitted dates
  assert.deepEqual(occ.map((o) => o.date), ['2026-06-01', '2026-06-03']);
});

test('monthly defaults to dtStart day-of-month and clamps short months', () => {
  const occ = expandOccurrences(
    rule({ rrule: 'FREQ=MONTHLY', dtStart: '2026-01-31' }),
    '2026-01-01',
    '2026-04-30',
  );
  // Feb clamps to 28 (2026 not a leap year), Mar 31, Apr 30
  assert.deepEqual(occ.map((o) => o.date), ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
});

test('timezone conversion produces correct UTC instant', () => {
  // 09:00 in Asia/Kolkata (+05:30) -> 03:30 UTC
  const occ = expandOccurrences(
    rule({
      rrule: 'FREQ=DAILY;COUNT=1',
      dtStart: '2026-06-01',
      startTimeLocal: '09:00',
      timezone: 'Asia/Kolkata',
    }),
    '2026-06-01',
    '2026-06-01',
  );
  assert.equal(occ[0]!.start, '2026-06-01T03:30:00.000Z');
});

test('DST spring-forward in America/New_York resolves correctly', () => {
  // 2026-03-08 DST begins; 09:00 EDT (-04:00) -> 13:00 UTC
  const occ = expandOccurrences(
    rule({
      rrule: 'FREQ=DAILY;COUNT=1',
      dtStart: '2026-03-09',
      startTimeLocal: '09:00',
      timezone: 'America/New_York',
    }),
    '2026-03-09',
    '2026-03-09',
  );
  assert.equal(occ[0]!.start, '2026-03-09T13:00:00.000Z');
});
