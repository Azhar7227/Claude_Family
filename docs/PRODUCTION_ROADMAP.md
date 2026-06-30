# LifeFlow — Master Production Roadmap

> The dependency-ordered plan to take LifeFlow from a single-user beta to a
> system that can safely serve 1,000,000 users. Derived directly from
> `docs/PRODUCTION_AUDIT.md`. Every Critical (C1–C4) and High (H1–H8) issue is
> scheduled exactly once, in the order its dependencies allow.
>
> **Complexity key:** S ≈ ≤1 eng-wk · M ≈ 1–3 · L ≈ 3–8 · XL ≈ 8+.
> Estimates assume a small senior team and are for *sequencing*, not contracts.

## Dependency graph (what truly blocks what)

```
                 ┌─────────────────────────────────────────────┐
   Identity (C3 minimal) ── unlocks ──> per-user rate limits/quotas (H2/H3)
        │                                   │
        ▼                                   ▼
  M1 Secure Public Beta ───────────────> requires identity + the metered gateway
        │           (C1,H2,H3,H4,H8 + min observability + min logging)
        ▼
  Server identity + encryption keys ──> M2 Private Data Protection
        │              (C2, C4 server-backup, retention, consent, M9)
        ▼
  Server system-of-record ───────────> M3 Multi-device Foundation
        │              (C3 full accounts, H5 sync, conflict res, H7 migrations)
        ▼
  M4 Scale-Ops (H6 full observability, H3 full cost, queueing/jobs for H2)
        ▼
  M5 1M Users (horizontal scale, caching, CDN, DB arch, multi-region, DR)
```

**Ordering note (engineering judgement):** the suggested grouping puts
observability in M4. That is too late. A *minimal* observability + alerting slice
(structured logs, error tracking, a spend alarm) must ship **inside M1** — you
cannot run a public beta blind to abuse or cost. M4 is where observability
becomes *comprehensive*. This is reflected below.

---

## Milestone 1 — Secure Public Beta
*Make the front door safe to open. Nothing here is optional before exposing the proxy to anyone but yourself.*

| Issue | Why it matters | What to build | Depends on | Cx | Risk if delayed | Unlocks |
|---|---|---|---|---|---|---|
| **C3 (min) Identity** | Every protection below needs to attribute a request to a principal. | Minimal auth (managed provider / magic-link / OAuth); signed session tokens; principal on every API call. | — | M | Can't rate-limit, quota, or isolate; everything downstream stalls. | Per-user limits, quotas, tenancy. |
| **C1 API protection** | Open proxy = instant budget drain + free LLM relay. | Auth-gated `/api/extract`; edge WAF; reject unauthenticated/oversized calls; fail-closed. | Identity | M | Catastrophic spend / abuse on day one of any public URL. | Safe public exposure. |
| **H2 Rate limiting + backoff** | Provider RPM/TPM limits and abuse both bite under load. | Token-bucket per user + global; 429/5xx exponential backoff + retry in adapters; shed load to on-device stub. | Identity | M | Outages and runaway retries under modest traffic. | Predictable behaviour under load. |
| **H3 (min) Spend limits** | Cost must be capped before it can run away. | Global + per-user token budgets; hard circuit-breaker that fails closed; daily spend alarm. | Identity, metering hook | M | One bad actor or bug = unbounded bill. | Cost safety; trust to launch. |
| **H4 Payload limits** | Unbounded body = trivial memory DoS. | Max body size; image-size caps; reject early at the edge. | — | S | Cheap denial-of-service. | Stable server under hostile input. |
| **H8 API key hardening** | One shared, unrotated key = single point of total exposure. | Per-environment keys in a secret manager; rotation; least-scope. | — | S | A leak exposes unbounded spend, hard to contain. | Containable blast radius. |
| **Min observability** | Can't run a public beta blind. | Structured request logs, error tracking, the spend alarm above, basic uptime check. | Identity | M | Silent abuse, cost spikes, and outages go unnoticed. | Operability of the beta. |

- **Engineering effort:** ~6–9 eng-weeks.
- **Biggest technical risk:** the metered AI gateway becoming a latency/availability bottleneck in front of every capture.
- **Biggest product risk:** auth friction at onboarding kills the "describe your life in 3 minutes" magic; keep sign-in near-zero-friction.
- **Success criteria:** a stranger with the URL cannot spend a cent or exceed quota; every call is attributed; a spend alarm fires in staging tests.
- **Exit criteria:** load/abuse test (unauth flood, oversized payloads, quota exhaustion) passes with fail-closed behaviour and alerts; cost is bounded by config.

## Milestone 2 — Private Data Protection
*We hold GDPR Art. 9 data (health, faith, children). This milestone is the legal and ethical license to operate.*

