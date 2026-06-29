/**
 * Explainability layer (TECH_SPEC §8 explanation layer).
 *
 * Every AI/maintenance suggestion must answer five questions. These are
 * generated DETERMINISTICALLY by the engine (not the LLM) so they are always
 * accurate, consistent, free, and offline. A future LLM pass may only *rephrase*
 * them for warmth — it can never change the causal facts.
 */

export interface AlternativeOption {
  /** A short description of an option the engine could have chosen. */
  summary: string;
  /** Why it was not chosen. */
  rejectedBecause: string;
}

export interface Explanation {
  /** Why was this suggested? (the trigger / root cause) */
  why: string;
  /** What changed? (concrete, human-readable diffs) */
  whatChanged: string[];
  /** What constraints were preserved? (fixed events, protected time, durations) */
  constraintsPreserved: string[];
  /** What alternatives were considered? */
  alternatives: AlternativeOption[];
  /** Why was this option selected over the alternatives? */
  selectionReason: string;
}

export function emptyExplanation(why: string): Explanation {
  return { why, whatChanged: [], constraintsPreserved: [], alternatives: [], selectionReason: '' };
}

/** Roll up per-adjustment explanations into a single proposal-level explanation. */
export function summarizeExplanations(why: string, parts: Explanation[]): Explanation {
  const whatChanged = parts.flatMap((p) => p.whatChanged);
  const constraintsPreserved = unique(parts.flatMap((p) => p.constraintsPreserved));
  const alternatives = parts.flatMap((p) => p.alternatives);
  const moved = parts.filter((p) => p.whatChanged.some((c) => c.startsWith('Moved'))).length;
  const shortened = parts.filter((p) => p.whatChanged.some((c) => c.startsWith('Shortened'))).length;
  const skipped = parts.filter((p) => p.whatChanged.some((c) => c.startsWith('Skipped'))).length;
  const bits: string[] = [];
  if (moved) bits.push(`moved ${moved}`);
  if (shortened) bits.push(`shortened ${shortened}`);
  if (skipped) bits.push(`skipped ${skipped}`);
  return {
    why,
    whatChanged,
    constraintsPreserved,
    alternatives,
    selectionReason: bits.length
      ? `Chose the plan that ${bits.join(', ')} while keeping every fixed and protected block in place.`
      : 'No flexible items needed to move; all constraints already satisfied.',
  };
}

function unique<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}
