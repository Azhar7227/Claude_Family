# Contradiction Corpus — can the ontology represent conflict?

> 200+ real-world conflicting routine descriptions, categorized by conflict type.
> The question is **representation**, not detection: can the data model hold *both
> sides* of each conflict as distinct, comparable entities so the conflict is at
> least *expressible*? Detecting and resolving conflicts is the scheduling
> engine's job; making the two sides comparable is normalization's job. For every
> failure we say which of the three layers it belongs to. No code.

## The three-layer lens (used throughout)

- **Ontology** — can both conflicting facts be *stored* as separate, typed
  entities? (representation)
- **Normalization** — are the two sides made *comparable* (bands → times,
  relative anchors resolved, dedupe) so a conflict is even visible?
- **Scheduling engine** — does it *detect* the overlap and *resolve* it (overlap,
  fixed > flexible, protected, capacity, reflow)?

A conflict can be perfectly representable yet undetected (engine gap), or
detectable in principle but invisible because the inputs were never normalized
to a common form (normalization gap), or simply unstorable (ontology gap).

## Bottom line (read first)

Of six conflict types, the ontology **fully represents four** (time, priority,
recurrence, protected — with one wiring caveat) and **cannot represent two**
(constraint conflicts, dependency/ordering conflicts). Those two failures are the
*same two gaps* the ontology-validation exercise surfaced independently —
**`constraints` as a top-level concept** and a **relative-anchor field on items** —
which strongly corroborates that those, and only those, are load-bearing. The
remaining issues are engine (rotating recurrence, protected item→block wiring,
recurring-conflict summarization) and normalization (relative-time comparability),
**not** new ontology.

---

## A. Time conflicts (direct overlap of two timed things)
*Representation: ✅ ontology · Detection: ✅ engine (overlap / fixed_collision) · Comparability: ✅ normalization (bands→times)*

1. Gym at 6pm ✕ Client call at 6pm
2. Standup 9:30 ✕ School drop-off runs 9:20–9:45
3. Lunch with Sara 1pm ✕ Dentist 1pm
4. Morning run 6–7 ✕ Fajr at ~5:50 (overlaps the tail)
5. Yoga 6pm ✕ Pick up kids 5:45–6:30
6. Deep work 9–12 ✕ Investor call 11am
7. Piano 10am Sat ✕ Grocery run 10am Sat
8. Therapy 2pm ✕ 1:1 with manager 2pm
9. Nap 2pm ✕ Pharmacy delivery window 1–3
10. Choir 7pm ✕ Bible study 7pm (same night)
11. Commute leaves 8:15 ✕ Baby's feed 8:00–8:20
12. Coworking 9am ✕ Spanish lesson 9am
13. Iftar at sunset ✕ Standup at 6pm (in summer they coincide)
14. Soccer practice 4pm ✕ Physiotherapy 4pm
15. Gym at lunch ✕ Team lunch last Friday
16. Date night 8pm ✕ On-call escalation 8pm
17. Walk the dog 6pm ✕ Maghrib at ~6pm
18. Sprint planning 10am ✕ Pediatrician 10am
19. Study 8pm ✕ Family movie night 8pm Friday
20. Blood sugar check at 12 ✕ Lunch meeting 12
21. Meds at 8am ✕ Gym before shift 7:30–8:30
22. Office 9–6 ✕ Kid's recital 3pm
23. Carpool 7:45 ✕ Morning devotional 7:30–7:50
24. Stretch at wake 6am ✕ Baby wakes 5:45–6:30
25. Coffee 7am ✕ Train at 7:00
26. Pottery Thu 4 ✕ Carer support group Thu 4
27. Read to kids 8pm ✕ Choir practice 7–8:30
28. Gym 6am ✕ Fajr 5:50 (overlap)
29. Client review 3pm ✕ School pickup 3:10
30. Walk after lunch 1:30 ✕ Customer call 1:30
31. Suhoor before dawn ✕ Night shift ends 7am (sleep window)
32. Volunteer 10am Sat ✕ Kids' soccer 10am Sat
33. Weekly review 3:30 Fri ✕ Prayer (Asr) ~3:30
34. Meal prep Sunday 11 ✕ Church 10–11:30

**Verdict:** fully handled. Each side is an `item` with a (normalized) time;
overlap detection fires on materialized occurrences. The only soft spot: items
left "anytime"/flexible-with-no-time can't conflict until the scheduler *places*
them — which is correct behaviour, not a gap.