| Issue | Why it matters | What to build | Depends on | Cx | Risk if delayed | Unlocks |
|---|---|---|---|---|---|---|
| **C2 Encryption + consent + DPA** | Intimate data, unprotected, sent to third parties = legal/ethical exposure. | Encrypt sensitive fields at rest; explicit consent + privacy policy; signed DPAs + **zero-retention** provider configs; minimize/redact what's sent. | M1 identity, key mgmt | L | Regulatory action, breach severity, user-trust collapse. | Lawful processing; enterprise/region readiness. |
| **C4 Server backup** | Local-only = device loss is permanent loss. | Encrypted server-side backup as the durable record; client store becomes a cache. | M1 identity | L | Users lose their life data; "never lose data" is false. | M3 sync (needs a server record). |
| **H1 Surface write failures** | Silent quota failures already cause local loss. | Detect `DurableStore.save()` failure; warn + prompt export/prune; reconcile to server. | C4 | S | Heavy users silently lose data pre-sync. | Honest durability. |
| **Retention + deletion** | Data-subject rights; minimize liability. | Real "delete everything" incl. provider-side purge; retention windows; export already exists. | C2 | M | Non-compliance; unbounded data hoarding. | Compliance posture. |
| **M6 Region pinning** | EU data shouldn't leave the EU. | Region-routed provider endpoints + storage. | C2 | M | Residency violations for EU users. | EU launch. |
| **M9 Telemetry scrubbing** | `sourceSpan` carries raw user text. | Redact PII before any server-side trace persistence. | M1 observability | S | Privacy leak via logs. | Safe analytics. |

- **Engineering effort:** ~8–12 eng-weeks.
- **Biggest technical risk:** key management + encryption that doesn't break search/scheduling or sync; getting zero-retention guarantees from providers in writing.
- **Biggest product risk:** consent/permission walls feel heavy and depress activation; design them to be honest yet light.
- **Success criteria:** sensitive fields encrypted at rest; signed DPAs + zero-retention live; a real account-delete purges client, server, and provider logs; EU data stays in region.
- **Exit criteria:** a privacy/security review (ideally external) passes; documented data-flow + DPIA exist.

## Milestone 3 — Multi-device Foundation
*Turn "my device" into "my account." Requires the server record from M2.*

| Issue | Why it matters | What to build | Depends on | Cx | Risk if delayed | Unlocks |
|---|---|---|---|---|---|---|
| **C3 (full) Accounts** | Real users, profiles, multiple devices. | Full account system, device registration, session lifecycle. | M1, M2 | L | No real multi-device; churn on device switch. | Sync. |
| **H5 Sync engine** | Data is trapped per-browser. | Server source of truth + sync protocol; the existing ledger (`ai_actions`) is a natural op-log seed. | C4, Accounts | XL | Single-device ceiling caps the product. | Reliable cross-device. |
| **Conflict resolution** | Concurrent edits across devices/tabs (also fixes M5 multi-tab clobber). | LWW per-field or CRDT for the routine model; deterministic merge. | Sync engine | L | Lost edits, corruption, mistrust. | Confident concurrent use. |
| **H7 Schema migrations** | Version drift silently drops/corrupts data. | Versioned migrations + validation on load; refuse-and-recover on incompatibility; applies client and server. | Server record | M | Data corruption as the app evolves. | Safe iteration at scale. |

- **Engineering effort:** ~12–20 eng-weeks.
- **Biggest technical risk:** sync correctness under offline edits + conflicts — the classic hard problem; a wrong model loses data.
- **Biggest product risk:** sync that's *almost* right erodes trust faster than no sync; ship it boringly correct or not at all.
- **Success criteria:** edit on phone, see it on laptop within seconds; offline edits on two devices merge without loss; migrations run clean across versions.
- **Exit criteria:** adversarial sync test suite (offline/conflict/partial-failure) green; zero data-loss invariant holds.

## Milestone 4 — Scale-Ops
*Operate confidently as traffic grows. Mature what M1 started.*

| Issue | Why it matters | What to build | Depends on | Cx | Risk if delayed | Unlocks |
|---|---|---|---|---|---|---|
| **H6 Full observability** | At scale you must see everything. | Metrics, tracing, dashboards, SLOs, alerting; per-provider quality/latency/cost dashboards (the eval framework feeds this). | M1 min-obs | L | Blind to regressions, abuse, cost drift. | Data-driven operation. |
| **H3 (full) Cost monitoring** | Margins must be defended at volume. | Persisted per-user/per-model usage + cost; budget alerts; model-tier routing by complexity; extraction caching/dedup. | H6, gateway | M | Margin erosion; surprise bills. | Sustainable unit economics. |
| **Background jobs + queueing** | Decouple spiky AI/notification work; enables retries (H2). | Job queue for extraction, reminders, sync fan-out; backpressure. | M1 gateway | L | Latency spikes, lost work, retry storms. | Background push, batch work. |

- **Engineering effort:** ~10–16 eng-weeks.
- **Biggest technical risk:** queue/job semantics (exactly-once-ish, idempotency) interacting with sync.
- **Biggest product risk:** none direct — but invisible if cost/quality regressions slip; the dashboards *are* the product team's eyes.
- **Success criteria:** every request traceable; cost per active user known and alarmed; transient failures auto-recover via queue.
- **Exit criteria:** an injected provider outage degrades gracefully (queue + stub) with alerts and no data loss.

## Milestone 5 — 1M Users
*Only meaningful once retention is proven and M1–M4 hold.*

