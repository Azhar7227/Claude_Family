import { test } from 'node:test';
import assert from 'node:assert/strict';
import { icsToExtractionResult, parseIcs } from './ics.ts';
import { validateExtractionResult } from '../ai/schema.ts';
import { IcsExtractionProvider } from '../ai/ics-provider.ts';
import {
  InMemoryRepository,
  acceptProposal,
  commit,
  runCapture,
  sequentialIdGen,
  type CaptureContext,
} from '../pipeline/index.ts';
import type { CaptureSource } from '../domain/types.ts';

const SAMPLE = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'BEGIN:VEVENT',
  'SUMMARY:Team Standup',
  'DTSTART;TZID=America/New_York:20260629T090000',
  'DTEND;TZID=America/New_York:20260629T093000',
  'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'SUMMARY:Dentist appointment',
  'DTSTART:20260701T140000Z',
  'DTEND:20260701T150000Z',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

test('parseIcs extracts VEVENTs with summary/dtstart/rrule', () => {
  const events = parseIcs(SAMPLE);
  assert.equal(events.length, 2);
  assert.equal(events[0]!.summary, 'Team Standup');
  assert.equal(events[0]!.rrule, 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR');
});

test('handles folded lines (RFC 5545 line folding)', () => {
  const folded = 'BEGIN:VEVENT\r\nSUMMARY:Very long\r\n  title here\r\nDTSTART:20260629T090000\r\nEND:VEVENT';
  const events = parseIcs(folded);
  assert.equal(events[0]!.summary, 'Very long title here');
});

test('icsToExtractionResult output passes the canonical validator', () => {
  const raw = icsToExtractionResult(SAMPLE);
  const result = validateExtractionResult(raw);
  assert.equal(result.items.length, 2);
  const standup = result.items[0]!;
  assert.equal(standup.type, 'fixed');
  assert.equal(standup.category, 'work');
  assert.equal(standup.startTimeLocal, '09:00');
  assert.equal(standup.rrule, 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR');
  assert.equal(standup.dtStart, '2026-06-29');
});

test('all-day events are flagged with a warning, still extracted', () => {
  const ics = 'BEGIN:VEVENT\nSUMMARY:Holiday\nDTSTART;VALUE=DATE:20260704\nEND:VEVENT';
  const result = validateExtractionResult(icsToExtractionResult(ics));
  assert.equal(result.items[0]!.startTimeLocal, undefined);
  assert.ok(result.warnings.some((w) => w.includes('all-day')));
});

test('END-TO-END: .ics feeds the same pipeline -> proposal -> commit', async () => {
  const idGen = sequentialIdGen('t');
  const ctx: CaptureContext = {
    provider: new IcsExtractionProvider(), // deterministic provider, no model
    spaceId: 'sp',
    referenceDate: '2026-06-29',
    timezone: 'America/New_York',
    idGen,
    now: () => '2026-06-29T00:00:00.000Z',
  };
  const { proposal, meta } = await runCapture({ method: 'ics', uploadId: 'u1', icsText: SAMPLE }, ctx);
  assert.equal(meta.provider, 'ics');
  assert.equal(proposal.adjustments.length, 2);
  assert.ok(proposal.adjustments.every((a) => a.op === 'add'));

  const repo = new InMemoryRepository();
  const source: CaptureSource = { method: 'ics', uploadId: 'u1', capturedAt: '2026-06-29T00:00:00.000Z' };
  const result = commit(acceptProposal(proposal), repo, { source, idGen, now: () => '2026-06-29T00:00:00.000Z', materializeDays: 7 });
  assert.equal(result.createdTaskIds.length, 2);
  // the recurring standup materialized weekday occurrences within the window
  assert.ok(repo.occurrences.length >= 5);
  assert.ok([...repo.tasks.values()].every((t) => t.source.method === 'ics'));
});
