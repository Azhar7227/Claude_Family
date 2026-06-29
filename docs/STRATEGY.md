# LifeFlow AI — Locked Strategy (v1)

> This supersedes the differentiator framing in `MVP.md`. Decision made by founder; pressure-tested below.

---

## The locked wedge

**The easiest way to turn messy real-world information into structured, maintainable routines — with one tap.**

- **Inputs:** chat, voice, screenshots, photos, PDFs, Excel/CSV, Word, `.ics`, printed/handwritten timetables.
- **Behavior:** AI **suggests** optimized adjustments when conflicts arise. It **never silently changes** the user's schedule. The user is always in control.
- **Audience:** individuals and **couples** first → expand to the full AI Life Operating System later.
- **Positioning:** "the easiest way to create *and maintain* your daily routine."

## Why this wedge is better than the ones I critiqued

- It sidesteps Motion/Reclaim. They compete on *auto-scheduling*; we compete on **capture/understanding** — a different, less-crowded job.
- It's inherently **demoable and viral**: "screenshot your kid's school timetable → one tap → it's in your routine" is a 10-second video that sells itself.
- "Suggests, never silently changes" is the **correct trust posture** and directly fixes the biggest churn risk (an AI hijacking your day). Good call.
- **Couples** adds the network hook that solo productivity lacks — a shared routine is stickier and pulls in a second paying user.

## The one failure mode that will kill it — and the fix

**Risk: "convert" is a one-and-done act. Import tools get used once and abandoned.** If the product is only a fancy importer, users convert their timetable in week one and never return — great onboarding, zero retention, no company.

**The product is NOT "convert." It is "create AND maintain."** Conversion is the *front door*; maintenance is the *house*. The retention engine is the suggest-on-conflict loop:
- new input arrives (a changed shift, a new meeting, a school holiday) → AI detects the conflict → **suggests** an adjustment → one tap to accept.
- This is what brings users back daily and what they'll pay for. **If we under-build maintenance, the wedge fails regardless of how good the importer is.**

> The capture pipeline is the *acquisition* moat (viral, demoable). The maintenance loop is the *retention* moat. We need both; the second is the one teams forget.

## Honest caveat on the moat

Raw ingestion (OCR + "make a table from this image") is **commoditizing fast** — ChatGPT and Google Lens already do a weak version. So the moat is **not** the parse. It is:
1. **Accuracy on genuinely messy, real-world inputs** (handwriting, photographed whiteboards, foreign timetables) — the long tail nobody nails.
2. The **structured routine model** the parse feeds into, plus the **maintenance loop** that keeps it current.
3. Over time, the **behavioral model of the user/couple** that makes suggestions actually good.

We win by being *dramatically* more accurate and lower-friction on the messy long tail than a general chatbot — and by owning the maintain loop they don't.

---

## Revised MVP (re-scoped to this wedge)

The earlier MVP cut voice/upload/paste. **That was for the old wedge and is now wrong** — multi-input capture *is* the product. But we stay disciplined: start with the highest-leverage inputs, not all 11 formats.

**IN (MVP):**
1. **Multi-input capture — start with 3:** (a) paste/type text, (b) **image/screenshot → OCR**, (c) **`.ics` import**. These cover the most common "messy schedule" sources at the lowest build cost. *(Voice + PDF/Excel are the immediate fast-follow.)*
2. **AI extraction → canonical routine schema** (task, start, end, duration, repeat rule, category, person, notes).
3. **Editable preview + conflict detection** — the trust surface. Nothing commits without the user seeing it.
4. **One-tap confirm → recurring tasks, reminders, timeline.**
5. **Today screen** — what now / next / after (the daily-open surface).
6. **★ Suggest-on-conflict maintenance loop** — the retention engine. New/changed input → AI *suggests*, user accepts. Never auto-applies.
7. **Couples (lightweight):** shared routine + invite + change notifications. The network hook.
8. **Manual edit + undo everywhere** — safety net.

**OUT (deferred):** Goal Builder, full health suite, analytics scores, family/children, two-way calendar *write* sync (import-only at MVP), wearables, autonomy graduation, web parity. All real, all later.

**Trade-off accepted:** import-only (no calendar write-back) in MVP means fixed events from Google still live in two places briefly. We accept this short-term to ship; two-way sync is the #1 fast-follow because a stale day model breaks the suggest loop.

## The metric that proves it

Not "conversions." **Week-4 retention of users who completed ≥1 import** — i.e., did the *maintain* loop bring them back? Conversion rate tells us the funnel works; W4 retention tells us we built a company and not an importer.

---

**Next step:** with this locked, begin building feature-by-feature at the foundation (schema + routine model + capture pipeline). Awaiting go.