| Area | Why it matters | What to build | Depends on | Cx | Risk if delayed |
|---|---|---|---|---|---|
| Horizontal scaling | Single process won't hold 1M. | Stateless app tier + autoscaling. | M4 | L | Saturation, outages at growth. |
| Caching | Cut DB/provider load + latency. | Read caches; extraction-result cache; near-user reads. | M4 | M | Cost/latency blow-ups. |
| CDN + asset strategy | Fast global loads; fixes M2 stale-bundle. | Content-hashed assets, CDN, SW update flow. | — | S | Slow loads, stale-code bugs. |
| Database architecture | The system of record must scale. | Partitioning/sharding by tenant; read replicas; backups. | M3 record | XL | Hard ceiling; risky late migration. |
| Multi-region | Latency + residency at global scale. | Region-aware routing + replication. | DB arch, M2 region | XL | Poor global UX; residency gaps. |
| Disaster recovery | Survive the bad day. | Backups, RPO/RTO targets, tested restores, failover. | DB arch | L | Catastrophic, unrecoverable loss. |

- **Engineering effort:** ~6–12 eng-months.
- **Biggest technical risk:** the database/sharding architecture — the most expensive thing to get wrong late.
- **Biggest product risk:** building this *before* retention is proven — scaling a product nobody keeps.
- **Success criteria:** load tests at 1M-user traffic profiles within SLO; tested regional failover.
- **Exit criteria:** DR drill meets RPO/RTO; capacity headroom verified under projected peak.

---

## Five questions

### 1. What would you build differently if starting today?
- **Sync-ready storage from commit one.** Keep local-first (it was right for cheap validation), but use **IndexedDB** (async, larger quota, no main-thread block — fixes H1/M4 battery) and design records with stable ids + an op-log so the server tier is a *mirror*, not a rewrite. The ledger already hints at this; I'd formalize it.
- **A metered AI gateway from day one**, even for the solo beta — the open proxy was the one genuinely unsafe shortcut.
- **An incremental renderer** (or a small reactive lib) instead of full-DOM rebuild on every change.
- **Schema versioning + migrations as a discipline from the first commit**, not retrofitted.

### 2. Which architectural decisions have aged well?
- **Deterministic engine separated from the LLM** — the single best call; keeps cost, latency, correctness, and testability sane.
- **`AIProvider` port + config-only switching + a hard validation boundary** — made three providers and a benchmark drop-in, and means no vendor lock-in.
- **Proposal model + "no silent commit"** — the trust spine; it'll survive into the multi-user product unchanged.
- **The change ledger** — doubles as undo, the "why," and a sync op-log seed.
- **Canonical schema, zero runtime deps, tests-as-spec, eval framework** — all still load-bearing.

### 3. Which decisions should be reconsidered before public launch?
- **`localStorage` as system of record** → must become a cache over an encrypted server store (C4/H1).
- **The open proxy** → must be auth-gated, metered, rate-limited (C1) — non-negotiable.
- **Sending raw user text to third-party LLMs** → consent, DPAs, zero-retention, region pinning, redaction (C2).
- **Full-DOM re-render + 30s polling notifier** → incremental updates + event-driven scheduling (M1 battery).
- **Service-worker cache-first on a fixed key** → content-hashed assets + update flow (M2 stale bundle).
- **Single shared API key, no migrations** (H8/H7).

### 4. With only two engineers for a year, what would you postpone?
Postpone **all of M5** (multi-region, CDN, sharding, DR) and most of **M3** — two engineers don't have a 1M-user problem, they have a *does-anyone-keep-using-it* problem. Specifically defer: full sync/CRDT (ship **single primary device + robust export/import + encrypted server backup** instead), background-push infra maturity, native apps, family/couples, voice, analytics scores.
**Do:** M1 (secure beta), the C2+C4 essentials of M2 (encryption, consent, server backup, deletion), minimal observability, and — above all — **relentless work on capture quality and retention.** Protect the product, not the scale you don't have yet.

### 5. With $10M tomorrow, what would you build first?
In order: **(1) hire** a small senior team incl. security/privacy and an infra lead. **(2) Build the backend tier properly — M1→M3** (auth, multi-tenant encrypted storage, metered AI gateway, sync) since it's the foundation everything else needs. **(3) Turn on real models and run continuous evals** — fund the *capture-quality moat* (messy-input/OCR accuracy, eval-driven prompt/model selection); this is the actual differentiator. **(4) Close the two product painkillers**: reliable **background notifications** (push + native wrappers) and **real-AI capture quality**. **(5) Compliance early** (DPAs, DPIA, SOC 2 path) because you hold Art. 9 data. **(6) Observability + cost controls before growth.**
Explicitly **not** first: multi-region, CDN, sharding (premature), or breadth features (notes, family, analytics). Money should buy *trust and retention*, then scale — in that order.

---

## How to use this document

This is the master plan, but it is **sequenced, not scheduled**. Re-rank after
the 30-day beta with real signal: if retention is strong, fund M1→M3 hard; if
the magic isn't landing, **none of this matters** and the work is product, not
platform. Close C1 and C2 before any public URL regardless — they cause
immediate financial and legal harm. Everything else follows the dependency
graph.
