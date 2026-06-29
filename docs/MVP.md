# LifeFlow AI — The Payable MVP

> Long-term vision stays: an AI Life Operating System. This document defines the **smallest thing we can ship that people will pay for**, and the one feature that makes us not-a-feature-of-Google-Calendar.

---

## 1. The single differentiating feature

**Adaptive day re-planning — "I fell behind, fix my day."**

When real life breaks your plan (you wake up late, a meeting runs over, you skip the gym), LifeFlow **automatically rebuilds the rest of your day in one tap** — freezing what's fixed, compressing and re-ordering what's flexible, and telling you *why*.

### Why this, and not anything else
Look at what each incumbent refuses to do:

| Product | What it does | What it will **never** do for you |
|---|---|---|
| **Google / Apple Calendar** | Stores events you place | Re-arrange your day when you fall behind |
| **Apple Reminders / TickTick** | Lists tasks, fires alarms | Decide *when* a task should happen, or move it when reality shifts |
| **ChatGPT** | Talks, can draft a plan | Hold persistent state, fire reliable reminders, react to your real day |

Every one of them is a **static container**. You do the planning; they store it. The moment your day deviates from the plan — which is *every day* — they're dead weight, and you re-plan in your head.

**LifeFlow's wedge is the re-plan.** It's the one job none of them do, it's needed daily, and it's instantly demo-able ("I overslept → one tap → my whole day is fixed"). That's a feature people pay to keep, not a novelty they try once.

> Note this is deliberately **not** "AI understands natural language." LLMs parsing "gym after work" is now a commodity — ChatGPT does it, so it can't be our moat. Our moat is the *stateful, reactive scheduling loop* wrapped around the parse.

---

## 2. The MVP in one sentence

**Tell LifeFlow your week in plain language; it builds a real schedule with reliable reminders; and when you fall behind, it rebuilds the rest of your day in one tap and explains what changed.**

---

## 3. What's IN (and why each earns its place)

Every feature below is load-bearing for the differentiator. If a feature doesn't directly serve the re-plan loop or make it trustworthy, it's cut (see §4).

| # | Feature | Why it's mandatory (not optional) |
|---|---|---|
| 1 | **Chat ingest → schedule** (one input method) | The only on-ramp. Without natural-language input we're a form-based planner and onboarding dies. *One* method (text chat) — voice/upload/paste are the same value at higher build cost. |
| 2 | **Fixed vs. flexible task model** | This distinction *is* the re-plan engine. Fixed = hard constraints (meeting, prayer, pickup); flexible = movable (study, gym). No split, no intelligent re-plan — just dumb shuffling. |
| 3 | **Reliable recurring tasks + notifications** | The boring core. If reminders are flaky, nobody trusts us with their day and the AI never gets a chance. This is table stakes we must out-execute, not skip. |
| 4 | **Today screen** ("what now / next / after / complete") | The daily-use surface. Answers one question instantly, offline. It's why they open the app every morning. |
| 5 | **★ Adaptive re-plan loop** | **The product.** Trigger (late/missed) → deterministic re-solve → one-tap Accept. Everything else exists to make this moment possible and trustworthy. |
| 6 | **Review-before-apply + "why" explanation** | The trust mechanism. The re-plan only feels safe if you see the diff and the reason before it commits. Without this, an AI moving your day feels like an attack, not help. |
| 7 | **Manual edit / undo everywhere** | The safety net. The AI *will* be wrong sometimes; if correcting it is hard, every error is a churn event. Cheap to build, essential for trust. |

That's it. **Seven features, one loop.** Each one is either the differentiator or a direct prerequisite for trusting it.

---

## 4. What's OUT (and the trade-off accepted)

Cutting these is the strategy, not a compromise. Each is a real v2/v3 wedge — just not what proves the core loop.

| Cut feature | Why it's deferred | Trade-off we accept |
|---|---|---|
| **Voice, file upload/OCR, copy-paste** | Same outcome as chat (a parsed schedule) at far higher build/maintenance cost. They widen the funnel; they don't prove the loop. | Lose the "upload my school timetable" wow demo. Acceptable — chat proves the thesis cheaper. |
| **Goal Builder** | Powerful, but it's a *second* product (long-horizon coaching) layered on a scheduler that must work first. | Lose aspirational "become a Salesforce Architect" framing. We earn the right to it after daily retention. |
| **Family / partner / children sync** | Multiplies data model, permissions, notification, and privacy complexity. Best LTV segment — but only once the single-user loop retains. | No household plan revenue at launch. Accept: prove value for one person first. |
| **Full health suite (weight/calories/protein/charts)** | A whole analytics product; also raises regulatory/sensitivity stakes. Habits cover the daily-tracking need minimally. | Lose the "health dashboard." Basic habits bridge it. |
| **6 analytics scores** | Vanity until there's enough history to be meaningful, and a build cost with no day-1 retention payoff. | No scores screen. We instrument *one* real metric instead (§6). |
| **Two-way calendar sync** | High value, but a deep, fragile integration (auth, sync tokens, conflict merge). Strong v2 wedge once the core is solid. | Users double-enter fixed events at first. Painful but survivable for the beta cohort. |
| **Multi-input, autonomy graduation, coaching, web parity** | All depend on the core loop being proven and trusted first. | Slower path to "full autonomy" vision. Correct sequencing. |

**The honest cost of this MVP:** it will look *modest* next to the original brief, and a casual observer might say "that's just a smart to-do app." That's the risk we accept — because the re-plan loop, done well, is something they've never felt before, and it's what we measure (§6). Breadth without that loop would be a worse TickTick.

---

## 5. Would people actually pay? (the test)

A free Today-screen-with-reminders is a commodity. The **paid** line sits exactly at the differentiator:

- **Free:** chat ingest, Today, reliable reminders, basic habits, manual edit. Limited AI actions/month. Enough to fall in love.
- **Pro (~$7–9/mo):** unlimited AI actions + the **adaptive re-plan loop**. You pay for the app that fixes your day when life breaks it.

We gate on the *feature that's unique*, not on "talking to AI" (which would punish the behavior we want). If people won't pay to keep the re-plan, the thesis is wrong — and we want to learn that with 7 features, not 40.

---

## 6. The one metric that proves the MVP

> **Re-plan acceptance & return rate:** of users who hit a "fell behind" moment, what % accept the proposed re-plan *and* open the app the next day?

If that number is high, the magic is real and we expand the funnel (voice, upload, goals, family). If it's low, no amount of extra features saves us — and we've learned it cheaply. Every other metric is secondary at this stage.

---

## 7. Build order (smallest shippable slices)

1. Schema + fixed/flexible task model + recurrence + materialized `occurrences`.
2. Deterministic scheduler (constraint placement + re-solve). *Unit tests are the spec.*
3. Chat ingest → schema-validated structured proposal (LLM for language only).
4. Review → accept/commit + undo + "why" explanation.
5. Today screen (offline-first read + complete).
6. Reliable recurring notifications.
7. **Adaptive re-plan loop** wired end-to-end (the wedge).
8. Basic habits (daily + streak-with-grace).
9. Instrument the §6 metric; ship to beta.

**Architectural non-negotiable:** the scheduler is deterministic code; the LLM only translates language → structure and structure → explanation. This keeps the re-plan fast, free, testable, and correct — and protects unit economics at scale.

---

**Decision needed from you:** approve this 7-feature scope (or tell me what to add/cut), and I'll start at build step 1, feature by feature.
