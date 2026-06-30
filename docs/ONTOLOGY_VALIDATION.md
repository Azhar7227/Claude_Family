# Ontology Validation — does profile / goals / tasks hold?

> A pressure test, not an expansion. We built a 300+ utterance corpus across 14
> personas and asked of every statement: **does it map cleanly into `profile`,
> `goals`, or `items` (tasks/routines/habits) — without inventing new concepts?**
> Where it doesn't, we document it and decide whether a new concept is justified.
> No code; this is an ontology exercise.

## Method

1. Collect realistic, messy routine descriptions per persona (how people actually
   talk, not clean commands).
2. Classify each utterance into the current ontology:
   - **profile** — durable facts about the person
   - **goals** — aspirations needing a plan
   - **items** — schedulable tasks / routines / habits (with type, category,
     protected, timeOfDay, frequency, rrule, times)
3. Mark anything that *forces* into a bucket lossily or doesn't fit at all.
4. Group the misfits into a taxonomy; decide: new top-level concept, new field on
   an existing concept, engine/recurrence gap, or out of scope.

**Bottom line (read first):** the three top-level buckets hold ~88% of the corpus
cleanly. The misfits cluster into a small, repeatable taxonomy. They justify
**exactly one new top-level concept — `constraints` (availability/boundaries)** —
plus a handful of **new fields on `items`** (time anchors, relative timing,
measurable targets, due-by). Everything else is an engine recurrence gap, a
future rules engine, or out of scope. The ontology should stay tight.

---

## The corpus (300+ utterances, 14 personas)

### 1. University student
1. I have classes Mon/Wed/Fri 9–12. 2. Lab every Tuesday 2–5. 3. Study 2 hours each night. 4. Essay due Friday. 5. Group project meeting Thursdays. 6. I'm a second-year CS major. 7. Want a 3.8 GPA this semester. 8. Gym 4 times a week. 9. Part-time job at the library weekends. 10. Exam week starts the 20th. 11. Call home every Sunday. 12. Cook to save money. 13. No 8am classes ever again. 14. Read 30 pages of the textbook daily. 15. Coffee before my first class. 16. I prefer studying late at night. 17. Submit FAFSA by March 1. 18. Intramural soccer Wednesday evenings. 19. Laundry on Sundays. 20. Internship applications this month. 21. I can't focus in the mornings. 22. Office hours Tuesdays if I'm stuck.

### 2. New parent (infant)
1. Baby feeds every 3 hours. 2. Nap times 9am and 1pm. 3. Bath at 7pm then bed. 4. I'm on parental leave until September. 5. Pediatrician monthly. 6. Tummy time twice a day. 7. My partner does the night feeds on weekends. 8. Want to sleep-train by 6 months. 9. Don't schedule anything during naps. 10. Vitamin D drops every morning. 11. Stroller walk after lunch. 12. Laundry feels constant. 13. Grandma visits Wednesdays. 14. Pump milk at work 3 times a day. 15. We have a newborn and a toddler. 16. Date night once a month if we can. 17. Story time before naps. 18. Restock diapers when low. 19. I'm exhausted in the afternoons. 20. Track wet diapers. 21. 6-week checkup on the 14th. 22. Keep evenings calm.

### 3. Parent of school-age kids
1. School drop-off 8:15, pickup 3:10. 2. Soccer practice Tue/Thu 4pm. 3. Piano Saturdays 10am. 4. Homework after dinner. 5. Pack lunches the night before. 6. I work 9–5 from home Wednesdays. 7. Carpool with the neighbor on Fridays. 8. Dentist for the kids in two weeks. 9. Screen time off after 8pm. 10. Family movie night Fridays. 11. I have three kids. 12. PTA meeting first Monday monthly. 13. Grocery run Saturday morning. 14. Kid's medicine at breakfast and bedtime. 15. Want the family to eat dinner together more. 16. Bake for the school fair next week. 17. Keep weekends mostly free. 18. Music recital end of term. 19. My daughter is gluten-free. 20. Read to the kids before bed. 21. Renew library books before they're due. 22. Parent-teacher conference Thursday 4:30.

