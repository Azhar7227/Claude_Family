import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SchemaValidationError, validateExtractionResult } from './schema.ts';

const validItem = {
  tempId: 's1',
  title: 'Gym',
  type: 'flexible',
  category: 'health',
  confidence: 0.8,
};

test('accepts a well-formed result', () => {
  const r = validateExtractionResult({ items: [validItem], ambiguities: [], warnings: [] });
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0]!.title, 'Gym');
});

test('rejects a non-object response', () => {
  assert.throws(() => validateExtractionResult(null), SchemaValidationError);
  assert.throws(() => validateExtractionResult('nope'), SchemaValidationError);
});

test('rejects missing required fields with itemized issues', () => {
  try {
    validateExtractionResult({ items: [{ tempId: 'x' }], ambiguities: [], warnings: [] });
    assert.fail('should have thrown');
  } catch (e) {
    assert.ok(e instanceof SchemaValidationError);
    assert.ok(e.issues.length >= 2); // title, type, category, confidence missing
  }
});

test('rejects invalid enum values', () => {
  assert.throws(
    () => validateExtractionResult({ items: [{ ...validItem, type: 'sometime' }], ambiguities: [], warnings: [] }),
    SchemaValidationError,
  );
  assert.throws(
    () => validateExtractionResult({ items: [{ ...validItem, category: 'banana' }], ambiguities: [], warnings: [] }),
    SchemaValidationError,
  );
});

test('clamps out-of-range confidence rather than rejecting', () => {
  const r = validateExtractionResult({ items: [{ ...validItem, confidence: 1.7 }], ambiguities: [], warnings: [] });
  assert.equal(r.items[0]!.confidence, 1);
});

test('drops an invalid rrule and records a warning (engine is the authority)', () => {
  const r = validateExtractionResult({
    items: [{ ...validItem, rrule: 'FREQ=NONSENSE' }],
    ambiguities: [],
    warnings: [],
  });
  assert.equal(r.items[0]!.rrule, undefined);
  assert.ok(r.warnings.some((w) => w.includes('invalid')));
});

test('keeps a valid rrule', () => {
  const r = validateExtractionResult({
    items: [{ ...validItem, rrule: 'FREQ=WEEKLY;BYDAY=MO,WE' }],
    ambiguities: [],
    warnings: [],
  });
  assert.equal(r.items[0]!.rrule, 'FREQ=WEEKLY;BYDAY=MO,WE');
});

test('ignores malformed times with a warning', () => {
  const r = validateExtractionResult({
    items: [{ ...validItem, startTimeLocal: '25:99' }],
    ambiguities: [],
    warnings: [],
  });
  assert.equal(r.items[0]!.startTimeLocal, undefined);
  assert.ok(r.warnings.some((w) => w.includes('startTimeLocal')));
});

test('passes through well-formed ambiguities, drops malformed ones', () => {
  const r = validateExtractionResult({
    items: [validItem],
    ambiguities: [
      { tempId: 's1', field: 'startTimeLocal', question: 'When?' },
      { tempId: 's1' }, // malformed -> dropped
    ],
    warnings: [],
  });
  assert.equal(r.ambiguities.length, 1);
});
