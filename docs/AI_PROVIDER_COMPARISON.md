# AI Provider Comparison — LifeFlow extraction use case

> Goal: pick a **default** production provider for turning messy real-world
> routine descriptions (and timetable images) into our canonical
> `ExtractionResult`. Switching providers must stay a one-line config change.
>
> Scores below are a directional judgement for *this specific task* as of the
> Jan 2026 knowledge cutoff. The **benchmark** (`npm run bench`) replaces opinion
> with measured numbers once API keys are configured — that is the source of
> truth, this doc is the prior.

## The task profile

Our extraction job is unusual in a few ways that should drive the choice:
1. **Capture is the wedge** → **OCR / image understanding** of screenshots,
   school timetables, and photographed schedules matters *a lot*.
2. **High volume, latency-sensitive** → runs on every capture; mobile users wait
   on it. Cheap + fast beats marginally-smarter-but-slow.
3. **Strict structured output** → it must return our JSON schema; we validate at
   the boundary, but malformed-rate directly hurts UX.
4. **Recurrence reasoning** → mapping "every other Tuesday" → RRULE is light
   reasoning, not deep — mid-tier models handle it with a good prompt.
5. **Long context is mostly irrelevant** → inputs are short. A 1M window is nice
   for huge calendar pastes but rarely the deciding factor.

## Head-to-head (this task, not general benchmarks)

| Dimension | Anthropic (Claude) | OpenAI (GPT) | Google (Gemini) |
|---|---|---|---|
| Messy NL understanding | ★★★★★ excellent instruction-following | ★★★★★ | ★★★★☆ |
| Recurrence → RRULE | ★★★★★ | ★★★★★ | ★★★★☆ |
| **OCR quality** | ★★★★☆ | ★★★★☆ | ★★★★★ best-in-class on dense docs |
| **Image understanding** | ★★★★☆ | ★★★★★ | ★★★★★ |
| Cost (per call) | Haiku cheap / Sonnet mid | mini cheap / 4o mid | **Flash cheapest** |
| Speed / mobile latency | Haiku fast | mini fast | **Flash fastest tier** |
| Structured JSON reliability | ★★★★☆ via tool-use | ★★★★★ strict Structured Outputs | ★★★★☆ responseSchema |
| Function / tool calling | ★★★★★ mature | ★★★★★ mature | ★★★★☆ |
| Long context | 200K | 128K+ | **1M+** |
| Multimodal in one call | ★★★★☆ | ★★★★★ | ★★★★★ |

## Recommendation: **Gemini Flash as default**, with a one-line switch

For *this* product the deciding factors are **OCR/vision + cost + latency at
volume**, and that triangle points at **Gemini Flash**:

- The differentiator is *capture from images* (timetables, whiteboards,
  screenshots). Gemini is the strongest, cheapest, fastest option for dense OCR
  and document understanding — exactly our wedge.
- It is the cheapest and among the fastest, which matters because extraction
  runs on *every* capture and the user is waiting.
- `responseSchema` + our boundary validator gives reliable JSON; the rare
  malformed response is caught and re-tried, not trusted.

**But the architecture refuses to bet the company on this guess.** Two fallbacks
are first-class, selectable with one env var:

- **Claude (Sonnet)** — when *accuracy on gnarly natural language* matters more
  than cost (e.g. a "high-accuracy" tier, or if the benchmark shows Gemini
  mis-parsing recurrence). Best-in-class instruction following.
- **OpenAI (GPT, strict Structured Outputs)** — when *JSON reliability* is the
  bottleneck; strict mode guarantees schema conformance.

> Default is a *hypothesis*, not a religion. `LIFEFLOW_PROVIDER=claude npm run bench`
> changes everything in one line. The benchmark decides the real winner.

## How "config only" works

```
LIFEFLOW_PROVIDER = stub | anthropic | openai | gemini   # the one line
ANTHROPIC_API_KEY / OPENAI_API_KEY / GEMINI_API_KEY      # secrets
LIFEFLOW_MODEL = <override>                               # optional pin
```

`createProviderFromEnv()` returns an `AIProvider`. Business logic (extraction
service, pipeline, web app) only ever sees the `AIProvider` interface and the
validated `ExtractionResult` — it never learns which model produced it.

> Security note: API keys never ship to the browser. The PWA defaults to the
> deterministic `stub`; production extraction runs server-side (or in the
> benchmark), where the real adapters live. A thin backend endpoint will proxy
> the chosen provider for the app — same interface, same schema.