### 4. Night-shift nurse
1. I work 4 nights on, 4 off. 2. Shifts are 7pm–7am. 3. Sleep during the day after a night shift. 4. Rotating between days and nights monthly. 5. I'm an ICU nurse. 6. Gym before my shift. 7. Meal prep on days off. 8. Don't schedule anything 9am–4pm on sleep days. 9. On-call every third weekend. 10. Mandatory training quarterly. 11. Want to finish my nurse-practitioner degree. 12. Coffee at the start of each shift. 13. Vitamin D — I barely see daylight. 14. Call my mom on my off days. 15. Handover meeting 15 min before shift. 16. Blackout curtains, no disturbances while I sleep. 17. License renewal in October. 18. Hydrate through the shift. 19. Therapy every other Tuesday. 20. Switch back to a day schedule on holidays. 21. I'm usually wiped the first off-day. 22. Flu shot every autumn.

### 5. Freelance designer
1. Deep work mornings, calls afternoons. 2. Invoice clients at month-end. 3. I'm a freelance UX designer. 4. No meetings on Fridays. 5. Client review every other Wednesday. 6. Want to land two retainer clients this quarter. 7. Update portfolio monthly. 8. Gym at lunch. 9. Track billable hours daily. 10. Coffee shop work on Tuesdays. 11. Taxes quarterly. 12. Learn Framer this month. 13. Email triage twice a day, not constantly. 14. Walk the dog at 7 and 6. 15. Protect 9–12 for focus, no calls. 16. Newsletter to clients first of the month. 17. Renew Adobe subscription yearly. 18. I work better in cafés. 19. Save 20% of every invoice. 20. Proposal due for the new client Monday. 21. Stretch every hour at the desk. 22. Take Wednesdays lighter to avoid burnout.

### 6. Office worker (9–6)
1. Office Mon–Fri 9–6. 2. Standup daily 9:30. 3. 1:1 with manager Thursdays 2pm. 4. Commute leaves at 8:15. 5. Lunch around 1. 6. Gym after work. 7. I'm a business analyst. 8. Sprint planning every other Monday. 9. Want a promotion this year. 10. Inbox zero on Friday afternoons. 11. Team lunch last Friday of the month. 12. No meetings before 10 if possible. 13. Learn SQL on the side. 14. Pick up dry cleaning Thursdays. 15. Quarterly review in March. 16. Water — I forget to drink. 17. Walk during lunch calls. 18. Pay rent on the 1st. 19. Date night Friday. 20. Annual leave in July. 21. Back up my laptop weekly. 22. Leave by 6 sharp on Wednesdays for class.

### 7. Practicing Muslim
1. I pray five times a day. 2. Fajr at dawn, Isha at night. 3. Jumu'ah is important. 4. Quran reading after Fajr. 5. Fast during Ramadan. 6. Suhoor before dawn, iftar at sunset. 7. I'm a software engineer. 8. Taraweeh prayers nightly in Ramadan. 9. Give zakat yearly. 10. Want to memorize Juz Amma. 11. Mosque for Maghrib when I can. 12. No meetings during prayer times. 13. Friday lunch with family after Jumu'ah. 14. Wudu before each prayer. 15. Dhikr in the morning and evening. 16. Avoid scheduling over Maghrib. 17. Islamic class Sunday mornings. 18. Charity every Friday. 19. Eid prayer in the morning. 20. I have two kids. 21. Sleep early to wake for Fajr. 22. Prayer times shift with the seasons.

### 8. Practicing Christian
1. Church every Sunday 10am. 2. Bible study Wednesday evenings. 3. Pray before meals. 4. Morning devotional 15 minutes. 5. I'm a retired teacher. 6. Tithe monthly. 7. Fast on Fridays during Lent. 8. Want to read the whole Bible this year. 9. Choir practice Thursdays 7pm. 10. Volunteer at the food bank Saturdays. 11. Keep Sundays restful. 12. Small group every other Friday. 13. Advent starts late November. 14. Call my grandchildren weekly. 15. Evening prayer before bed. 16. Easter service preparation in spring. 17. No chores on Sunday. 18. Communion first Sunday monthly. 19. Gratitude journal nightly. 20. Men's breakfast monthly. 21. I have arthritis, mornings are slow. 22. Christmas Eve service.