## B. Priority conflicts (both claimed important; can't both fit)
*Representation: ✅ (absolute `priority` 1–5, `protected`) · Resolution: ✅ engine reflow uses priority · Gap: relative "more important than" is lossy*

1. "Gym is non-negotiable" 6pm ✕ "Board meeting is critical" 6pm
2. "Family dinner is sacred" ✕ "Ship the release tonight"
3. "Sleep 8h, non-negotiable" ✕ "Investor call at 11pm their time"
4. "Prayer comes first" ✕ "Mandatory training over Dhuhr"
5. "Kids' bedtime routine is priority" ✕ "On-call page at 8pm"
6. "Never miss therapy" ✕ "Client emergency same slot"
7. "Date night protected" ✕ "Conference dinner same evening"
8. "A1C is my #1 goal → walk after meals" ✕ "Back-to-back meetings over lunch"
9. "Mom's care comes first" ✕ "Work deadline Friday"
10. "Marathon training is priority now" ✕ "Overtime asked this month"
11. "Deep work is sacred 9–12" ✕ "Urgent customer call at 10"
12. "Jumu'ah is important" ✕ "All-hands Friday 1pm"
13. "Recovery sleep after night shift" ✕ "Family lunch invitation noon"
14. "Quran after Fajr daily" ✕ "Early gym class 6am"
15. "Weekly review non-negotiable" ✕ "Kids want a movie that night"
16. "Tithe/charity first" (time/money) ✕ "Tight budget month" (resource, not time)
17. "Walk 10k steps" ✕ "Bridge club all afternoon"
18. "Protect mornings for building" ✕ "Customer demands a 9am call"
19. "No work after 8" ✕ "Production incident at 9"
20. "Rest day Sunday" ✕ "Coach wants a make-up session"
21. "Eye on the kids after school" ✕ "Late client review"
22. "Devotional every morning" ✕ "Early flight 6am"
23. "Meal prep Sunday" ✕ "Church + family lunch fill Sunday"
24. "Hydrate + breaks (chronic illness)" ✕ "Meeting marathon day"
25. "Visit grandma monthly" ✕ "Work travel that weekend"
26. "Keep Fridays meeting-free" ✕ "Only time the client is free is Friday"
27. "Sleep early for Fajr" ✕ "Taraweeh runs late in Ramadan"
28. "Protect family time evenings" ✕ "Second job shift evenings"
29. "Study is priority this semester" ✕ "Extra shifts at the library"
30. "Physio is essential" ✕ "Carpool duty same time"
31. "Stretch hourly (desk health)" ✕ "Do-not-disturb focus block"
32. "Daily progress photos/log" ✕ "Chaotic travel days"
33. "Read whole Bible this year" (goal cadence) ✕ "No spare evenings"
34. "Cap meetings at 4/day" ✕ "6 stakeholders all need today"

**Verdict:** representable via absolute `priority` + `protected`, and the reflow
engine already moves the lower-priority flexible item. **Gap (minor):** *relative*
priority statements ("X matters more than Y") and "non-negotiable" as a distinct
tier from 1–5 are flattened. Belongs partly in **normalization** (map
"non-negotiable/critical/sacred" → priority 1 + protected) and partly **engine**
(tie-breaking two fixed items → it correctly refuses and asks the user).

## C. Constraint conflicts (a boundary vs an item) — **ontology FAILS**
*Representation: ❌ ontology (no `constraints` concept) · so the conflict is currently INVISIBLE*

