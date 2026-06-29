import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DurableStore, type KVStore } from './storage.ts';

function memKV(): KVStore & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: (k) => void map.delete(k) };
}

let t = 1_000_000;
const clock = () => (t += 60_000); // advance 1 min per call

test('save/load round-trips', () => {
  const kv = memKV();
  const s = new DurableStore(kv, { now: clock });
  s.save({ hello: 'world', n: 3 });
  const r = s.load<{ hello: string; n: number }>();
  assert.equal(r.source, 'primary');
  assert.equal(r.recovered, false);
  assert.deepEqual(r.data, { hello: 'world', n: 3 });
});

test('recovers from backup when primary is corrupted', () => {
  const kv = memKV();
  const s = new DurableStore(kv, { now: clock });
  s.save({ v: 1 });
  s.save({ v: 2 }); // v:1 -> backup, v:2 -> primary
  kv.map.set('lifeflow.v1', '{ corrupt json'); // simulate corruption
  const r = s.load<{ v: number }>();
  assert.equal(r.source, 'backup');
  assert.equal(r.recovered, true);
  assert.deepEqual(r.data, { v: 1 });
});

test('recovers from newest snapshot when primary AND backup are gone', () => {
  const kv = memKV();
  const s = new DurableStore(kv, { now: clock, snapshotMinIntervalMs: 0 });
  s.save({ step: 1 });
  s.save({ step: 2 });
  s.save({ step: 3 });
  kv.map.delete('lifeflow.v1');
  kv.map.set('lifeflow.v1.backup', 'garbage');
  const r = s.load<{ step: number }>();
  assert.equal(r.source, 'snapshot');
  assert.equal(r.recovered, true);
  assert.equal((r.data as { step: number }).step, 3); // newest valid snapshot
});

test('returns none when there is nothing', () => {
  const r = new DurableStore(memKV(), { now: clock }).load();
  assert.equal(r.source, 'none');
  assert.equal(r.data, null);
});

test('snapshots are throttled and capped', () => {
  const kv = memKV();
  const s = new DurableStore(kv, { now: () => (t += 1000), snapshotMinIntervalMs: 10 * 60_000, maxSnapshots: 3 });
  for (let i = 0; i < 20; i++) s.save({ i }); // 1s apart -> most throttled
  assert.ok(s.snapshotInfo().length <= 3);
});

test('export/import round-trips and rejects garbage', () => {
  const kv = memKV();
  const s = new DurableStore(kv, { now: clock });
  s.save({ tasks: [1, 2, 3] });
  const dump = s.exportString();
  assert.ok(dump.includes('tasks'));

  const kv2 = memKV();
  const s2 = new DurableStore(kv2, { now: clock });
  const res = s2.importString(dump, (d) => typeof d === 'object' && d !== null && 'tasks' in d);
  assert.equal(res.ok, true);
  assert.deepEqual(s2.load<{ tasks: number[] }>().data, { tasks: [1, 2, 3] });

  assert.equal(s2.importString('not json').ok, false);
  assert.equal(s2.importString('{"data":{"nope":1}}', (d) => typeof d === 'object' && d !== null && 'tasks' in d).ok, false);
});

test('importing a bare (non-envelope) object also works', () => {
  const kv = memKV();
  const s = new DurableStore(kv, { now: clock });
  const res = s.importString('{"tasks":[9]}');
  assert.equal(res.ok, true);
  assert.deepEqual(s.load<{ tasks: number[] }>().data, { tasks: [9] });
});
