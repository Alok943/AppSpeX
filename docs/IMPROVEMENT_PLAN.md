# AppSpeX — Post-Review Action Plan

> Read this as a brief from a senior engineer. The reviewer gave us UI feedback.
> I also read the **actual generated output** for the RetainHQ prompt. The two
> point at the *same* conclusion from different angles. This doc says what to do
> and, more importantly, **why**, in priority order.

---

## TL;DR

The reviewer is correct: **spend 80% of remaining effort on understanding /
coverage / explanation, 20% on UI.** Do not touch gradients, animations, or the
color palette.

But here's the part the reviewer couldn't see from a screenshot: our actual
output **silently dropped the user's business rules and fabricated meaningless
workflow triggers.** The "trust & verify" features the reviewer is asking for are
not polish — they are the exact instruments that would have made this failure
*visible*. That's why we build them. Honesty about what the pipeline missed is
the product.

---

## Read the output, not the screenshot (diagnosis)

I ran the RetainHQ prompt (spaced repetition: log activities, key memory,
difficulty 1–5, schedule reviews +3/+7/+14/+30d, active recall with Easy/Med/Hard,
Slack on streak broken, Gmail daily digest, Notion on mastery). Here's what the
pipeline produced and what's wrong with it:

**Defect 1 — Workflow stubs are degenerate (the big one).**
All three came out as:
```
slack.send_message   ← on User.status_changed
gmail.send_email     ← on User.status_changed
notion.create_page   ← on User.status_changed
```
Every trigger is `User.status_changed`. That's nonsense. The prompt clearly stated
*streak broken* / *daily digest* / *topic mastery*. **Evidence from the repair log:**
```
consistency repaired — synthesized default workflowStub for "slack" ...
consistency repaired — synthesized default workflowStub for "gmail" ...
consistency repaired — synthesized default workflowStub for "notion" ...
```
The LLM produced **no usable workflow stubs**, so our deterministic
`ensureWorkflowCoverage` fallback fired and emitted generic
`entities[0] + status_changed + firstAction` stubs. The fallback did its job
(every requested integration is covered), but the *meaning* is gone.

**Defect 2 — Business rules vanished.**
None of these survived into the spec: the +3/+7/+14/+30 schedule, the
"difficulty ≥ 4 or hint used" trigger, `keyMemory`, `mistake`, the Easy/Med/Hard
recall rating. `StudyActivity` got generic columns (`activityType`,
`confidenceScore`, `masteryLevel`) instead of the domain's actual mechanic. The
heart of the product — "track what you remember" — is absent.

**Defect 3 — Generic CRUD, not the product.**
The model invented `ReviewSession` (a session-of-activities) and a separate
`TopicDifficultyTier` entity, while losing the real model (each Activity
schedules Reviews). Pages are List/Detail CRUD per table. The actual product
surfaces — the **recall flow**, the **analytics** (retention/compliance/momentum),
the **dashboard** — are missing.

**Defect 4 — `field repaired: missing array`.**
The LLM's AppSpec was structurally incomplete; field repair filled an empty
array. Good that repair caught it — but it confirms first-pass quality on a
*complex* prompt is mediocre and we're leaning on the repair engine for both
structure (fine) and meaning (not fine).

**The synthesis:** a reviewer looking at the UI said "help users verify what was
generated." The output shows *exactly why that matters* — right now nothing tells
the user "we ignored your business rules and faked your workflows." We fix that by
making the gap visible, not by pretending the LLM is perfect.

---

## What's already good — do NOT touch

- The engine: schemas / validation / repair / gateway / registry. 46 passing tests.
- The repair engine **worked** — it filled the missing array and covered all 3
  integrations. Keep it.
- The panels are clean and structured. **No** new gradients, animations,
  glassmorphism tuning, color palettes, or hero sections. The reviewer and I agree.

---

## The work, prioritized

Effort tags: **S** ≈ <1h, **M** ≈ a few hours, **L** ≈ half a day+.

### P0 — Make understanding visible (the differentiator)

**1. Prompt Understanding panel (S).** We *already extract* this in Stage 1 and
don't show it — that's a bug, not a feature request.
- Detected: `intent.features`, `intent.entities`, `intent.integrations_requested`.
- Assumed: `intent.assumptions` (captured today, never rendered).
- Acceptance: after a run, the user sees a checklist of what was understood and a
  distinct list of assumptions made.

**2. App Overview header (S).** Compute from data we already have and render at the
*top* (reviewer had to scroll to understand the output):
```
Type: Learning Platform · Entities: 8 · Pages: 10 · APIs: 40
Integrations: 3/3 · Validation: Passed · Repairs: 4
```

**3. Integration coverage badge (S).** Diff `intent.integrations_requested`
against integrations actually present in `integrationHooks` + `workflowStubs`.
Show `3/3` and which. Cheap, high trust.

### P0 — Fix the silent business-rule loss (correctness, not UI)

**4. Extract business rules in Stage 1 (M).** Add `businessRules: string[]` to
`AppIntent` and update the intent prompt to capture them, e.g.
`"schedule reviews at +3/+7/+14/+30 days"`, `"trigger when difficulty>=4 or hint used"`.
This is the data the next two items run on.