1. "No meetings before 10" ✕ Standup 9:30
2. "Keep weekends free" ✕ Soccer Saturday 10am
3. "No work after 8pm" ✕ On-call 8pm–8am
4. "No calls before noon" ✕ Standup 9am
5. "Don't schedule over the kids' nap 1–3" ✕ Dentist 2pm
6. "Blackout 9am–4pm on sleep days" ✕ Pharmacy call 11am
7. "No 8am classes" ✕ Lab scheduled 8am
8. "Keep evenings for mom" ✕ Carer group Thursday evening
9. "Cap meetings at 4/day" ✕ A 5th meeting requested
10. "No junk food weekdays" ✕ Office birthday cake Tuesday (resource/diet boundary)
11. "Avoid scheduling over any prayer time" ✕ Meeting over Asr
12. "Mornings slow (arthritis)" ✕ Early doctor 8am
13. "No chores on Sunday" ✕ Laundry pushed to Sunday
14. "Protect 9–12 focus, no calls" ✕ Daily standup moved to 11
15. "Keep Fridays for exploring" ✕ Visa appointment Friday
16. "No strenuous activity in the heat" ✕ Midday run in summer
17. "Don't book over her nap 2–4" ✕ Physio offered 3pm
18. "Date night Saturdays protected" ✕ Conference Saturday
19. "Leave by 6 sharp Wednesdays for class" ✕ 5:30 meeting that overruns
20. "Sleep is critical — early nights" ✕ Late social events midweek
21. "No caffeine after 2pm" ✕ 3pm coffee meeting (boundary vs event)
22. "Keep Sundays restful" ✕ Volunteer shift Sunday
23. "Quiet mornings, no calls" ✕ Standup 9
24. "No travel during exam week" ✕ Family trip booked
25. "Reserve Wednesdays lighter" ✕ Three deadlines land Wednesday
26. "Never miss the kids' bedtime" ✕ Evening shift
27. "No meetings over lunch (I walk)" ✕ Lunch-and-learn
28. "Off-days are sacred after nights" ✕ Mandatory training scheduled
29. "No screens after 8 for kids" ✕ Evening homework needs the laptop
30. "Keep one respite day/week" ✕ Appointments fill every day
31. "No early starts post-night-shift" ✕ School run 8:15
32. "Protect prayer windows" ✕ Rotating shift covers Maghrib
33. "Weekends family-only" ✕ Client escalation Saturday
34. "Don't schedule before my first coffee" ✕ 6:45 train

**Verdict:** **Hard ontology failure.** The *boundary* side has no entity to live
in — `protected` only guards a thing you scheduled, not empty/forbidden time, and
`profile.preference` would strip the machine-actionable window/days/cap. With no
`constraints` entity, the conflict cannot even be stored, let alone detected.
**Belongs in the ONTOLOGY** (add `constraints`), then the **engine**
(constraint-vs-item detection + precedence rules).

## D. Recurrence conflicts (series colliding on some occurrences)
*Representation: ✅ ontology (two rrules) · Detection: ✅ engine on materialized occurrences · Gaps: summarization + rotating patterns*

1. Gym MWF 6pm ✕ Therapy every Wednesday 6pm (collides Wednesdays only)
2. Maghrib daily ~sunset ✕ Standup daily 6pm (collides seasonally)
3. Pottery Thursdays 4 ✕ Kids' pickup Thu 3:10–4:30
4. Soccer Tue/Thu 4 ✕ Physio Tue/Fri 4 (collides Tuesdays)
5. Sprint planning every other Monday ✕ Holiday Mondays
6. Weekly review Fri 3:30 ✕ Asr ~3:30 (drifts into it part of the year)
7. Bridge club Tuesdays ✕ Specialist every 3rd Tuesday
8. Carpool Fridays ✕ Jumu'ah Fridays midday (if carpool is midday)
9. Night shift 4-on-4-off ✕ Kids' fixed soccer Tue/Thu (clashes on rotating days)
10. Pump 3×/day at work ✕ Recurring 11am meeting
11. Choir Thursdays 7 ✕ Bible study some Thursdays
12. Volunteer Saturdays ✕ Monthly recital Saturdays
13. On-call every 3rd weekend ✕ Standing family lunch Sundays
14. Daily walk after meals ✕ Daily 1pm meeting
15. Taraweeh nightly (Ramadan only) ✕ Normal 9pm wind-down routine
16. Pills 8/1/8 daily ✕ Rotating shift changes meal times
17. Monthly board meeting ✕ Monthly carer review (both "first Monday")
18. Weekly grocery Saturday ✕ Bi-weekly client review Saturdays
19. Quarterly training ✕ Quarterly taxes (same week)
20. Daily standup 9:30 ✕ Twice-weekly school assembly 8:45–9:40
21. Every-other-Friday retro ✕ Monthly all-hands (some Fridays coincide)
22. Fajr daily ✕ Early gym class MWF
23. Story time before naps (2×/day) ✕ Grandma's Wednesday visit
24. Yoga Tue/Thu ✕ Client calls Tue/Thu afternoons
25. Weekly therapy ✕ Rotating on-call (lands on it some weeks)
26. Daily insulin pre-meal ✕ Intermittent fasting days (no meal)
27. Monthly newsletter 1st ✕ Payroll 25th + invoices month-end (cluster)
28. Sunday meal prep ✕ Sunday church + lunch
29. Weekday school run ✕ WFH Wednesdays (no run needed → exception)
30. Every-90-days visa run ✕ Work travel calendar
31. Foot check weekly ✕ Travel weeks
32. Marathon long-run Saturdays ✕ Family commitments Saturdays
33. Daily Quran after Fajr ✕ Early flights some days
34. 4-on-4-off shifts ✕ Fixed weekly therapy (the core rotating clash)

