/**
 * AI Evaluation Framework — observability for the AI layer.
 *
 * This is a side-channel: it MUST NOT affect core business logic. Extraction
 * and the Proposal engine work identically whether a sink is present or not
 * (the default is a no-op). The data captured here enables future provider
 * comparison, prompt optimization, and quality monitoring — all offline,
 * never in the hot path of a user's decision.
 *
 * Dependency direction: eval depends on NOTHING in the app. Callers pass plain
 * records. This keeps it a pure observability seam.
 */

export type InputMethod = 'text' | 'image' | 'ics' | 'voice' | 'pdf' | 'csv';

/** One record per extraction request (TECH_SPEC eval requirements). */
export interface ExtractionTrace {
  traceId: string;
  at: string; // ISO
  inputMethod: InputMethod;
  provider: string;
  model: string;
  promptVersion: string;
  latencyMs: number;
  tokensIn?: number;
  tokensOut?: number;
  /** Aggregate confidence stats over the validated items. */
  itemCount: number;
  avgConfidence: number | null;
  minConfidence: number | null;
  lowConfidenceCount: number;
  /** Validation outcome at the boundary. */
  validation: { ok: boolean; issueCount: number; issues?: string[] };
}

/** One record when the user resolves the proposal built from an extraction. */
export interface OutcomeEvent {
  traceId?: string; // correlates to ExtractionTrace
  proposalId: string;
  at: string; // ISO
  outcome: 'accepted' | 'partially_accepted' | 'rejected';
  acceptedCount: number;
  totalCount: number;
  /** Did the user modify any proposed adjustment before accepting? */
  edited: boolean;
}

export interface EvalSink {
  recordExtraction(trace: ExtractionTrace): void;
  recordOutcome(event: OutcomeEvent): void;
}

/** Default. Records nothing. Guarantees the app runs with zero eval wiring. */
export class NoopEvalSink implements EvalSink {
  recordExtraction(): void {}
  recordOutcome(): void {}
}

/** For tests, local dashboards, and dev. Holds records in memory. */
export class InMemoryEvalSink implements EvalSink {
  readonly extractions: ExtractionTrace[] = [];
  readonly outcomes: OutcomeEvent[] = [];

  recordExtraction(trace: ExtractionTrace): void {
    this.extractions.push(trace);
  }
  recordOutcome(event: OutcomeEvent): void {
    this.outcomes.push(event);
  }

  /** Convenience for monitoring: acceptance rate across recorded outcomes. */
  acceptanceRate(): number | null {
    if (this.outcomes.length === 0) return null;
    const accepted = this.outcomes.filter((o) => o.outcome !== 'rejected').length;
    return accepted / this.outcomes.length;
  }
}

/** Compute confidence aggregates for a trace. Exported for reuse/testing. */
export function confidenceStats(confidences: number[]): {
  avgConfidence: number | null;
  minConfidence: number | null;
  lowConfidenceCount: number;
} {
  if (confidences.length === 0) return { avgConfidence: null, minConfidence: null, lowConfidenceCount: 0 };
  const sum = confidences.reduce((a, b) => a + b, 0);
  return {
    avgConfidence: sum / confidences.length,
    minConfidence: Math.min(...confidences),
    lowConfidenceCount: confidences.filter((c) => c < 0.6).length,
  };
}
