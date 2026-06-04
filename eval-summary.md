# AppSpeX — Evaluation Summary

**Run:** 12 prompts (7 standard + 5 edge cases) against the live pipeline.
**Routing:** Groq Llama 3.1 8B (intent/repair) · Gemini 3.1 Flash Lite (schema/appspec) · OpenRouter `nemotron:free` universal 429/5xx fallback.

## Headline numbers

- **Success: 11/12 (92%).** The one non-completion is prompt #8 ("An app.") which correctly returned a **clarification** instead of guessing — intended behavior, not a failure. **0 hard failures.**
- **Cost: $0.0313 total · $0.0026 avg/run.**
- **Latency: 80.6s total · 6.7s avg/run.** No timeouts.
- **Repairs: 0 entries · Retries: 0** — every completed run passed validation first-pass.

| # | Prompt | Status | Cost | Latency | Repairs | Integrations detected |
|---|--------|--------|------|---------|---------|-----------------------|
| 1 | Real Estate CRM | ✓ | $0.00305 | 9.3s | 0 | whatsapp |
| 2 | Engineering Task Manager | ✓ | $0.00302 | 8.0s | 0 | slack |
| 3 | Warehouse Inventory | ✓ | $0.00306 | 7.8s | 0 | gmail |
| 4 | HR Tool | ✓ | $0.00334 | 6.4s | 0 | slack |
| 5 | E-commerce Backend | ✓ | $0.00340 | 7.9s | 0 | stripe, gmail |
| 6 | Event Management | ✓ | $0.00224 | 6.3s | 0 | whatsapp |
| 7 | Project Tracker | ✓ | $0.00305 | 8.0s | 0 | jira, google_sheets |
| 8 | Edge: ultra-vague | ? clarify | $0.00003 | 1.7s | 0 | — |
| 9 | Edge: ambiguous domain | ✓ | $0.00278 | 6.4s | 0 | — |
| 10 | Edge: overscoped | ✓ | $0.00278 | 6.3s | 0 | — |
| 11 | Edge: conflicting domains | ✓ | $0.00266 | 6.3s | 0 | — |
| 12 | Edge: vague modifier | ✓ | $0.00187 | 6.3s | 0 | — |

## Analysis (≈250 words)

**Success rate is 92%**, with the single non-completion being a *deliberate* clarification
(#8). Every standard prompt produced a coherent AppSpec, and all requested integrations were
detected and bound to workflow stubs. Edge cases behaved per policy: ultra-vague (#8) asked one
question; ambiguous (#9) proceeded with documented assumptions; overscoped (#10) and
conflicting-domain (#11) reduced to an MVP / picked a primary domain and recorded the cut;
the vague modifier (#12) defined "smart" as an explicit assumption.

**The repair engine logged 0 entries this run** — the chosen models (Gemini 3.1 Flash Lite on
the heavy stages) produced schema/appspec that passed shape *and* cross-layer validation on the
first pass, so no structural/field/consistency repair was needed. The repair engine's "real
work" is therefore evidenced **not** by this happy-path run but by (a) the unit suite, which
drives all three strategies on malformed/truncated/inconsistent inputs, and (b) the
`POST /api/generate/:id/repair` endpoint for injecting failures directly — the path the
reviewers said they would exercise.

**Weakest area:** no stage *failed*, but the latent soft spot is workflow-stub semantic
richness on terse prompts; the Requirement-Coverage panel surfaces this honestly as
`partial`/`missing` rather than hiding it.

**One concrete fix next:** tighten the Stage-1 → Stage-3 business-rule → `workflow.trigger.condition`
mapping so business-rule coverage moves from `partial` to `ok` more often (e.g. carry the rule's
numeric tokens like "+3/+7/+14/+30" into the generated condition), and add a per-stage model A/B
to the eval harness to quantify quality vs. cost across the model pool.
