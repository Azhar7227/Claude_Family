# LifeFlow — Production-Readiness Audit (assume 1,000,000 users)

> Scope: security, scalability, privacy, synchronization, offline, battery, AI
> cost, failure recovery, data integrity. Evidence is cited to real files. No
> features proposed — risks and mitigation *direction* only. Ranked by severity.

## Headline finding (read this first)

**LifeFlow is today a local-first, single-user PWA plus a stateless key-proxy —
not a multi-tenant service.** All user data lives in one browser's
`localStorage` (`src/web/storage.ts`); the only server (`server/index.ts`) is an
unauthenticated relay to paid LLM APIs. This is excellent for a 1-person beta
and **cannot be exposed to 1M users as-is** without a real backend tier
(identity, multi-tenant encrypted storage, sync, quotas, monitoring,
compliance). The four CRITICALs below are launch-blocking for any public,
multi-user deployment; nearly all are "not built yet," not "built wrong."

## Severity summary

| # | Risk | Domain | Severity |
|---|---|---|---|
| C1 | Open, unauthenticated, unthrottled AI proxy → unbounded spend & abuse | Security / AI cost | 🔴 Critical |
| C2 | Special-category data (health, faith, children) unencrypted & sent to 3rd-party LLMs without consent/DPA | Privacy | 🔴 Critical |
| C3 | No authentication / accounts / tenancy → cannot isolate users | Security | 🔴 Critical |
| C4 | Local-only storage → device loss = permanent data loss; no server backup | Data integrity | 🔴 Critical |
| H1 | Silent `localStorage` write failures (quota) → undetected data loss | Data integrity | 🟠 High |
| H2 | No rate limiting / quotas / 429 backoff → provider limits & cost blowups | Scalability / cost | 🟠 High |
| H3 | No persisted cost/usage metering or spend caps | AI cost / ops | 🟠 High |
| H4 | Unbounded request body / payload size on proxy → memory DoS | Security | 🟠 High |
| H5 | No multi-device sync / server source of truth | Synchronization | 🟠 High |
| H6 | No production observability (logs, metrics, errors, alerts) | Failure recovery / ops | 🟠 High |
| H7 | No schema migration → version drift can drop/corrupt data | Data integrity | 🟠 High |
| H8 | Single shared API key, no rotation / per-tenant scoping | Security / cost | 🟠 High |
| M1 | 30s `setInterval` notifier + full re-render + O(n) recompute → battery/CPU | Battery | 🟡 Medium |
| M2 | Service worker cache-first with fixed key → stale bundle after deploy | Offline / integrity | 🟡 Medium |
| M3 | Live provider error doesn't fall back to stub → failed captures | Failure recovery | 🟡 Medium |
| M4 | Unbounded occurrence/ledger growth (no GC) → localStorage bloat | Scalability / integrity | 🟡 Medium |
| M5 | Multi-tab last-write-wins → cross-tab data clobbering | Data integrity | 🟡 Medium |
| M6 | No data residency / region pinning for EU users | Privacy | 🟡 Medium |
| M7 | No retry/backoff in adapters for transient 5xx/429 | Failure recovery | 🟡 Medium |
| M8 | Plain `http`, no CSP/HSTS/security headers | Security | 🟡 Medium |
| M9 | No PII scrubbing in telemetry traces (`sourceSpan` holds raw text) | Privacy | 🟡 Medium |
| L1 | `uuid()` fallback can collide if `crypto` absent | Data integrity | ⚪ Low |
| L2 | SW can persist a compromised cached bundle | Security | ⚪ Low |
| L3 | Scheduling trusts device clock | Data integrity | ⚪ Low |
| L4 | No SBOM / dependency scanning in CI | Security | ⚪ Low |
| L5 | `apiHealth` probe adds latency to first load when offline | Offline | ⚪ Low |

---

## Critical

### C1 — Open AI proxy = unbounded cost + abuse
`server/index.ts` `/api/extract` calls `createProviderFromEnv()` (paid Anthropic/
OpenAI/Gemini) with **no auth, no rate limit, no per-caller quota, no payload
cap**. Anyone who discovers the URL can: (a) burn the org's entire API budget in
minutes, (b) use LifeFlow as a free LLM relay. At 1M users this is a guaranteed
financial-DoS and abuse vector.
*Direction:* require authenticated sessions; per-user and global token/RPM
quotas; payload size caps; WAF/edge rate limiting; budget circuit-breaker that
fails closed.

### C2 — Sensitive personal data, unprotected, sent to third parties
The dataset is the most intimate imaginable — **health, religion/prayer,
children, family, location patterns** (GDPR Art. 9 special categories). Today it
is stored **unencrypted** in `localStorage` and the raw text is POSTed in
plaintext bodies to third-party LLM vendors with **no consent flow, no DPA, no
retention controls, no region routing**. This is a serious legal/regulatory
exposure (GDPR, UK-GDPR, CCPA, and faith/health-data sensitivities) at any scale.
*Direction:* explicit consent + privacy policy; signed DPAs + zero-retention
provider configs; encrypt sensitive fields at rest; minimize/redact what is sent;
region-pinned processing; data-subject delete that also purges provider logs.

### C3 — No identity, no tenancy
There are no accounts, sessions, or authorization anywhere. There is no concept
of "a user." Multi-user deployment would mean one undifferentiated data space
and an unprotected proxy. **Blocking** for anything beyond single-device personal
use.
*Direction:* authentication + per-tenant isolation as the foundation of any
backend; every API call scoped to an authenticated principal.

### C4 — Local-only persistence; no server backup
`DurableStore` (primary + backup + snapshots) is robust **within one browser**,
but there is no server copy. Clearing site data, browser eviction, or a lost/
broken device = **permanent loss** unless the user manually exported. The
"never lose your data" promise is device-scoped, not absolute.
*Direction:* server-side encrypted backup/sync as the durable system of record;
treat the client store as a cache.

