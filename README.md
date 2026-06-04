# AppSpeX

A multi-stage AI generation pipeline that turns a plain-English app description into a
**validated, machine-readable AppSpec** — the structured configuration object a downstream
code generator or template engine would consume (not raw code, not markdown, not a chat reply).

> Prompt → **Intent** → **DataSchema** → **AppSpec**, with validation, deterministic repair,
> multi-provider routing, an integration registry, and an observability layer that shows you
> *what was understood, what was repaired, and what was missed*.

Built for the OneAtlas AI Engineer 3-day trial.

---

## Quick start (< 5 minutes)

**Prerequisites:** Node.js ≥ 18.17 (developed on 22).

```bash
# 1. install
npm install

# 2. add API keys (free tiers are enough)
cp .env.example .env.local
#   then paste your keys into .env.local (see "Environment variables" below)

# 3. run
npm run dev          # → http://localhost:3000
```

Open http://localhost:3000, type a prompt (or click an example), and watch the three
pipeline stages stream live, then the AppSpec, coverage, repairs, and cost panels populate.

**No keys? You can still verify the engine** — the entire pipeline (validation, repair,
gateway routing, registry) is unit-tested without a server or live API calls:

```bash
npm test         # full engine test suite — no keys needed
npm run typecheck
npm run lint
```

---

## Environment variables

Copy `.env.example` → `.env.local` (git-ignored). The gateway *supports* all eight providers,
but the default routing only needs the first three:

| Variable | Required? | Get a key |
|---|---|---|
| `GROQ_API_KEY` | **Yes** | https://console.groq.com/keys |
| `GEMINI_API_KEY` | **Yes** (fallback) | https://aistudio.google.com/app/apikey |
| `OPENROUTER_API_KEY` | **Yes** (universal 429/5xx fallback) | https://openrouter.ai/keys |
| `OPENAI_API_KEY` | Optional | supported via routing config |
| `ANTHROPIC_API_KEY` | Optional | supported via routing config |
| `DEEPSEEK_API_KEY` | Optional | supported via routing config |
| `MISTRAL_API_KEY` | Optional | supported via routing config |
| `GOOGLE_AI_API_KEY` | Optional | supported via routing config |

All three required keys have usable **free tiers** — a full 12-prompt evaluation costs **≈ $0**.

---

## Pipeline architecture

```
POST /api/generate ─► Job (in-memory + SSE) ─► runPipeline
                                                   │
   Stage 1  INTENT    raw prompt ─► AppIntent      │  validate (shape) ─► repair
   Stage 2  SCHEMA    AppIntent  ─► DataSchema     │  validate (shape + cross-layer) ─► repair
   Stage 3  APPSPEC   DataSchema ─► AppSpec        │  validate (cross-layer) ─► repair
                                                   ▼
                          ensureWorkflowCoverage (deterministic) ─► persisted run history
```

Everything is a **framework-free engine in `src/lib/`** (route handlers are thin), so the
whole pipeline is testable without a server.

- **Typed spine (`schemas/`)** — each stage's output is one Zod schema that doubles as the
  TypeScript type (`z.infer`). Validator and type can never drift. No `any` anywhere.
- **Validation engine (`validation/`)** — runs after every stage, **never throws**, returns
  structured error objects. Checks shape *and* cross-layer coherence: every entity has a
  `tenantId`; relations are bidirectionally consistent; every page has an API; workflow stubs
  reference real entities; hooks reference registered integrations + valid actions.
- **Repair engine (`repair/`)** — three *classified, logged* strategies, deterministic-first
  (see below).
- **Multi-provider gateway (`gateway/`)** — provider-agnostic `generate(stage, req)`. Model
  selection is **config-driven** in `routing.config.ts` (no hardcoded model names in stage
  code). On a 429/5xx the gateway retries the **OpenRouter equivalent**, then the stage
  fallback. Per-token cost is computed from a `COST_TABLE` and logged per stage + per provider.
- **Integration registry (`integrations/`)** — first-class registry of 14 integrations with
  typed trigger/action descriptors (see below).
- **Streaming API (`jobs/`)** — SSE endpoint emits real-time stage events and **replays all
  prior events on reconnect**.
- **Observability (`coverage.ts`, `export.ts`, `runs/`)** — requirement coverage, repair
  health, persistent run history, and PDF/JSON export.

### Repair engine — three strategies (not "retry the prompt")

| Strategy | What it does | LLM? |
|---|---|---|
| **structural** | Recover malformed/truncated/fenced JSON via `jsonrepair` | No |
| **field** | Fill typed defaults for missing/wrong-type fields; escalate unguessable enums | No |
| **consistency** | Add missing `tenantId`, synthesize the missing inverse relation, synthesize a missing endpoint, add a missing role, drop dangling refs | No |

Only genuinely undecidable cases escalate to a **single targeted re-prompt** carrying the exact
errors — never a blind full retry. Every attempt is logged with
`{ strategy, errorInput, outcome: repaired | escalated | failed, detail }`.

---

## Integrations: implemented vs stubbed