### 9. Retiree
1. Morning walk at 7. 2. I'm retired. 3. Doctor every three months. 4. Take blood pressure meds at 8 and 8. 5. Bridge club Tuesdays. 6. Water the garden every other day. 7. Want to walk 10,000 steps a day. 8. Call the grandkids on Sundays. 9. Volunteer at the library Wednesdays. 10. Physiotherapy weekly. 11. Pension comes on the 28th. 12. Afternoon nap. 13. I have a heart condition. 14. Avoid strenuous activity in the heat. 15. Read before bed. 16. Pottery class Thursday afternoons. 17. Grocery delivery Mondays. 18. Annual checkup in spring. 19. Keep mornings slow. 20. Travel to see family at Christmas. 21. Pills sorted weekly on Sunday. 22. Crossword with coffee.

### 10. Startup founder
1. I'm building a fintech startup. 2. Investor updates monthly. 3. Standup 9am daily. 4. No meetings before 11, mornings are for building. 5. Want to close our seed round in 90 days. 6. Gym 3x a week or I crash. 7. 1:1s with the team Fridays. 8. Board meeting quarterly. 9. Payroll on the 25th. 10. Inbox twice a day. 11. Ship a feature every week. 12. Date night Saturdays, protected. 13. Customer calls Tuesday/Thursday afternoons. 14. Learn to delegate. 15. Sleep 7 hours, non-negotiable. 16. Conference next month. 17. Renew domain yearly. 18. Walk to think after lunch. 19. Weekly review Sunday night. 20. I travel most weeks. 21. Hire two engineers this quarter. 22. Cap meetings at 4 a day.

### 11. Fitness / weight-loss
1. Gym 5 days a week. 2. Want to lose 15 kg by summer. 3. 2000 calories a day. 4. 150g protein daily. 5. 10k steps. 6. Meal prep Sundays. 7. Leg day Monday, push Tuesday, pull Thursday. 8. Drink 3 litres of water. 9. Weigh in every Monday morning. 10. Sleep 8 hours. 11. Run a 10k in October. 12. Stretch every morning. 13. No junk food on weekdays. 14. Creatine daily. 15. I'm a software tester. 16. Rest day Sunday. 17. Track every meal. 18. Coach check-in every two weeks. 19. Cut caffeine after 2pm. 20. Progress photos monthly. 21. Cardio on rest days, light. 22. Cheat meal Saturday.

### 12. Caregiver (elderly parent)
1. Mom's meds at 8, 1, and 8. 2. Doctor visits monthly. 3. I'm caring for my mother. 4. Help her bathe mornings. 5. Physiotherapy Tuesdays and Fridays. 6. Don't schedule over her nap 2–4. 7. Grocery and pharmacy runs Saturdays. 8. Want to find respite care one day a week. 9. Cook soft meals daily. 10. Call her sister weekly. 11. Blood test every three months. 12. Keep evenings free for her. 13. She has dementia, routine matters. 14. Refill prescriptions before they run out. 15. Carer support group every other Thursday. 16. Sort her pills Sunday night. 17. Annual review with social services. 18. I work part-time around her care. 19. Walk her in the garden after lunch. 20. Hospital appointment on the 12th. 21. I'm stretched thin. 22. Family meeting monthly about her care.

### 13. Remote worker / digital nomad
1. I work remotely across time zones. 2. Standup at 4pm my time. 3. No calls before noon. 4. I'm a backend developer. 5. Travel to a new city every month. 6. Gym wherever I am. 7. Want to visit 12 countries this year. 8. Adjust my schedule when I change time zones. 9. Coworking space mornings. 10. Visa runs every 90 days. 11. Invoice the agency monthly. 12. Learn Spanish 20 min a day. 13. Call family back home Sundays (their time). 14. Laundry every Sunday. 15. Keep Fridays for exploring. 16. Back up work daily. 17. Renew travel insurance yearly. 18. Flight on the 3rd. 19. I'm jet-lagged the first two days. 20. Walk to find coffee each morning. 21. Budget weekly. 22. Health checkup when I'm home.