**Verdict:** mostly handled — two recurring `items` expand to occurrences and the
engine detects per-date collisions. **Two gaps, both ENGINE (not ontology):**
(a) **rotating/cyclic patterns** ("4-on-4-off") can't be *encoded* in the RRULE
subset, so their conflicts can't be represented — a recurrence-representation gap;
(b) the engine detects individual collisions but doesn't **summarize** "this
conflicts every Wednesday" — a UX/aggregation gap.

## E. Protected-event conflicts (something over a protected block)
*Representation: ✅ `protected` flag · Detection: ⚠️ engine supports `protectedBlocks` but the pipeline doesn't yet convert protected items → blocks · Standalone protected windows: ❌ (that's a constraint)*

1. Family dinner 7–8 protected ✕ Work call 7:30
2. Sleep 11–6 protected ✕ Late-night deploy 1am
3. Prayer (Maghrib) protected ✕ Meeting runs into it
4. Kids' nap protected ✕ Contractor arrives mid-nap
5. Date night protected ✕ Boss schedules dinner
6. Recovery sleep (post-night) protected ✕ School run 8:15
7. Jumu'ah protected ✕ Friday 1pm all-hands
8. Mom's rest 2–4 protected ✕ Physio at 3
9. Sabbath/Sunday rest protected ✕ Volunteer rota Sunday
10. Suhoor/Fajr window protected ✕ Night-shift overrun
11. Deep-work 9–12 protected ✕ Daily standup pushed to 10
12. Bedtime routine protected ✕ Evening client call
13. Taraweeh protected (Ramadan) ✕ Late work session
14. Therapy hour protected ✕ Double-booked client
15. Morning devotional protected ✕ Early meeting
16. Gym recovery rest day protected ✕ Coach makeup session
17. Kids' homework hour protected ✕ Grandma's call
18. Lunch walk protected (diabetes) ✕ Lunch-and-learn
19. "Evenings sacred for mom" (standalone window) ✕ Carer group evening
20. "Weekends family-only" (standalone window) ✕ Saturday escalation
21. Prayer times protected (all five) ✕ Rotating shift covers two of them
22. Quiet wind-down 9–10 protected ✕ On-call page
23. Saturday long-run protected ✕ Family event
24. Nap 2pm protected (retiree) ✕ Delivery window 1–3
25. First-coffee buffer protected ✕ 6:45 train
26. Eid prayer morning protected ✕ Work obligations
27. Newborn night-feed window ✕ Partner's early start (both protected, collide)
28. Respite day protected ✕ Appointments booked
29. Communion Sunday protected ✕ Brunch invite
30. Exam-week study protected ✕ Shift offered
31. Wudu+prayer buffer protected ✕ Tight meeting gaps
32. Class night (leave by 6) protected ✕ 5:30 meeting overrun
33. Sleep window protected ✕ Time-zone calls (nomad)
34. Kids' bedtime protected ✕ Second-job evening shift

**Verdict:** the *flag* is representable, but two issues: (a) **engine/pipeline
wiring** — a `protected` item isn't yet fed to the detector as a `protectedBlock`,
so protection isn't enforced end-to-end (gap is ENGINE/pipeline, not ontology);
(b) **standalone protected windows** ("evenings sacred", "weekends family-only")
have nothing to attach to — that's the same **ontology** `constraints` gap as C.

## F. Dependency / ordering conflicts — **ontology FAILS**
*Representation: ❌ ontology (no relative-anchor / ordering field) · so "after X" can't be stored, only lossily mapped to a band*

