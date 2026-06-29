# LifeFlow AI — Product, Design & Architecture Plan

> An AI-powered **Life Operating System**. You describe your life; the AI plans, schedules, reminds, adapts, and optimizes it — so you spend almost zero time planning.

**Document status:** v0.1 planning baseline
**Audience:** founder, eng, design, future hires, investors
**Author posture:** Principal PM / Senior UX / Staff Architect. Opinionated on purpose.

---

## 0. TL;DR for the impatient

- **The vision is right; the scope is dangerous.** Trying to be ChatGPT + Calendar + Notion + TickTick + Reminders simultaneously is a positioning death trap. We win by being *the one app that owns your day and rebuilds it when life changes* — and nothing else, at first.
- **The hardest problem is trust, not NLP.** Modern LLMs already parse "gym after work, study Salesforce 1h." The reason apps like this fail is that an AI silently reshuffling your day, getting it 85% right, feels worse than a dumb to-do list that's 100% obedient. **The product is a trust-building machine before it is a scheduling engine.**
- **The wedge: the "I woke up late" moment.** The single most magical, defensible, demo-able feature is *adaptive re-planning*. No incumbent does this well. Build the MVP around that one loop.
- **Default to "AI proposes, you dispose."** Full autonomy is the *aspiration*, not the v1 default. Earn autonomy per-user, per-category, over time.

---

## 1. Product Critique (where this brief is wrong or risky)

I'm going to challenge the brief directly, because that's what was asked for.

### 1.1 "This is NOT a to-do app / habit tracker / calendar"
Positioning-wise, fine. But functionally, **it is all three plus an orchestration layer.** Pretending otherwise leads to skipping table-stakes (reliable recurring tasks, dependable notifications, two-way calendar sync). Users will judge us against TickTick and Google Calendar on reliability *first*, and only then care about the AI. **If the boring core is flaky, the AI magic never gets a chance.** Get the fundamentals boringly correct.

### 1.2 "Users should NOT create routines manually"
This is half right. The *insight* — most people won't grind through forms — is correct. But removing manual control entirely is a mistake:
- Power users (your highest-LTV, most vocal segment) **want** control.
- When the AI is wrong (and it will be), the user needs a fast, obvious manual override. If editing is buried, every AI error becomes a churn event.
- **Reframe:** "Users should never *have* to plan manually — but always *can*." Manual editing is the safety net that makes automation safe to trust.

### 1.3 "The AI should handle everything"
Three problems:
1. **Liability.** "Take medicine after breakfast," "prayer at 5:10," child pickup — these are high-stakes. A missed or mis-fired reminder isn't a bug, it's a betrayal. Health/medication features carry real regulatory and trust risk (see §18).
2. **Cost.** If every schedule tweak calls a frontier LLM, unit economics collapse at scale. Most re-planning must be **deterministic code**, with the LLM reserved for understanding and explanation (see §8).
3. **Latency & offline.** "What should I do right now?" must answer in <100ms, offline, on a phone. That cannot depend on a network round-trip to an LLM.

### 1.4 "Automatically rebuild the remaining day. Never require manual editing."
*Never* is the dangerous word. **Auto-applying changes to someone's day without consent is how you lose them.** The correct default: detect the disruption, compute a proposed re-plan, and surface it as a **one-tap accept** ("Running late? Here's your new day → Accept / Tweak / Keep as-is"). Over time, for users who always accept, graduate to silent auto-apply *with an undo and a visible change log*. Autonomy is **earned**, not assumed.

### 1.5 The unaddressed killers
- **Cold start.** A blank Life OS is intimidating. Day 1 must produce value in <3 minutes from one sentence.
- **Notification fatigue.** Water every 2h + 5 prayers + meds + habits + meetings + daily brief + night review = dozens of pings/day. This *will* get the app muted or deleted. Notification budgeting and batching are not optional (see §3, §7).
- **Privacy.** This app holds the most intimate dataset imaginable: health, religion, family, kids' schedules, location patterns. That's a target and a liability. Privacy must be a *feature*, not a footnote (see §6, §18).
- **The "energy" gap.** Real human days aren't just time-blocked; they're energy-blocked. Scheduling deep study at 11pm after a 9-hour workday is technically valid and humanly useless. The scheduler needs a simple energy/circadian model.

