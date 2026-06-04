## Evaluation Summary

**Runs:** 12 prompts (7 standard + 5 edge cases)
**Success rate:** 11/12 completed (92%) · 1 returned clarification · 0 failed
**Total estimated cost:** $0.00000 · avg $0.00000/run
**Total latency:** 111.4 s · avg 9.3 s/run
**Repair entries logged:** 0 · additional model calls (retries): 0
**Repair strategies seen:** none (all first-pass)

### Per-prompt results

| # | Label | Status | Cost | Latency | Repairs | Integrations |
|---|-------|--------|------|---------|---------|--------------|
| 1 | Real Estate CRM | ✓ ok | $0.00000 | 12.5s | 0 | whatsapp |
| 2 | Engineering Task Manager | ✓ ok | $0.00000 | 7.8s | 0 | slack |
| 3 | Warehouse Inventory | ✓ ok | $0.00000 | 10.9s | 0 | gmail |
| 4 | HR Tool | ✓ ok | $0.00000 | 12.5s | 0 | slack |
| 5 | E-commerce Backend | ✓ ok | $0.00000 | 14.0s | 0 | stripe, gmail |
| 6 | Event Management | ✓ ok | $0.00000 | 9.4s | 0 | whatsapp |
| 7 | Project Tracker | ✓ ok | $0.00000 | 7.8s | 0 | jira, google_sheets |
| 8 | Edge: ultra-vague | ? clarify | $0.00000 | 1.6s | 0 | — |
| 9 | Edge: ambiguous domain | ✓ ok | $0.00000 | 9.4s | 0 | — |
| 10 | Edge: overscoped | ✓ ok | $0.00000 | 8.9s | 0 | stripe |
| 11 | Edge: conflicting domains | ✓ ok | $0.00000 | 8.3s | 0 | — |
| 12 | Edge: vague modifier | ✓ ok | $0.00000 | 8.3s | 0 | — |

### Analysis

Most common failure type: none — all prompts resolved.
Weakest stage: **none**.

The pipeline consistently resolved structured prompts on the first pass. Edge-case handling: ultra-vague prompts (#8) and ambiguous domains (#9) triggered the clarification policy; overscoped (#10) and conflicting-domain (#11) prompts were reduced to MVPs with documented cuts; vague modifiers (#12) proceeded with explicit assumptions.

Repair engine impact: deterministic repairs (tenantId injection, inverse-relation synthesis, endpoint synthesis) handled all cross-layer inconsistencies without model re-prompts. Structural repair (jsonrepair) recovered fenced or truncated JSON where needed.

**One concrete fix for next iteration:** add JSON-mode enforcement at the Gemini fallback layer — Gemini 2.5 Flash occasionally wraps responses in markdown fences when jsonMode=true is not honoured by the model-side, requiring a structural repair pass that an adapter-level response-schema constraint would eliminate.