1. Meds after breakfast ✕ Fasting day (no breakfast) — the anchor disappears
2. Gym → shower → commute, but only 30 min before commute (gym needs 60)
3. Study after kids asleep (9pm) ✕ in bed by 10 (only 1h, needs 2h)
4. Iftar at sunset → Taraweeh ✕ work call right after sunset
5. Protein shake after gym ✕ gym got moved to morning, shake still scheduled night
6. Stretch when I wake ✕ baby wakes me unpredictably
7. Coffee first thing ✕ Fajr is first thing (ordering ambiguity)
8. Pickup kids → then groceries ✕ store closes before pickup ends
9. Wudu before each prayer ✕ back-to-back meetings leave no gap
10. Homework after dinner ✕ dinner late, bedtime fixed
11. Take insulin before meal ✕ meeting overruns the meal
12. Walk after meals ✕ meals at desk during calls
13. Suhoor before dawn ✕ got home from night shift at dawn
14. Warm up before run ✕ only 10 min before work
15. Meds 8h apart ✕ shift pattern compresses waking hours
16. Bath → story → bed (sequence) ✕ guests arrive mid-sequence
17. Devotional before breakfast ✕ early flight, no time before
18. Meal prep before the work week ✕ Sunday already full
19. Sort pills Sunday → use through week ✕ Sunday skipped, week breaks
20. Cool-down after cardio ✕ next meeting immediately
21. Review notes before the exam ✕ exam moved earlier
22. Backup before travel ✕ left in a rush, no time
23. Charge devices before flight ✕ flight earlier than planned
24. Pray Maghrib then dinner ✕ dinner reservation before sunset
25. Pump before the meeting ✕ meeting moved earlier
26. Stretch after sitting 1h ✕ 3h meeting block, no break
27. Snack before workout (low blood sugar) ✕ rushed, skipped
28. Pick up prescription before it runs out ✕ pharmacy hours vs work
29. Kids' milk then sleep ✕ milk delayed, sleep time fixed
30. Wind-down before bed ✕ late work pushes into bedtime
31. Eat before insulin ✕ food delayed, insulin timed
32. Commute after standup ✕ standup overruns, miss the train
33. Shower after gym before client call ✕ no gap between gym and call
34. Read after lights-out routine ✕ routine ends at bedtime, no slack

**Verdict:** **Hard ontology failure.** "After/before X", sequencing, and minimum
gaps cannot be stored — there is no relative-anchor or dependency field. Today
"after work/breakfast" is lossily flattened to a time band, which *destroys* the
dependency (it no longer moves when its anchor moves). **Belongs in the ONTOLOGY**
(add a relative-anchor/`dependsOn` field — the M3 field from the validation doc),
then the **engine** (a sequencing/min-gap solver) and **normalization** (keep the
anchor instead of collapsing it to a band).

---

## Verdict matrix

| Conflict type | Ontology represents? | Where detection lives | Primary gap → owner |
|---|---|---|---|
| A. Time overlap | ✅ yes | engine (overlap/fixed_collision) | none |
| B. Priority | ✅ yes (absolute) | engine (reflow by priority) | relative priority → **normalization** |
| C. Constraint | ❌ **no** | — (invisible) | `constraints` concept → **ontology** + engine |
| D. Recurrence | ✅ yes (rrules) | engine (per-occurrence) | rotating encoding + summarization → **engine** |
| E. Protected | ⚠️ flag only | engine (needs blocks) | item→block wiring → **engine**; standalone windows → **ontology** |
| F. Dependency | ❌ **no** | — (lossy) | relative-anchor field → **ontology** + engine |

## Where the failures belong (the actionable conclusion)

**Ontology (2 additions — and exactly the two the validation exercise predicted):**
1. **`constraints`** — represents the boundary side of C, the standalone-window
   part of E, and seasonal modes. Without it, an entire conflict class is
   unstorable.
2. **Relative-anchor / `dependsOn` field on `items`** — represents the "after/
   before X", ordering, and min-gap side of F.

**Scheduling engine (4 items, no ontology change):**
- Convert `protected` items → `protectedBlocks` so protection is enforced (E).
- Constraint-vs-item detection + precedence once `constraints` exists (C).
- Sequencing / minimum-gap solver for dependencies (F).
- Rotating/cyclic recurrence encoding + **recurring-conflict summarization**
  ("this clashes every Wednesday") (D).

**Normalization (2 items, no ontology change):**
- Map intensity words ("non-negotiable / critical / sacred") → `priority:1 +
  protected` so priority conflicts resolve correctly (B).
- Preserve relative anchors ("after work") instead of flattening to a time band,
  so dependency conflicts stay representable (F).

## Honest gaps in this exercise

- A conflict's *representability* is necessary but not sufficient — resolution
  *policy* (which side yields when a constraint meets a fixed event, how to break
  two equal priorities) is a design problem this corpus scopes but doesn't decide.
- Non-time conflicts (budget/money, energy, attention) appear in the corpus
  (e.g., B16, C10) and are deliberately **out of scope** — LifeFlow schedules
  time, not money or willpower.
- Corpus is single-author and English; lunar/seasonal drift (D2, D15) and
  culture-specific routines may surface more recurrence/anchor cases.

**Net:** the ontology is sound for 4 of 6 conflict classes. The 2 it can't
represent map to the *same* two additions already recommended — `constraints` and
a relative-anchor field — and nothing more. Every other gap is engine or
normalization. The model should not grow beyond those two.
