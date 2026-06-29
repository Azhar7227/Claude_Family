# AI Evaluation Framework

> Observability for the AI layer. Captures what each extraction did and how the
> user responded — so we can compare providers, optimize prompts, and monitor
> quality over time. **It is a side-channel: it never affects business logic.**

## Design principles

1. **Zero impact on the hot path.** The app behaves identically with or without
   a sink. The default is `NoopEvalSink`. There's a test asserting the pipeline
   output (`adjustments`, `conflicts`, `extraction`) is byte-identical with and
   without a sink attached.
2. **Best-effort.** All sink calls are wrapped; a telemetry failure can never
   fail an extraction or a user action.
3. **Dependency-free.** `src/eval` imports nothing from the app — callers pass
   plain records. Eval is a pure observability seam.
4. **Provider-agnostic.** Because metadata is keyed by `provider` + `model` +
   `promptVersion`, swapping the stub for Claude/Gemini/OpenAI immediately makes
   the data comparable across providers with no schema change.

## What is captured

### `ExtractionTrace` — one per extraction request
| Field | Source | Use |
|---|---|---|
| `provider`, `model`, `promptVersion` | provider meta | provider/prompt comparison |
| `latencyMs` | measured around the provider call (injectable clock) | performance monitoring |
| `tokensIn`, `tokensOut` | provider meta (when available) | cost tracking |
| `itemCount`, `avgConfidence`, `minConfidence`, `lowConfidenceCount` | validated result | quality signal |
| `validation: { ok, issueCount, issues? }` | the schema boundary | malformed-output rate per provider/prompt |
| `inputMethod` | capture method | per-modality quality (text vs image vs ics) |

Crucially, **failed validations are recorded too** (then the error is rethrown)
— a provider that emits malformed JSON is exactly what we want to detect.

### `OutcomeEvent` — one per resolved proposal
| Field | Use |
|---|---|
| `outcome` (`accepted`/`partially_accepted`/`rejected`) | the core quality metric |
| `acceptedCount` / `totalCount` | partial-acceptance signal |
| `edited` | did the user fix the AI before accepting? (prompt-quality signal) |
| `traceId` | correlates the outcome back to the extraction that produced it |

`acceptanceRate()` on the in-memory sink is the seed of the product's North-Star
metric (does the AI's output get used?).

## Wiring

- `extract(provider, input, { sink, traceId, inputMethod, now, monotonicMs })`
  records an `ExtractionTrace`.
- `recordProposalOutcome(sink, proposal, { edited, now })` records an
  `OutcomeEvent` after `acceptProposal` / `rejectProposal`.
- Both are optional. `runCapture` threads a `sink` through when provided.

## Implementations

- `NoopEvalSink` — default; records nothing.
- `InMemoryEvalSink` — tests, local dashboards, dev. In production this becomes
  an adapter that writes to an analytics store / warehouse — same interface.

## Why this enables provider comparison later

When we add a live Claude/Gemini/OpenAI adapter (only an `AIProvider`
implementation — no pipeline changes), every request flows through the same
trace. We can then answer, from real traffic: which provider has the lowest
malformed-output rate, highest acceptance rate, best latency/cost, and per
prompt version — without touching orchestration or business logic.