---

## 2. Missing Features (that the brief omits and a great product needs)

**Trust & control**
- **Undo / time-travel** on any AI change; visible **"why did this change?" ledger**.
- **Autonomy dial** per category: *Suggest* → *Confirm* → *Auto*.
- **Protected time** ("never schedule over 7–8pm family dinner").

**Scheduling intelligence**
- **Energy/circadian model** (peak focus windows; don't put hard tasks in slumps).
- **Task dependencies & sequencing** ("gym → shower → commute").
- **Travel/commute & timezone awareness**; auto-shift on travel.
- **Buffers & realistic estimates** (learn that your "1h study" is really 1h20m).
- **Two-way calendar sync** (Google/Apple/Outlook) — table stakes, not v3.

**Reliability & reach**
- **Offline-first** read + complete; sync on reconnect.
- **Multi-device sync** with conflict resolution.
- **Data export / portability** (build trust, ease GDPR).

**Engagement (healthy, not dark)**
- **Streaks with grace** (1 free miss/period — punishing streaks cause churn).
- **Weekly review ritual** (the retention backbone — see §3).
- **Quick capture** from anywhere (share sheet, widget, voice) → AI files it later.

**Accessibility & inclusion**
- Full screen-reader support, dynamic type, one-handed reach, color-blind-safe palettes.
- **Localization** of time, calendars (Hijri/lunar), languages — prayer times by geolocation, not hardcoded.

---

## 3. UX Improvements

1. **Home answers exactly one question.** Keep the brief's instinct: "What should I do *right now*?" Current task hero card, a peek at next + after, a giant Complete button, remaining time. Everything else is one tap away. Resist the urge to add widgets here.
2. **AI proposes, you dispose.** Every AI-generated plan lands in a **review preview** with diff highlighting (added / moved / shortened) and one-tap **Accept all**. This single pattern is what makes "the AI runs my life" *feel safe*.
3. **Conversational, not form-driven onboarding.** One text/voice box: "Tell me about your life." Stream the schedule being built live. Time-to-value < 3 min.
4. **Notification budget.** A user-set daily ceiling. The system **batches** low-priority pings (e.g., a single "habit check-in" bundling water/supplements) and protects high-priority ones (meds, pickup, meetings). Adaptive: learn what gets dismissed and suppress it.
5. **Friction-right completion.** Swipe/tap to complete; voice complete ("done with gym"); auto-complete fixed calendar events. Missing a task should be *one tap to reschedule*, never a guilt wall.
6. **Explainability is a UX surface.** "Workout moved to 7pm because you woke at 7am and your 10am meeting is fixed." Short, causal, dismissable. This is the feature that converts skeptics.
7. **The Weekly Review** is the habit that retains. A 60-second Sunday ritual: what worked, what slipped, one suggested tweak, accept → next week is better. This is the compounding-value loop.

---

## 4. Information Architecture

Five top-level destinations. No more. (Tab bar / nav rail.)

```
┌─────────────────────────────────────────────────────────────┐
│  Today        Plan        Add(+)        Habits        You      │
└─────────────────────────────────────────────────────────────┘
```

- **Today** (home): right-now card, timeline of the day, adaptive re-plan banner, daily brief entry.
- **Plan**: week/month timeline, calendar overlay, goals & milestones, drag-to-edit.
- **Add (+)** — the AI front door: Chat · Voice · Upload · Paste · Goal Builder (the 5 input methods).
- **Habits**: habit grid, streaks, health metrics & charts.
- **You**: profile, family/partner, autonomy settings, notifications, privacy, integrations, analytics scores.

**Cross-cutting overlays:** AI Review/Preview (diff), Conflict Resolver, Daily Brief, Night Review, Quick Capture.

**IA principle:** the 5 input methods are *one destination* (Add), not 5 tabs. The user picks the method; the output (a reviewable plan) is identical across all of them. This keeps the surface area sane and lets the back end converge on one pipeline.

---

## 5. Core User Flows

### 5.1 Onboarding → first schedule
1. Open app → single prompt: "Describe your life in a few sentences (or talk to me)."
2. User: *"I work Mon–Fri 9–6, want to wake at 5, gym after work, study Salesforce 1h/day, pray 5x."*
3. AI streams a parsed structure (fixed vs flexible) → builds a candidate week.
4. **Review preview** with conflicts flagged + suggestions.
5. Accept → schedule, recurrences, habits, reminders created. **< 3 min to value.**

### 5.2 The hero loop — "I woke up late"
1. Signal: missed wake reminder / late first completion / manual "I'm running late."
2. Engine recomputes remaining day deterministically (fixed events frozen, flexible compressed/moved by priority + energy).
3. Banner: **"Rough start? Here's your adjusted day."** → Accept / Tweak / Dismiss.
4. If accepted, timeline animates to new state; ledger records the why.
5. Learn: user who always accepts → offer "auto-adjust mornings for you?"

### 5.3 Upload a schedule (file → routine)
1. Add → Upload (PDF/image/.ics/csv/xlsx/handwritten).
2. Ingest → OCR/parse → LLM extraction to canonical schema (task, start, end, repeat, priority, person, category, notes).
3. Editable preview table + conflict detection + improvement suggestions.
4. Confirm → generate recurring tasks, habits, notifications, timeline, partner sync.

### 5.4 Goal Builder
1. "What do you want to achieve?" → "Become a Salesforce Architect."
2. AI asks 2–4 smart follow-ups (deadline, hours/week, current level).
3. Generates milestones → weekly plan → daily focus sessions → habits → reminders. All editable.

### 5.5 Family/partner
1. Invite partner → shared space.
2. Shared tasks/habits/calendar; assignment to a person (incl. kids).
3. Partner notifications on shared-item changes; respect each person's notification budget.

---

## 6. Database Design

Postgres as system of record (relational integrity matters for scheduling), Redis for hot reads/locks, object storage for uploads. Below is the conceptual model (simplified; omit indexes/audit columns for clarity).

```
users(id, email, locale, timezone, created_at, ...)
households(id, name, type[single|couple|family])
memberships(id, household_id, user_id, role)        -- a user can be in many
people(id, household_id, user_id?, name, kind[adult|child], dob?)  -- kids may have no login

life_context(id, user_id, key, value_json)           -- "works 9-6", "prays 5x", goals as facts
                                                     -- the durable "memory" the AI plans from

goals(id, owner_id, title, target_metric?, target_value?, deadline?, status)
milestones(id, goal_id, title, due_date, status)

tasks(id, household_id, created_by, assignee_person_id, title, category,
      type[fixed|flexible], priority, est_duration_min, energy[low|med|high],
      protected bool, source[chat|voice|upload|paste|goal|manual], notes)

recurrence_rules(id, task_id, rrule_text, timezone, exdates_json)  -- iCal RRULE

occurrences(id, task_id, scheduled_start, scheduled_end, status
            [planned|done|missed|skipped|moved], completed_at, original_start)
            -- the materialized timeline; what "Today" reads. Source of truth for adaptivity.

habits(id, owner_id, title, cadence[daily|weekly|monthly|yearly], target_count, unit)
habit_logs(id, habit_id, date, count, value)

health_metrics(id, user_id, kind[weight|calories|protein|water|sleep], value, unit, ts)

reminders(id, occurrence_id?, habit_id?, offset_min, channel, snooze_until, state)
notifications_log(id, user_id, type, sent_at, interaction[dismissed|acted|snoozed])

calendar_integrations(id, user_id, provider, external_cal_id, sync_token, scopes)

ai_actions(id, user_id, kind[parse|replan|suggest], input_ref, proposal_json,
           status[proposed|accepted|rejected|auto_applied], applied_at)
           -- the trust ledger + undo source + training/eval data

uploads(id, user_id, storage_key, mime, ocr_text, parse_result_json, status)
```

**Key design decisions & why:**
- **`occurrences` is materialized**, not computed on the fly. Adaptive re-planning needs a concrete, editable day to mutate; "right now?" must be an indexed point-query, not an RRULE expansion at request time. Materialize a rolling window (e.g., next 30–60 days), expand lazily beyond.
- **`life_context` as durable facts** is the AI's long-term memory. The LLM reads these to plan; it doesn't re-derive your life from chat history every time (cheaper, more consistent).
- **`ai_actions` is the trust backbone**: it powers the change ledger, undo, the "why," and later becomes your eval/training dataset. Don't bolt this on later.
- **Soft state machine on `occurrences.status`** (planned→done/missed/skipped/moved) drives both adaptivity and analytics.
- **People ≠ users** so kids (no account) can own tasks/habits.

**Privacy:** health, religion, and children's data are special categories under GDPR Art. 9 / regional laws. Encrypt at rest (column-level for sensitive fields), strict tenancy isolation by `household_id`, regional data residency option, and a hard "export & delete everything" path.

---

## 7. System Architecture

```
        ┌──────────────────────────────────────────────────────────┐
        │  Clients: iOS / Android (offline-first), Web (PWA)         │
        │  Local store + sync engine; <100ms "right now" answered    │
        │  on-device                                                 │
        └───────────────┬──────────────────────────────────────────┘
                        │  (REST/GraphQL + WebSocket for live updates)
        ┌───────────────▼──────────────────────────────────────────┐
        │  API Gateway / BFF  (auth, rate-limit, tenancy)            │
        └───┬───────────┬───────────────┬───────────────┬───────────┘
            │           │               │               │
    ┌───────▼──┐ ┌──────▼─────┐ ┌───────▼──────┐ ┌──────▼────────┐
    │ Core svc │ │ Scheduler  │ │ AI Orchestr. │ │ Ingestion svc │
    │ tasks/   │ │ engine     │ │ (LLM calls,  │ │ OCR/parse     │
    │ habits/  │ │ (deterministic│ tools, prompts)│ uploads      │
    │ health   │ │ re-plan)   │ │              │ │               │
    └────┬─────┘ └─────┬──────┘ └──────┬───────┘ └──────┬────────┘
         │             │               │                │
    ┌────▼─────────────▼───────────────▼────────────────▼─────────┐
    │ Postgres (SoR) · Redis (cache/locks) · Object store (uploads)│
    │ Vector store (semantic memory) · Event bus (Kafka/NATS)      │
    └───────────────────────────┬─────────────────────────────────┘
                                │
              ┌─────────────────▼─────────────────┐
              │ Workers: notifications scheduler,  │
              │ calendar sync, daily brief / night │
              │ review cron, re-plan triggers      │
              └────────────────────────────────────┘
```

**Principles:**
- **Offline-first clients.** The "what now?" query and task completion work with zero network. Sync is a background reconciliation (last-write-wins per field + server merge for schedule conflicts).
- **Deterministic scheduler is separate from the LLM.** The scheduler is plain, testable, fast code (constraint solver). The LLM *understands and explains*; it does not do the minute-by-minute math. This is the single most important architectural call — it controls cost, latency, and correctness.
- **Event-driven re-planning.** "Missed wake reminder," "task completed late," "new fixed meeting" emit events; the scheduler reacts and produces a *proposal* (not an applied change) unless autonomy is granted.
- **Notification worker enforces the budget** centrally — batching/suppression logic lives in one place, not scattered across features.

---

## 8. AI Architecture

The core architectural belief: **LLM for language, deterministic engine for scheduling.** Treat the LLM as a translator between human intent and a structured plan, and as an explainer — never as the thing that owns time-math at runtime.

### 8.1 Layers
1. **Understanding layer (LLM).** Natural language / voice / OCR text / pasted text → **canonical intents** (create task, set goal, define constraint, log habit) via structured output / function-calling with a strict JSON schema. One pipeline; all 5 input methods converge here.
2. **Memory layer.** `life_context` facts + vector store of past interactions → injected as grounded context so the model plans against *this* user, not a generic one.
3. **Planning layer (deterministic).** A constraint-based scheduler: fixed events are hard constraints; flexible tasks are placed by priority, energy window, dependencies, buffers, and protected time. Re-planning is a re-solve over the remaining horizon. Fast, explainable, unit-testable, **free**.
4. **Explanation layer (LLM, cheap/async).** Turn the solver's diff into a human sentence: "Moved workout to 7pm because…". Cache aggressively; many explanations are templatable without an LLM at all.
5. **Coaching layer (LLM).** Daily brief, night review, goal follow-ups, motivational nudges — bounded, scheduled, batched.

### 8.2 Cost & reliability controls
- **Tiered models:** small/cheap model for routine parsing & classification; frontier model only for ambiguous parsing, goal decomposition, and coaching. Route by confidence.
- **Cache & template** explanations and briefs; don't pay per token for boilerplate.
- **Strict structured output + validation;** reject/repair malformed plans before they ever touch the user's schedule.
- **Confidence gating:** low-confidence parses go to the review preview with the ambiguous field highlighted, not silently committed.
- **Guardrails for high-stakes items** (meds, prayer, pickup): the LLM may *propose*, but timing changes to these require explicit confirmation regardless of autonomy level.
- **Evals:** a golden set of "life descriptions → expected schedules" and "disruption → expected re-plan" run in CI. `ai_actions` accept/reject data feeds continuous eval.

---

## 9. API Design (representative)

REST-ish; GraphQL acceptable for the read-heavy timeline. All endpoints tenant-scoped.

```
POST   /v1/ingest                 # {method: chat|voice|paste|upload, payload}
                                  #  → {ai_action_id, proposal}   (never auto-commits by default)
POST   /v1/ai-actions/{id}/accept # commit a proposal (whole or partial diff)
POST   /v1/ai-actions/{id}/reject
GET    /v1/today                  # right-now + next + after + remaining time (fast, cacheable)
GET    /v1/timeline?from&to       # occurrences in range
POST   /v1/occurrences/{id}/complete | /skip | /reschedule
POST   /v1/replan                 # {trigger: woke_late|missed|manual} → proposal
GET    /v1/goals  POST /v1/goals  # goal builder
POST   /v1/goals/{id}/plan        # generate milestones + schedule
CRUD   /v1/tasks /v1/habits /v1/reminders /v1/health-metrics
POST   /v1/habits/{id}/log
GET    /v1/brief/daily  GET /v1/review/nightly
CRUD   /v1/household /v1/people /v1/integrations/calendar
GET    /v1/analytics/scores       # routine/health/habit/focus/productivity/consistency
POST   /v1/export   DELETE /v1/account   # portability + right-to-be-forgotten
```

**Conventions:** idempotency keys on mutations (offline retries), cursor pagination on timeline, ETags on `/today`, webhooks for calendar push sync, everything emits domain events to the bus.

**Why `/ingest` returns a proposal, not a commit:** this single design choice operationalizes "AI proposes, you dispose" at the API layer, so no client can accidentally make the product feel like it's hijacking the user's day.

---

## 10. Screen-by-Screen Wireframes (low-fi)

**Today (home)**
```
┌───────────────────────────────┐
│  Good morning, Azhar      ☼7:02│
│ ┌───────────────────────────┐ │
│ │  NOW · Deep Work: Salesforce│ │   ← hero card
│ │  9:00–10:00 · 38 min left   │ │
│ │        [ ✓  Complete ]      │ │   ← single primary action
│ └───────────────────────────┘ │
│  Next  10:15  Standup (fixed)  │
│  After 11:00  Gym (flexible)   │
│ ─────────────────────────────  │
│ ⚡ Rough start? Tap to see your │   ← adaptive re-plan banner
│    adjusted day  [Review]       │
│ ─────────────────────────────  │
│  ◷ Timeline ▸   ☼ Daily brief ▸│
└───────────────────────────────┘
```

**Add (AI front door)**
```
┌───────────────────────────────┐
│  What can I plan for you?       │
│ ┌───────────────────────────┐ │
│ │ Type or speak…          🎙 │ │
│ └───────────────────────────┘ │
│  [💬 Chat] [📄 Upload] [📋 Paste]│
│  [🎯 Goal Builder]              │
└───────────────────────────────┘
```

**AI Review / Preview (the trust screen)**
```
┌───────────────────────────────┐
│  Here's your plan ✦ review it  │
│  + Study Salesforce 8–9pm  NEW │
│  ~ Gym  6pm → 7pm        MOVED │
│  ⚠ Conflict: Gym vs Dinner 7pm │
│     [Keep dinner] [Keep gym]   │
│  ───────────────────────────  │
│  [ Accept all ]  [ Tweak ]     │
└───────────────────────────────┘
```

**Habits**
```
┌───────────────────────────────┐
│  Today's habits      4/7 done  │
│  💧 Water    ▓▓▓▓▓░░  5/8       │
│  🥚 Protein  ▓▓▓░░░░  done      │
│  🕌 Prayer   ●●●○○  Asr next    │
│  🏋 Gym      ✓     🔥 12-day    │
│  + Add habit                    │
└───────────────────────────────┘
```

Plus: Goal Builder (chat-style Q&A), Upload preview table, Daily Brief card, Night Review summary, You/Settings with the **Autonomy dial** front and center.

---

## 11. Design System

- **Foundation:** Material Design 3 on Android, fluid to Apple HIG feel on iOS; shared design tokens so brand is consistent, platform behaviors are native. Don't ship one cross-platform skin that feels foreign on both.
- **Tokens:** color (semantic: surface/primary/success/warn/critical), type scale, spacing (8pt grid), radius (large, soft — premium feel), elevation, motion (durations/easing).
- **Type:** one humanist sans (e.g., Inter/SF), large readable hero numerals for time.
- **Components:** hero task card, timeline blocks (color by category), diff rows (added/moved/removed), habit ring, score gauge, autonomy dial, conflict chip, brief/review cards.
- **Motion:** purposeful, fast (150–250ms); re-plan = animated reflow so the user *sees* the day change (builds trust). No gratuitous animation.
- **Dark/light** first-class from day one. **Accessibility:** WCAG AA contrast, dynamic type, full screen-reader labels, one-handed bottom-reach for primary actions, color never the sole signal.

---

## 12. Development Roadmap

- **Phase 0 (Weeks 0–3):** schema, auth/tenancy, deterministic scheduler skeleton, `occurrences` model, offline store, CI + eval harness scaffold.
- **Phase 1 — MVP (Weeks 3–12):** chat ingest → proposal → review → commit; Today screen; recurring tasks + reliable notifications; the **adaptive re-plan loop**; basic habits. *(see §13)*
- **Phase 2 (Q2):** voice, upload/OCR, Goal Builder, two-way Google Calendar sync, weekly review, health metrics & charts.
- **Phase 3 (Q3):** family/partner sync, children, autonomy graduation (earned auto-apply), notification budgeting v2, analytics scores, Apple/Outlook calendar.
- **Phase 4 (Q4+):** proactive coaching, integrations (wearables, Salesforce/learning), web app polish, monetization surfaces.

Each phase ships something a user would pay for; no "platform quarter" with nothing to show.

---

## 13. MVP Definition (ruthless)

**The MVP is one sentence:** *Describe your week in chat, get a real schedule, and when you fall behind, the app rebuilds your day with one tap.*

In:
- **Chat ingest** (one input method — not five) → structured proposal → **review preview** → commit.
- **Today** screen (right-now / next / after / complete / remaining time).
- **Reliable recurring tasks + notifications** (the boring core, done well).
- **Adaptive re-planning** — the hero loop. This is the wedge; without it we're a worse TickTick.
- Basic **habits** (daily, streak with grace).
- Manual edit everywhere as the safety net.

Out (deliberately deferred): voice, file upload/OCR, family/partner, full health suite, Goal Builder, analytics scores, multiple calendars. **Cutting these is the plan, not a compromise.** Each is a Phase 2/3 wedge expansion once the core loop retains.

**MVP success metric:** of users who hit a "fell behind" moment, what % accept the re-plan and return next day? That number tells us if the magic is real.

---

## 14. Version 2

Voice-first capture; file/OCR ingestion (the "upload your school timetable" wow); Goal Builder with milestone decomposition; two-way Google Calendar sync; weekly review ritual; health metrics + charts; notification budgeting. *Theme: meet users where their existing data lives, and deepen the daily habit.*

## 15. Version 3

Family/partner/children sharing; earned autonomy (silent auto-apply with ledger + undo); the six analytics scores; proactive AI coaching; wearable & calendar ecosystem; web app at parity. *Theme: from "my Life OS" to "our Life OS," and from assistant to coach.*

---

## 16. Monetization Strategy

- **Free tier:** chat ingest, Today, basic habits, manual editing, limited AI actions/month. Enough to fall in love; metered where AI cost is real.
- **Pro (~$7–10/mo):** unlimited AI actions, voice, upload/OCR, Goal Builder, calendar sync, full health, analytics, autonomy graduation.
- **Family (~$13–18/mo):** everything + shared spaces, kids, partner sync. *(Families have low churn and high word-of-mouth — the best LTV segment.)*
- **Later:** B2B2C wellness/corporate, anonymized aggregate insights (privacy-preserving only), partner integrations.
- **Anti-pattern to avoid:** charging per AI message. It punishes the core behavior we want. Gate on *features and limits*, not on talking to the assistant.
- **Cost guardrail:** because re-planning is deterministic (free) and explanations are cached, the marginal AI cost per active user stays bounded — protecting margins at 10M users.

---

## 17. Go-To-Market

- **Wedge audience:** ambitious, busy people whose days get blown up — founders, parents, students, shift workers. Lead with the *"I woke up late and the app fixed my day"* demo. It's a 10-second video that sells itself.
- **Channels:** short-form video (the re-plan animation is inherently demo-able), communities (productivity, faith-based for prayer scheduling, parenting), creator partnerships.
- **Onboarding as acquisition:** "describe your life, get a plan in 3 minutes" is shareable. Make the output exportable/shareable.
- **Land-and-expand:** single user → invites partner/family → household plan.

---

## 18. Risks

- **Trust collapse** from a single wrong high-stakes change (missed med, wrong pickup time). *Mitigation:* high-stakes guardrails, propose-don't-apply default, undo + ledger.
- **Privacy/regulatory:** Art. 9 sensitive data (health, religion, children). *Mitigation:* encryption, data residency, export/delete, minimal retention, no training on personal data without explicit opt-in. **Do not position as a medical device**; medication = reminders, not advice.
- **Notification fatigue → uninstall.** *Mitigation:* budget + batching + adaptive suppression from day one.
- **AI cost blowup at scale.** *Mitigation:* deterministic scheduler, tiered models, caching, confidence routing.
- **Scope creep** (the original brief). *Mitigation:* the ruthless MVP in §13; say no loudly.
- **Reliability of the boring core.** Flaky recurrence/notifications kill credibility before AI matters. *Mitigation:* treat the scheduler/notification engine as the most-tested code in the system.
- **Platform dependence** (calendar APIs, model providers). *Mitigation:* abstraction layers; multi-provider model routing.

---

## 19. Improvements & Open Questions

- **Energy model**: start simple (user tags peak hours; learn from completion patterns) before anything fancy.
- **Estimation learning**: track planned vs actual durations; quietly correct future plans.
- **"Protected time" as a first-class constraint** the user defines in onboarding (family dinner, sleep, prayer).
- **Open Q:** how aggressive should default autonomy be for a brand-new user? *Recommendation:* fully manual-confirm for week 1, then offer graduation based on accept rate.
- **Open Q:** do we expand to file-upload or voice first in v2? *Recommendation:* voice (lower build cost, higher daily-use frequency) before OCR (higher wow, lower frequency).

---

## 20. Implementation Plan (after sign-off)

Build order follows §13, smallest shippable slices first:

1. **Repo & foundations** — monorepo, schema + migrations, auth/tenancy, CI, eval harness scaffold.
2. **Core domain** — tasks, recurrence (RRULE), `occurrences` materialization, completion state machine.
3. **Deterministic scheduler** — constraint placement + re-solve; unit tests as the spec.
4. **Ingest pipeline** — chat → structured intents (LLM, schema-validated) → proposal.
5. **Review/commit** — `ai_actions`, diff preview, accept/reject, undo + ledger.
6. **Today screen** — offline-first read, complete, remaining-time.
7. **Notifications** — reliable scheduling + budget/batching skeleton.
8. **Adaptive re-plan loop** — triggers → proposal → one-tap accept (the wedge).
9. **Habits** — basic daily + streak-with-grace.
10. Harden, instrument the MVP success metric, ship to beta.

> **I will not start coding until this plan is signed off.** When you approve (or amend) §13's MVP scope, I'll begin at step 1 and build feature-by-feature, committing each slice.
```