---

## High

- **H1 — Silent write failures.** `DurableStore.save()` returns `{ok:false}` on
  quota/exception, but `AppStore.save()` ignores the result. A heavy user who
  exceeds the ~5MB quota keeps "saving" with nothing persisted → silent loss.
  *Direction:* surface write failures to the UI; trigger export/prune.
- **H2 — No rate limiting / backoff.** No client or server throttling; adapters
  (`providers/http.ts`) have a timeout but **no retry/backoff on 429/5xx**.
  Provider RPM/TPM limits will be hit under load with no queue or graceful
  degradation. *Direction:* token-bucket quotas, exponential backoff, request
  queue, shed load to stub.
- **H3 — No spend visibility or caps.** The eval framework computes tokens/cost
  but only in-memory client-side; nothing is persisted or aggregated server-side.
  You cannot see or cap real spend. *Direction:* server-side usage metering +
  budget alerts + hard caps.
- **H4 — Unbounded request body.** `readBody()` concatenates the whole stream
  with no size limit → trivial memory-exhaustion DoS. *Direction:* enforce a
  small max body size; reject oversized images.
- **H5 — No sync / server source of truth.** Data is per-browser; switching
  devices loses everything (absent manual import). No reconciliation model
  exists. *Direction:* server store + LWW/CRDT sync when multi-device is in scope.
- **H6 — No observability.** No structured logs, metrics, error tracking, or
  alerting in the server or client. At 1M users you'd be blind to outages,
  abuse, and cost spikes. *Direction:* logging/metrics/error-reporting/alerting.
- **H7 — No schema migration.** `DurableStore` stamps `v:1` but `load()`
  hydrates blindly (`data.tasks ?? []`). A future shape change can silently drop
  fields or mis-hydrate. *Direction:* versioned migrations with validation on
  load; refuse-and-recover on incompatible versions.
- **H8 — Shared, unrotated API key.** One key serves all traffic; a leak exposes
  unbounded spend and is hard to contain. *Direction:* per-environment keys,
  rotation, scoping, secret manager.

## Medium

- **M1 — Battery/CPU.** `ReminderNotifier` runs a 30s `setInterval` recomputing
  `notificationPlan()` (O(occurrences)) while open, and the UI does a **full
  DOM rebuild on every state change** (`main.ts render()` → `clear()` +
  re-append) with per-render `buildTodayView`/`markMissed`. Fine for one user,
  wasteful on mobile at scale. *Direction:* event-driven scheduling, memoized
  reads, incremental DOM updates.
- **M2 — Stale bundle after deploy.** `public/sw.js` is cache-first on a fixed
  `lifeflow-v1` key listing `bundle.js`; new deploys may serve stale code until
  the cache key changes — risking a code/data-shape mismatch. *Direction:*
  content-hashed assets + cache-busting/SW update flow.
- **M3 — No degrade-to-stub on live error.** `AppStore.capture()` catches a
  failed proxy call by clearing the proposal — the user gets nothing rather than
  falling back to the on-device stub. *Direction:* on live extraction error,
  retry then fall back to stub.
- **M4 — Unbounded data growth.** Occurrences are materialized 35 days ahead and
  the ledger/occurrence history is never pruned; a long-term user's store grows
  without bound toward the quota in H1. *Direction:* prune/archive old
  occurrences and ledger entries.
- **M5 — Multi-tab clobbering.** Two open tabs each hold an in-memory repo and
  write the whole snapshot; last save wins, silently discarding the other tab's
  edits. *Direction:* `storage`-event coordination or a single shared worker.
- **M6 — No data residency.** Provider calls hit default regions; EU user data
  may leave the EU. *Direction:* region-pinned provider endpoints/routing.
- **M7 — No transient-failure retry** in adapters (see H2).
- **M8 — Transport/headers.** Server is plain `http` with no CSP/HSTS/
  X-Content-Type-Options; assumes a TLS terminator that isn't specified.
  *Direction:* TLS, security headers, CSP for the PWA.
- **M9 — Telemetry PII.** Extracted items carry `sourceSpan` (raw user text); any
  server-side persistence of traces would capture personal data. *Direction:*
  scrub/redact before persisting telemetry.

## Low

- **L1** `uuid()` falls back to a `performance.now()` hash if `crypto` is absent
  — collision-prone (rare environments).
- **L2** Service worker can persist a compromised cached bundle across the
  origin until cache invalidation.
- **L3** Scheduling trusts the device clock/timezone; a wrong clock skews the day.
- **L4** No SBOM or dependency vulnerability scanning in CI.
- **L5** `apiHealth` adds a ~2.5s probe to first capture when offline.

---

## What is genuinely solid (don't re-litigate)

- Deterministic engine, conflict/recurrence/reflow, and the validation boundary
  are well-tested (117 tests) and the LLM is correctly kept off the hot path.
- Client-side crash recovery (primary→backup→snapshot) and the error boundary
  are real and tested.
- Provider-agnostic adapters + config-only switching + boundary validation are
  clean; provider responses are never trusted.
- Zero runtime dependencies → minimal supply-chain surface.

## Bottom line

For **one user**, LifeFlow is beta-ready. For **one million users**, the gating
work is a backend tier you have not built yet: **auth + multi-tenant encrypted
storage + sync + a metered, rate-limited, budget-capped AI gateway + privacy/
consent/DPA + observability.** The four CRITICALs (C1–C4) must be closed before
any public multi-user exposure; the open AI proxy (C1) and unprotected sensitive
data (C2) are the two that can cause immediate financial and legal harm.
