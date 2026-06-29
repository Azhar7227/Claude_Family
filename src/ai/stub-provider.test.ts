import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DeterministicStubProvider } from './stub-provider.ts';
import { validateExtractionResult } from './schema.ts';
import { EXTRACTION_RESULT_SCHEMA } from './schema.ts';

const provider = new DeterministicStubProvider();

async function run(text: string) {
  const res = await provider.generateStructured({
    instruction: 'x',
    input: [{ kind: 'text', text }],
    schema: EXTRACTION_RESULT_SCHEMA,
    schemaName: 'ExtractionResult',
    promptVersion: 'test',
  });
  return validateExtractionResult(res.raw); // stub output must pass the real validator
}

test('stub output always passes the schema validator', async () => {
  const r = await run('Gym after work and study Salesforce for one hour');
  assert.ok(r.items.length >= 1);
});

test('parses a recurring timed fixed event', async () => {
  const r = await run('I work Monday to Friday from 9 to 6');
  const work = r.items.find((i) => i.category === 'work');
  assert.ok(work);
  assert.equal(work!.type, 'fixed');
  assert.equal(work!.rrule, 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR');
  assert.equal(work!.startTimeLocal, '09:00');
});

test('parses a daily wake time', async () => {
  const r = await run('Wake me every day at 5');
  assert.ok(r.items.some((i) => i.rrule === 'FREQ=DAILY' && i.startTimeLocal === '05:00'));
});

test('classifies study as flexible/learning with a duration', async () => {
  const r = await run('Study Salesforce for one hour every day');
  const study = r.items.find((i) => i.category === 'learning');
  assert.ok(study);
  assert.equal(study!.type, 'flexible');
  assert.equal(study!.durationMin, 60);
});

test('classifies prayer as fixed/faith', async () => {
  const r = await run('I pray at 5:10');
  const pray = r.items.find((i) => i.category === 'faith');
  assert.ok(pray);
  assert.equal(pray!.type, 'fixed');
  assert.equal(pray!.startTimeLocal, '05:10');
});

test('surfaces multiple times as an ambiguity instead of guessing', async () => {
  const r = await run('Remind me to pray at 5:10 1:10 5:30 7:00 8:30');
  assert.ok(r.ambiguities.length >= 1);
});

test('is deterministic: same input -> same output', async () => {
  const a = await run('Gym after work, study for 30 minutes');
  const b = await run('Gym after work, study for 30 minutes');
  assert.deepEqual(a, b);
});

test('declares capabilities for future modalities', () => {
  assert.ok(provider.capabilities.has('structured_output'));
  assert.ok(provider.capabilities.has('ocr'));
});
