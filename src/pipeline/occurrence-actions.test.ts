import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryRepository } from './commit.ts';
import {
  OccurrenceNotFoundError,
  completeOccurrence,
  markMissed,
  rescheduleOccurrence,
  skipOccurrence,
} from './occurrence-actions.ts';
import type { Occurrence } from '../domain/types.ts';

function seed(): InMemoryRepository {
  const repo = new InMemoryRepository();
  const occ: Occurrence = {
    id: 'o1',
    taskId: 't1',
    spaceId: 'sp',
    start: '2026-06-29T09:00:00Z',
    end: '2026-06-29T10:00:00Z',
    status: 'planned',
  };
  repo.addOccurrences([occ]);
  return repo;
}

test('complete marks done and stamps completedAt; idempotent', () => {
  const repo = seed();
  const r1 = completeOccurrence(repo, 'o1', '2026-06-29T09:45:00Z');
  assert.equal(r1.status, 'done');
  assert.equal(r1.completedAt, '2026-06-29T09:45:00Z');
  const r2 = completeOccurrence(repo, 'o1', '2026-06-29T09:50:00Z');
  assert.equal(r2.completedAt, '2026-06-29T09:45:00Z'); // unchanged on repeat
});

test('skip marks skipped', () => {
  const repo = seed();
  assert.equal(skipOccurrence(repo, 'o1').status, 'skipped');
});

test('reschedule moves time, sets moved status, preserves originalStart', () => {
  const repo = seed();
  const r = rescheduleOccurrence(repo, 'o1', '2026-06-29T14:00:00Z', '2026-06-29T15:00:00Z');
  assert.equal(r.status, 'moved');
  assert.equal(r.start, '2026-06-29T14:00:00Z');
  assert.equal(r.originalStart, '2026-06-29T09:00:00Z');
});

test('reschedule rejects an inverted range', () => {
  const repo = seed();
  assert.throws(() => rescheduleOccurrence(repo, 'o1', '2026-06-29T15:00:00Z', '2026-06-29T14:00:00Z'));
});

test('unknown occurrence throws OccurrenceNotFoundError', () => {
  const repo = seed();
  assert.throws(() => completeOccurrence(repo, 'nope', 'x'), OccurrenceNotFoundError);
});

test('markMissed flags only past, still-planned occurrences', () => {
  const repo = seed();
  repo.addOccurrences([
    { id: 'o2', taskId: 't2', spaceId: 'sp', start: '2026-06-29T20:00:00Z', end: '2026-06-29T21:00:00Z', status: 'planned' },
  ]);
  const missed = markMissed(repo, [...repo.occurrences], '2026-06-29T12:00:00Z');
  assert.deepEqual(missed, ['o1']); // o1 ended at 10:00 (past); o2 is future
});