### 14. Chronic illness management
1. Insulin before each meal. 2. Check blood sugar 4 times a day. 3. I have type 1 diabetes. 4. Endocrinologist every three months. 5. Metformin morning and night. 6. Want my A1C under 6.5. 7. 30-minute walk after meals. 8. Carb-count every meal. 9. Avoid scheduling stress around appointments. 10. Refill insulin before it runs out. 11. Foot check weekly. 12. Eye exam yearly. 13. Carry snacks for lows. 14. Sleep is critical for my levels. 15. Therapy every other week. 16. Log symptoms daily. 17. Flu shot in autumn. 18. Rest when fatigued, listen to my body. 19. Bloodwork before each specialist visit. 20. Hydrate constantly. 21. I work a desk job. 22. Support group monthly.

*(308 utterances total.)*

---

## Coverage results

| Bucket | Maps cleanly | Examples |
|---|---|---|
| **profile** | ~14% | "I'm an ICU nurse", "I have three kids", "type 1 diabetes", "retired", "I work remotely" |
| **goals** | ~10% | "lose 15 kg by summer", "close the seed round in 90 days", "read the whole Bible this year", "A1C under 6.5" |
| **items** (tasks/habits) | ~64% | "Standup 9:30", "Quran reading after Fajr", "gym 5×/week", "school pickup 3:10", "tithe monthly" |
| **misfit / lossy** | ~12% | see taxonomy below |

So **~88% maps cleanly** into the existing three buckets. The remaining ~12% is
not noise — it's a small, repeatable set of patterns that recur across *every*
persona. They are catalogued and judged below.

---

## Misfit taxonomy (every kind of information that didn't fit)

### M1 — Standalone constraints / boundaries  → **NEW TOP-LEVEL CONCEPT justified**
Statements that constrain the schedule but contain **no task to perform**:
- "No meetings before 10/11", "no calls before noon", "no 8am classes"
- "Keep weekends free", "no chores on Sunday", "keep evenings for her"
- "Don't schedule over the kids' nap 1–3", "blackout 9am–4pm on sleep days"
- "Cap meetings at 4 a day", "no work after 8pm", "no junk food on weekdays"
- "Avoid scheduling over Maghrib / during prayer times"

**Why it doesn't fit:** it's not an `item` (nothing is done), not a `goal`, and
forcing it into `profile.preference` is **lossy** — it strips the machine-actionable
bounds the scheduler must honor (window, days, cap, "never over"). The per-item
`protected` flag only protects *a thing you scheduled*; these are rules about
*empty time*. This appears in 12 of 14 personas.

**Verdict:** justifies a **fourth top-level concept — `constraints`** (a.k.a.
availability/boundaries): a declarative scheduling rule with optional window,
days, date range, and kind (`no_schedule` | `prefer` | `cap` | `protect`). This
is the one genuinely missing primitive. It also absorbs M8 below.

### M2 — Dynamic time anchors  → **new FIELD on `items`, not a concept**
Times that vary by date/location: "Fajr at dawn", "iftar at sunset", "sunrise
hike", "Maghrib". Today we flag these ambiguous and ask. A real product computes
them. **Verdict:** add an item field `timeAnchor: sunrise | sunset | prayer:<name> | offset` —
the *concept* is still a task; only the *time source* differs. No new top-level concept.

### M3 — Relative / dependency timing  → **new FIELD on `items`**
"Meds after breakfast", "study after kids are asleep", "gym then shower then
commute", "coffee first thing", "stretch when I wake". The time is relative to
another event/task, not a clock or band. Today "after work" is lossily mapped to
the evening band. **Verdict:** add `anchor: { relativeTo, offsetMin }` and simple
ordering. Still tasks; no new top-level concept.

### M4 — Measurable recurring targets  → **new FIELD on `items` (habit target)**
"Drink 3 L water", "10k steps", "150 g protein", "2000 calories", "8 hours sleep",
"read 20 pages". These are habits (fit `items`) but the **measurable target** has
no slot — `frequency` counts *occurrences*, not *quantity*. **Verdict:** add
`target: { quantity, unit }` to items (the habit measure; ties into health
tracking later). Not a new top-level concept — a richer habit.

