/**
 * Constraints vertical slice: extract (normalize) -> represent on the proposal ->
 * enforce at capture -> enforce during reflow.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeExtraction } from '../ai/normalize.ts';
import { buildProposal, type BuildContext } from './proposal.ts';
import { buildMaintenanceProposal, type MaintenanceContext, type ReplanItem } from '../maintenance/engine.ts';
import { expandConstraints } from '../engine/constraints.ts';
import type { ExtractionResult } from '../ai/types.ts';

function raw(items: Array<{ title: string; type?: 'fixed' | 'flexible'; startTimeLocal?: string; rrule?: string }>): ExtractionResult {
  return {
    profile: [], goals: [], constraints: [], ambiguities: [], warnings: [],
    items: items.map((p, i) => ({ tempId: `t${i}`, title: p.title, type: p.type ?? 'flexible', category: 'other', confidence: 0.9, sourceSpan: p.title, startTimeLocal: p.startTimeLocal, rrule: p.rrule })),
  };
}
function bctx(over: Partial<BuildContext> = {}): BuildContext {
  return { spaceId: 'me', reason: 'initial_capture', referenceDate: '2026-06-29', timezone: 'UTC', idGen: (() => { let n = 0; return () => `p${++n}`; })(), now: () => '2026-06-29T00:00:00Z', ...over };
}

// ---- extraction / normalization of the four canonical phrasings ----
test('normalization rescues the four boundary phrasings into constraints', () => {
  const r = normalizeExtraction(raw([
    { title: 'No meetings before 10' },
    { title: 'Keep Sundays free' },
    { title: "Don't schedule over Maghrib" },
    { title: "Avoid scheduling during my kids' nap" },
  ]));
  assert.equal(r.items.length, 0, 'none of these are tasks');
  const byKind = (k: string) => r.constraints.filter((c) => c.kind === k);
  assert.equal(byKind('before')[0]!.timeLocal, '10:00');
  assert.equal(byKind('before')[0]!.category, 'work'); // "meetings" scopes to work
  assert.deepEqual(byKind('day_off')[0]!.weekdays, ['SU']);
  const between = byKind('between');
  assert.ok(between.some((c) => c.startLocal === '18:30')); // Maghrib default window
  assert.ok(between.some((c) => c.startLocal === '13:00')); // nap default window
});

// ---- capture-time enforcement ----
test('capture flags an item that violates a constraint from the SAME capture', () => {
  const extraction = normalizeExtraction(raw([
    { title: 'No meetings before 10' },
    { title: 'Gym', startTimeLocal: '07:00', rrule: 'FREQ=DAILY' }, // 07:00 < 10:00 -> violates
  ]));
  const proposal = buildProposal(extraction, bctx());
  assert.ok(proposal.constraints && proposal.constraints.length >= 1);
  assert.ok(proposal.conflicts.some((c) => c.kind === 'constraint'));
});

test('capture flags an item that violates an EXISTING constraint', () => {
  const existing = expandConstraints([{ label: 'No work after 8', kind: 'after', timeLocal: '20:00' }], '2026-06-29', '2026-07-06', 'UTC')
    .map((f) => ({ label: f.label, start: f.start, end: f.end }));
  const extraction = normalizeExtraction(raw([{ title: 'Study', startTimeLocal: '21:00', rrule: 'FREQ=DAILY' }]));
  const proposal = buildProposal(extraction, bctx({ constraintBlocks: existing }));
  assert.ok(proposal.conflicts.some((c) => c.kind === 'constraint'));
});

test('an item that respects all constraints produces no constraint conflict', () => {
  const extraction = normalizeExtraction(raw([
    { title: 'No meetings before 10' },
    { title: 'Read', startTimeLocal: '21:00', rrule: 'FREQ=DAILY' },
  ]));
  const proposal = buildProposal(extraction, bctx());
  assert.equal(proposal.conflicts.filter((c) => c.kind === 'constraint').length, 0);
});

// ---- reflow enforcement ----
function mctx(over: Partial<MaintenanceContext> = {}): MaintenanceContext {
  return { spaceId: 'me', now: '2026-06-29T08:00:00Z', timezone: 'UTC', dayEndLocal: '23:00', idGen: (() => { let n = 0; return () => `m${++n}`; })(), nowFn: () => '2026-06-29T08:00:00Z', ...over };
}
function ritem(p: Partial<ReplanItem> & Pick<ReplanItem, 'occurrenceId' | 'title' | 'start' | 'end'>): ReplanItem {
  return { taskId: 't_' + p.occurrenceId, type: 'flexible', category: 'other', priority: 3, status: 'planned', ...p };
}

test('reflow never reschedules a flexible task into a constraint window', () => {
  // "no scheduling before 10" + a study session a new call bumps from 9 to ... must land >= 10:00
  const constraintBlocks = expandConstraints([{ label: 'No meetings before 10', kind: 'before', timeLocal: '10:00' }], '2026-06-29', '2026-06-29', 'UTC')
    .map((f) => ({ label: f.label, start: f.start, end: f.end }));
  const items: ReplanItem[] = [
    ritem({ occurrenceId: 'study', title: 'Study', start: '2026-06-29T09:00:00Z', end: '2026-06-29T10:00:00Z' }),
  ];
  const proposal = buildMaintenanceProposal(items, [], { kind: 'calendar_conflict', addedFixed: { title: 'Call', start: '2026-06-29T09:00:00Z', end: '2026-06-29T10:00:00Z' } }, mctx({ constraintBlocks }));
  const adj = proposal.adjustments.find((a) => a.targetRef === 'study');
  assert.ok(adj, 'study should be moved');
  // it must not land before 10:00 (the constraint window is frozen)
  assert.ok(Date.parse(adj!.occurrenceChange!.afterStart) >= Date.parse('2026-06-29T10:00:00Z'));
});