The registry holds **14 integrations**; **5 are fully implemented** (correct, complete
trigger/action metadata with typed input/output schemas, ready to wire a real call from the
stub alone). The rest are **registered** with correct metadata but marked `implemented: false`.
No live OAuth/HTTP is performed — per the task, the metadata and payload shapes are what matter.

| Fully implemented | Registered (stubbed) |
|---|---|
| Slack · Webhook (HMAC) · Stripe · Gmail · Jira | WhatsApp · Google Sheets · Salesforce · HubSpot · Notion · Airtable · Twilio SMS · GitHub · Zapier |

A hook/workflow that references an unregistered integration — or a valid integration with an
invalid action — is a **validation error**.

---

## Model routing & cost

Routing is **config-driven** in one file — **`src/lib/gateway/routing.config.ts`**. Stage code
never names a model; it calls `gateway.generate(stage, req)`. The model pool and per-token USD
rates live in `gateway/models.ts`.

**Routing logic = by stage workload.** Light stages (tiny output) stay on Groq — fastest and
cheapest, no per-minute output-token timeout. Output-heavy stages (large JSON) go to Gemini,
which has the throughput headroom Groq lacks. Fallbacks are cross-provider for resilience.

| Stage | Primary | Fallback |
|---|---|---|
| `intent` (tiny output) | Groq `llama-3.1-8b-instant` | Gemini 3.1 Flash Lite |
| `repair` (one field) | Groq `llama-3.1-8b-instant` | Gemini 3.1 Flash Lite |
| `schema` (large JSON) | **Gemini 3.1 Flash Lite** | Groq `llama-3.3-70b-versatile` |
| `appspec` (largest JSON) | **Gemini 3.1 Flash Lite** | Groq `llama-3.3-70b-versatile` |

On a **429/5xx** from the primary, the gateway first retries the **OpenRouter equivalent**
(`nvidia/nemotron-*:free`, $0) before dropping to the stage's fallback. Per-token cost is
computed from `COST_TABLE` and logged per stage + per provider on the job-status endpoint.

Cheap models do the work and **the repair engine is the reliability layer**, so no frontier
model is needed. The full 14-model pool (incl. `gpt-oss-20b/120b`, OpenAI, Anthropic, DeepSeek,
Mistral) is supported — re-routing any stage is a one-line edit in `routing.config.ts`.

---

## API

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/generate` | `{ prompt }` → `{ jobId }` |
| `GET` | `/api/generate/:id/stream` | SSE: `stage_start`, `stage_complete`, `stage_failed`, `clarification_required`, `generation_complete`; replays prior events on reconnect |
| `GET` | `/api/generate/:id` | Job status: full AppSpec (or error), repair log, cost breakdown (tokens + USD per stage/provider), latency per stage |
| `POST`| `/api/generate/:id/repair` | `{ stage, errorHint }` — manually trigger a repair pass |
| `GET` | `/api/integrations` | The full integration registry |
| `GET` | `/api/runs` | Cumulative cost totals + run history |
| `GET` | `/api/runs/:id` | A full persisted past run |

---

## Frontend

Minimal, dark, glassmorphism. Required panels: prompt input · live SSE stage progress
(status + latency) · structured AppSpec output (entities, pages/APIs tables, workflows) ·
validation & repair panel · integration registry. Plus the observability additions:
**Requirement Coverage** (ok / partial / missing per requirement), **Generation Health**
(healthy vs concerning repairs), **Run History & Spend**, and PDF/JSON export.

---

## Evaluation

```bash
npm run dev           # in one terminal
npm run eval          # in another — runs all 12 prompts against the live server
```

Produces **`eval-log.json`** (per-prompt success, failed stage, repair strategies, retry count,
latency, estimated cost, integrations detected) and a 300-word **`eval-summary.md`**.

---

## Deployment

Deploy as a **persistent Node.js server** (Railway / Render): `npm run build && npm start`.

> **Not Vercel serverless** — the in-memory job store and the `.data/` run-history files
> require a long-running process. On Railway/Render, mount a **persistent volume at `.data/`**.

---

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Dev server |
| `npm test` | Unit tests (no server/keys) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint (incl. `no-explicit-any`) |
| `npm run eval` | Run the 12-prompt evaluation suite |
| `npm run build && npm start` | Production server |

---

## Deliberate cuts (72-hour scope)

- **In-memory job store** — jobs are lost on restart; production would use Redis/DB.
- **Run history is local files** (`.data/`) — needs a persistent volume in production.
- **No live OAuth / HTTP** — integration actions are correct metadata stubs.
- **9 of 14 integrations** are registered stubs (correct metadata, no execution code).
- **Repair re-prompts reuse the stage's model tier** rather than escalating to a stronger one.

## Engineering

TypeScript strict mode + `noUncheckedIndexedAccess`, ESLint `no-explicit-any` enforced as an
error, Zod for runtime+static types, Vitest. The engine is decoupled from the framework and
from the network (gateway takes injected `getApiKey` + `fetch`), so validation, repair, and
routing are all unit-tested deterministically.