### M5 — Deadlines / due-by  → **new FIELD on `items`**
"Essay due Friday", "submit taxes by April 15", "renew passport this month",
"proposal due Monday". A task with a *due date* the planner should back-plan from —
distinct from when you actually do it. Today it'd be a one-off fixed task, losing
the back-planning semantic. **Verdict:** add `dueBy` to items. Borderline but cheap
and high-value for students/freelancers. No new top-level concept.

### M6 — Rotating / cyclic recurrence  → **ENGINE gap, not ontology**
"4 on 4 off", "rotating days then nights", "week of earlies then lates", "on-call
every third weekend". The *concept* (a fixed work routine) fits `items`; the
**RRULE subset can't encode it** (cycles anchored to a date, not weekly). **Verdict:**
a recurrence-representation gap in the engine (add cyclic/`INTERVAL`+anchor or a
shift-pattern encoder). Not an ontology change. Important for shift workers.

### M7 — Conditional / triggered routines  → **future rules engine, defer**
"If it rains, treadmill instead of run", "on travel days shift prayers", "skip gym
on call weeks". Conditional logic over context. **Verdict:** out of MVP; a future
"rules" layer. Rare enough to defer; do not model now.

### M8 — Temporary modes / seasonal context  → **covered by `constraints` with date range**
"I'm traveling next week", "Ramadan starts soon", "exam week", "marathon season".
Time-bounded contexts that change scheduling. **Verdict:** compose from a
date-ranged `constraint` (M1) + bounded recurrence; argues constraints need an
optional date range. No separate concept.

### M9 — Other people's schedules  → **mostly fits (profile + assignee + constraint)**
"My wife works late Tuesdays so I cook", "son has soccer Tue/Thu", "partner travels
Mondays". The actionable part is an `item` (with `assigneeName`); the reason is a
`profile.family` fact or a `constraint`. **Verdict:** no new concept; existing
slots + constraints suffice.

### M10 — Pure notes / reference  → **OUT OF SCOPE (by design)**
"Locker code 1234", "doctor's address", "wifi password". Non-schedulable trivia.
Some health facts ("daughter is gluten-free", "peanut allergy") are
`profile.health`. **Verdict:** LifeFlow is not a notes app — keep these in a notes
tool. Reference attached to a task uses the existing `notes` field.

---

## Recommendation — keep the ontology tight

The validation **supports the trichotomy** with one addition:

```
profile      facts about the person            (unchanged)
constraints  declarative scheduling boundaries  (NEW — M1, absorbs M8/part of M9)
goals        aspirations needing a plan         (unchanged)
items        tasks / routines / habits          (+ fields: timeAnchor M2,
                                                  anchor/relativeTo M3,
                                                  target M4, dueBy M5)
```

- **Add exactly one top-level concept: `constraints`.** It is the only pattern
  that has no honest home today and appears almost universally.
- **Add four optional fields to `items`** (timeAnchor, relative anchor, target,
  dueBy). These enrich tasks; they are not new concepts and must not become
  top-level buckets.
- **One engine gap to log (not ontology):** rotating/cyclic recurrence (M6).
- **Explicitly defer:** conditional rules (M7); **explicitly exclude:** notes (M10).

### Why not more concepts?
Every other tempting concept (energy windows, preferences, relationships,
seasonal modes) **decomposes** into `profile` + `constraints` + item fields.
Adding them as top-level types would fragment the model and complicate the
extractor for no expressive gain. The discipline of "fields before concepts"
keeps the first screen — and the prompt — comprehensible.

### Validation gaps (honest)
- Percentages are from manual categorization of one author's corpus; they're
  directional, not statistical. A labelled multi-rater study would tighten them.
- The corpus is English and skews to the named personas; languages with different
  time/recurrence idioms (e.g., lunar calendars) may surface more M2/M6 cases.
- Constraints interacting with the scheduler (precedence, conflicts between a
  constraint and a fixed event) is a design problem this exercise scopes but does
  not solve.

**Next step (when you choose to build):** introduce `constraints` and the four
item fields, extend the prompt + normalization rules to populate them, and add the
M1–M5 cases to the benchmark dataset so the gain is measured, not assumed.