**5. Business-Rule Coverage panel (M).** For each extracted rule, did the spec
encode it anywhere (a workflowStub trigger/condition, a field, an endpoint, an
assumption)? Render:
```
Business Rule Coverage: 4/6
✓ Slack on streak broken      ✓ Gmail daily digest
✓ Notion on mastery           ✓ Roles: user / admin
⚠ Spaced-repetition schedule (+3/+7/+14/+30) — not encoded
⚠ Recall rating (Easy/Med/Hard) — not encoded
```
**This is the single feature that makes AppSpeX look intelligent** (reviewer's
word). It's built entirely on data from item 4. Honest misses build *more* trust,
not less.

**6. Fix the degenerate workflow fallback (M).** `ensureWorkflowCoverage`
currently emits `entities[0] + status_changed + actions[0]` — that's the root of
"everything triggers on User."
- Only synthesize for integrations the LLM genuinely missed (keep).
- When synthesizing, pick the trigger entity/event/condition from the matching
  `businessRule` if one names this integration, instead of `entities[0]`.
- Strengthen the Stage 3 prompt: pass the extracted `businessRules` + requested
  integrations and require one stub *per rule that names an integration*, with a
  real `trigger.condition`. Goal: the LLM produces the stubs; the fallback becomes
  the rare safety net it's meant to be.

### P1 — Entity intent over schema

**7. Entity purpose line (M).** Add a `description` to `EntitySchema` (Stage 2
prompt) and render it above each field table:
> **ReviewSession** — Stores scheduled review events and recall results.

Non-engineers care about intent more than columns.

### P2 — Noise reduction (only if time)

- Collapse the per-entity CRUD endpoint tables (5×N near-identical rows is noise).
- Simple complexity heuristic (entities × endpoints → Low/Med/High).

---

## What NOT to do

- ❌ New colors, gradients, animations, hero sections, glassmorphism tweaks.
- ❌ Rebuild the engine or add providers.
- ❌ Chase 100% schema fidelity to the prompt. That's an LLM-quality arms race we
  lose. Instead **surface the gaps** (coverage) — cheaper, honest, and more
  impressive than a spec that silently pretends it nailed everything.

---

## Why this ordering (the senior take)

The reviewer's instinct ("trust & verify") and our output bug ("silent rule
loss") are the same problem from two angles. **Every P0 item converts an invisible
failure into a visible, honest one.** A reviewer who types the RetainHQ prompt and
sees *"Business Rule Coverage: 4/6 — missed: spaced-repetition schedule, recall
rating"* will trust the tool **more**, because it knows its own limits. That is
worth more in a trial than any pixel.

We are not making the AI smarter (expensive, slow). We are making the system
**honest about what the AI did** (cheap, fast, and exactly what a reviewer who
said "is the repair engine real? what's your actual success rate?" wants to see).

---

## Done = verifiable

Re-run the RetainHQ prompt. The UI must show:
1. An **overview header** before any scrolling.
2. **Detected requirements** + **assumptions** (from Stage 1, now rendered).
3. **Integration coverage** 3/3.
4. **Business-rule coverage** with the real misses listed.
5. Workflow stubs whose triggers are **not all `User.status_changed`**.

Plus: all 46 existing tests green, and new tests for (a) coverage computation and
(b) the smarter `ensureWorkflowCoverage`. Ship behind nothing — this *is* the
submission's headline.

---

## Appendix: "Is it a cheap-model problem?"

Short answer: **mostly no.** It's a pipeline-design problem wearing a cheap-model
costume. Attribution of the second reviewer's per-stage scores:

| Defect | Score | Cheap model | Our pipeline | Real cause |
|---|---|---|---|---|
| Intent missed business rules | 8/10 | ~10% | ~90% | We never *ask* Stage 1 to extract rules. An 8B can list them. |
| Schema genericized | 7/10 | ~50% | ~50% | Stronger model genericizes less, BUT Stage 1 dropped the rules so Stage 2 couldn't model them. |
| CRUD-centric pages | 6/10 | ~40% | ~60% | Stage 3 prompt nudges entity-CRUD; never asks for product surfaces. |
| Workflow `User.status_changed` | 3/10 | ~15% | ~85% | Our `ensureWorkflowCoverage` hardcodes `entities[0]+status_changed+actions[0]`. The model didn't hallucinate this — our fallback did. |
| Integration detection | 8.5/10 | — | — | Works. |

**Evidence it's not the model:** the repair log shows the workflow stubs were
*synthesized by our fallback*, and a `field repaired: missing array` entry shows
the model's `workflowStubs` array was omitted/malformed and replaced with `[]`.
Two pipeline behaviors stacked to produce `User.status_changed` — independent of
model capability.

**The discipline:** pull the free levers (P0 items above) first, re-run, *then*
measure the model. Expected after fixes, same cheap models: workflow 3→7+,
schema/appspec 6-7→7-8.

**If a model lever is still wanted — it's cheaper, not pricier.** From our own
OpenRouter list, **DeepSeek V4 Flash ($0.0983/$0.1966 per 1M)** is *cheaper* than
the current AppSpec model (gpt-oss-120b, $0.15/$0.60) and stronger at structured
output. The experiment is **one line** in `routing.config.ts` (point `appspec` at
DeepSeek) + one eval run. That one-line A/B is the entire payoff of building a
config-driven, provider-agnostic gateway — don't pay for model upgrades to mask
pipeline bugs; prove the ceiling first.
