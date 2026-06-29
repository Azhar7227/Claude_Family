/**
 * Benchmark scoring. Matches extracted items to gold expectations and computes
 * per-case item precision/recall/F1, field accuracy, and per-item correctness
 * signals used for confidence calibration (ECE).
 */

import type { ExtractedItem } from '../src/ai/types.ts';
import type { BenchCase, ExpectItem, Recurrence } from './dataset.ts';

export function classifyRecurrence(rrule?: string): Recurrence {
  if (!rrule) return 'once';
  if (/FREQ=DAILY/.test(rrule)) return 'daily';
  if (/BYDAY=MO,TU,WE,TH,FR/.test(rrule)) return 'weekdays';
  if (/FREQ=WEEKLY/.test(rrule)) return 'weekly';
  if (/FREQ=MONTHLY/.test(rrule)) return 'monthly';
  return 'once';
}

export interface ItemScore {
  confidence: number;
  matched: boolean; // matched some gold item (presence correct)
}

export interface CaseScore {
  id: string;
  expected: number;
  extracted: number;
  matchedExpected: number; // recall numerator
  fieldHits: number;
  fieldTotal: number;
  items: ItemScore[];
}

function fieldChecks(exp: ExpectItem, item: ExtractedItem): { hits: number; total: number } {
  let hits = 0;
  let total = 0;
  if (exp.type) { total++; if (item.type === exp.type) hits++; }
  if (exp.cat) { total++; if (item.category === exp.cat) hits++; }
  if (exp.rec) { total++; if (classifyRecurrence(item.rrule) === exp.rec) hits++; }
  if (exp.time) { total++; if (item.startTimeLocal === exp.time) hits++; }
  return { hits, total };
}

export function scoreCase(cse: BenchCase, items: ExtractedItem[]): CaseScore {
  const usedExtracted = new Set<number>();
  let matchedExpected = 0;
  let fieldHits = 0;
  let fieldTotal = 0;

  for (const exp of cse.expect) {
    let bestIdx = -1;
    for (let i = 0; i < items.length; i++) {
      if (usedExtracted.has(i)) continue;
      if (items[i]!.title.toLowerCase().includes(exp.kw.toLowerCase())) { bestIdx = i; break; }
    }
    if (bestIdx >= 0) {
      usedExtracted.add(bestIdx);
      matchedExpected++;
      const fc = fieldChecks(exp, items[bestIdx]!);
      fieldHits += fc.hits;
      fieldTotal += fc.total;
    } else {
      fieldTotal += [exp.type, exp.cat, exp.rec, exp.time].filter(Boolean).length;
    }
  }

  const itemScores: ItemScore[] = items.map((it, i) => ({ confidence: it.confidence, matched: usedExtracted.has(i) }));
  return { id: cse.id, expected: cse.expect.length, extracted: items.length, matchedExpected, fieldHits, fieldTotal, items: itemScores };
}

export interface Aggregate {
  cases: number;
  validationFailures: number;
  recall: number; // matchedExpected / expected
  precision: number; // matchedExtracted / extracted
  f1: number;
  fieldAccuracy: number; // hits / total over matched specified fields
  meanConfidence: number;
  ece: number; // expected calibration error (5 bins)
  calibrationGap: number; // meanConfidence - precision
}

export function aggregate(scores: CaseScore[], validationFailures: number): Aggregate {
  let expected = 0, extracted = 0, matchedExp = 0, matchedExtr = 0, fieldHits = 0, fieldTotal = 0;
  const allItems: ItemScore[] = [];
  for (const s of scores) {
    expected += s.expected;
    extracted += s.extracted;
    matchedExp += s.matchedExpected;
    matchedExtr += s.items.filter((i) => i.matched).length;
    fieldHits += s.fieldHits;
    fieldTotal += s.fieldTotal;
    allItems.push(...s.items);
  }
  const recall = expected ? matchedExp / expected : 0;
  const precision = extracted ? matchedExtr / extracted : 0;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  const meanConfidence = allItems.length ? allItems.reduce((a, b) => a + b.confidence, 0) / allItems.length : 0;

  // ECE over 5 confidence bins; accuracy = fraction of items in bin that matched
  const bins = 5;
  let ece = 0;
  for (let b = 0; b < bins; b++) {
    const lo = b / bins, hi = (b + 1) / bins;
    const inBin = allItems.filter((i) => i.confidence >= lo && (b === bins - 1 ? i.confidence <= hi : i.confidence < hi));
    if (!inBin.length) continue;
    const acc = inBin.filter((i) => i.matched).length / inBin.length;
    const conf = inBin.reduce((a, x) => a + x.confidence, 0) / inBin.length;
    ece += (inBin.length / allItems.length) * Math.abs(acc - conf);
  }

  return {
    cases: scores.length,
    validationFailures,
    recall, precision, f1,
    fieldAccuracy: fieldTotal ? fieldHits / fieldTotal : 0,
    meanConfidence,
    ece,
    calibrationGap: meanConfidence - precision,
  };
}
