# AppSpeX — Project Context for Claude

A multi-stage AI generation pipeline that converts a natural-language app description
into a validated, machine-readable **AppSpec** — the structured configuration object a
downstream code generator would consume. Built as a 3-day trial task for OneAtlas.dev.

Help like a pragmatic senior engineer: run tests before claiming done, be honest about
tradeoffs, keep scope tight, match existing style.

---

## What the app does

User types: *"Build a CRM for a real estate agency with WhatsApp notifications when a deal closes."*

Pipeline produces:
1. **AppIntent** — appName, appType, entities, features, integrations requested, assumptions
2. **DataSchema** — entities with fields (typed), relations (bidirectional), every entity has a `tenantId`
3. **AppSpec** — pages, API endpoints, auth rules, integrationHooks, workflowStubs

Each stage validates, repairs deterministically, and escalates with a targeted re-prompt only
as a last resort (never blind retries).

---

## Architecture

```
Next.js App Router (single project, Node runtime on Railway/Render)
  │
  ├── src/app/               React frontend (glassmorphism, dark)
  │     └── page.tsx         Main UI: prompt → SSE stages → output panels
  │
  ├── src/app/api/           Route handlers (thin — delegate to src/lib/)
  │     ├── generate/        POST /api/generate  GET /:id  GET /:id/stream  POST /:id/repair
  │     ├── integrations/    GET /api/integrations
  │     └── runs/            GET /api/runs  GET /api/runs/:id
  │
  └── src/lib/               Framework-free engine (all testable without a server)
        ├── schemas/         Zod schemas — the typed spine (z.infer = TS type + runtime validator)
        ├── validation/      Shape + cross-layer semantic checks, never throws
        ├── repair/          3 classified strategies + logging
        ├── integrations/    14-integration registry, RegistryView port
        ├── gateway/         Provider-agnostic AI gateway, routing, cost
        ├── pipeline/        Stage orchestration, prompts, SSE events
        ├── jobs/            In-memory job store + SSE event buffer
        └── runs/            Disk-backed run history + cost totals (.data/)
```

**One rule:** route handlers are thin. All logic lives in `src/lib/`. This keeps the entire
engine unit-testable with vitest — no server, no live API keys needed for tests.

---

## Critical conventions — FOLLOW THESE

### TypeScript
- **Strict mode + `noUncheckedIndexedAccess` + `noImplicitOverride`** always on.
- **No `any`** — ESLint `@typescript-eslint/no-explicit-any: "error"`. Use `unknown` + type guards.
- **Zod pattern:** `const FooSchema = z.object({…}); type Foo = z.infer<typeof FooSchema>;`
  — the schema IS the type. Never define a separate interface that mirrors a Zod schema.
- Always check `npm run typecheck` passes before claiming done.

### Schemas (src/lib/schemas/)
- **Shape only** in Zod — field types, enums, required keys.
- **Semantic rules** (tenantId presence, bidirectional relations, page→API, hook→registry)
  live in the **validation engine** as named `ValidationErrorCode` literals, not Zod `.refine()`.
- Reason: named error codes are what the repair engine switches on. Zod refine produces opaque errors.

### Validation engine (src/lib/validation/)
- **Never throws.** Always returns `StageValidation<T> = { result: ValidationResult, data: T | null }`.
- `ValidationErrorCode` is a closed union — add new codes here, never use raw strings.
- `RegistryView` is the narrow port validation depends on (not the concrete registry). Tests fake it.

### Repair engine (src/lib/repair/)
Three strategies, **deterministic-first**:
1. **structural** — `jsonrepair` to recover malformed/truncated/fenced JSON. No LLM.
2. **field** — fill typed defaults for missing/wrong-type primitives/arrays/objects. No LLM.
   Escalates (returns `unresolved`) for enum values it cannot safely guess.
3. **consistency** — fix cross-layer refs (add `tenantId`, synthesize inverse relation,
   synthesize missing endpoint, add missing role, drop dangling refs). No LLM.
Every attempt logged: `{ strategy, errorInput, outcome: repaired|escalated|failed, detail }`.

### Gateway (src/lib/gateway/)
- Stages call `gateway.generate(stage, req)` — **never name a model or provider** in stage code.
- The only place models are named: `routing.config.ts`.
- **`MODELS` registry** maps logical ids → `{ provider, providerModel, openRouterModel }`.
- **`COST_TABLE`** maps provider model strings → `{ inputPer1M, outputPer1M }` in USD.
- On 429/5xx from primary: retry via OpenRouter universal fallback → then stage fallback.
- Gateway takes injected `getApiKey` + `fetchImpl` so tests mock the network.

### Current routing (minimum spend — ~$0.002/run)
| Stage | Primary | Fallback |
|---|---|---|
| intent, repair | Groq `llama-3.1-8b-instant` ($0.05/$0.08 per 1M) | Gemini 2.5 Flash (free tier) |
| schema | Groq `openai/gpt-oss-20b` ($0.075/$0.30 per 1M) | Gemini 2.5 Flash |
| appspec | Groq `openai/gpt-oss-120b` ($0.15/$0.60 per 1M) | Gemini 2.5 Flash |
| 429/5xx universal | OpenRouter `nvidia/nemotron-*:free` ($0) | — |

To change routing: edit **only** `src/lib/gateway/routing.config.ts`.

### Pipeline (src/lib/pipeline/)
- `runStage<T>()` — generic runner. At most 3 model calls: initial → shape correction → semantic correction.
- Clarification policy: if AppIntent has `clarification_required=true`, pipeline halts before Stage 2.
  Trigger: cannot identify both appType AND at least one entity from the prompt.
- `ensureWorkflowCoverage()` — deterministic post-Stage-3 pass guaranteeing ≥1 workflowStub
  per requested integration. No model call.

### Job store (src/lib/jobs/)
- **In-memory** — requires a long-running Node process (Railway/Render, **not Vercel serverless**).
- Per-job SSE event buffer enables full replay on reconnect.
- `startJob()` fires the pipeline async; `onEvent` feeds both in-memory store and disk store.

### Run history (src/lib/runs/)
- Every completed run persisted to `.data/runs/<id>.json` (full `JobStatusResponse`).
- `.data/runs-index.json` — compact summaries for totals and the history list.
- `.data/` is git-ignored. On deploy: mount a persistent volume at this path.
- `RunStore` is a singleton on `globalThis` (survives Next dev hot-reloads).

### Integration registry (src/lib/integrations/)
- 14 integrations total; 5 **fully implemented** (Slack, Webhook+HMAC, Stripe, Gmail, Jira);
  9 registered with correct metadata but `implemented: false`.
- Every action carries `input: ActionField[]` and `output: ActionField[]` — enough to implement
  the real HTTP call from the stub alone.
- `integrationRegistry` implements `RegistryView` (the narrow port used by validation/repair).
- To add an integration: add an entry to `INTEGRATION_CATALOG` in `catalog.ts`.

### Secrets + env
- Real keys in `.env.local` (git-ignored). Never in `.env.example` (committed blank template).
- `src/lib/env.ts` — typed Zod parse of `process.env`. All 8 provider keys optional at boot.
- Never hardcode keys. Never add secrets to `.env.example`.

---

## Module map (src/lib/)

| Module | Key exports | Depends on |
|---|---|---|
| `schemas/` | `AppIntentSchema`, `DataSchema`, `AppSpecSchema` + all sub-types | `zod` |
| `validation/` | `validateIntent`, `validateDataSchema`, `validateAppSpec`, `RegistryView` | `schemas/` |
| `repair/` | `structuralRepair`, `fieldRepair`, `repairDataSchemaConsistency`, `repairAppSpecConsistency` | `schemas/`, `validation/` |
| `integrations/` | `integrationRegistry`, `INTEGRATION_CATALOG`, `IntegrationRegistry` | — |
| `gateway/` | `Gateway`, `gateway` (singleton), `MODELS`, `COST_TABLE`, `ROUTING` | `env/` |
| `pipeline/` | `runPipeline`, `runStage`, stage fns, prompts, `PipelineEvent` | `gateway/`, `validation/`, `repair/`, `integrations/` |
| `jobs/` | `jobStore`, `startJob`, `toStatusResponse` | `pipeline/`, `runs/` |
| `runs/` | `runStore`, `RunStore`, `RunsOverview` | `jobs/` (types only) |

---

## API surface

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/generate` | `{ prompt }` → `{ jobId }` (202) |
| `GET` | `/api/generate/:id` | Full `JobStatusResponse` (cost, repairs, AppSpec) |
| `GET` | `/api/generate/:id/stream` | SSE stream — replays all prior events on reconnect |
| `POST` | `/api/generate/:id/repair` | `{ stage, errorHint }` → manually trigger repair pass |
| `GET` | `/api/integrations` | Full integration registry (14 integrations) |
| `GET` | `/api/runs` | `{ totals, history }` — cumulative cost + newest-first run list |
| `GET` | `/api/runs/:id` | Full stored `JobStatusResponse` for a past run |

All routes use `export const runtime = "nodejs"` — required for in-memory stores + filesystem.

---

## Frontend (src/app/page.tsx + src/components/panels.tsx)

Stack: Next.js App Router, React 19, Tailwind v4.
Style: glassmorphism — frosted-glass cards on a dark backdrop, high-contrast text inside
panels (never blur on data). No animations, no marketing copy.

**Nine panels rendered:**
1. **Prompt** — textarea + Generate button + 3 example chips
2. **Pipeline** — live SSE stage pills (pending → running → complete/failed + latency ms)
3. **Entities & Fields** — entity list with typed field table per entity
4. **Pages & API Endpoints** — dual table
5. **Integrations & Workflows** — hooks + workflowStubs
6. **Validation & Repairs** — repair log (strategy/outcome per entry) + error list
7. **Cost & Latency** — per-stage + per-provider breakdown
8. **Run History & Spend** — cumulative totals + clickable history (reloads past run into all panels)
9. **Integration Registry** — all 14 integrations with implemented/stubbed badge

---

## Dev commands

```bash
cd C:\Users\aloks\Desktop\oneatlas

npm install                 # install deps
npm run dev                 # dev server → http://localhost:3000  (needs .env.local)
npm test                    # 46 unit tests (no server, no keys needed)
npm run typecheck            # tsc --noEmit
npm run lint                # eslint
npm run eval                # run all 12 eval prompts against live dev server
npm run build && npm start  # production build
```

**Env file:** copy `.env.example` → `.env.local`, fill in `GROQ_API_KEY`, `GEMINI_API_KEY`,
`OPENROUTER_API_KEY`. The other 5 provider keys are optional.

---

## Deploy target

**Railway or Render** as a persistent Node.js server (`npm run build && npm start`).
**Not Vercel serverless** — the in-memory job store and `.data/` filesystem writes require
a long-running process. Mount a persistent volume at `/app/.data` in production.

---

## Data flow

```
POST /api/generate { prompt }
  └─ startJob(prompt)
       └─ runPipeline(prompt, { onEvent })
             Stage 1 intent  → Groq 8B  → validate → repair
             Stage 2 schema  → Groq 20B → validate (semantic) → consistency repair
             Stage 3 appspec → Groq 120B → validate (cross-layer) → consistency repair
                             → ensureWorkflowCoverage (deterministic, no model call)
             each event → jobStore.append + SSE broadcast
             generation_complete → runStore.save → .data/runs/<id>.json
       └─ returns { jobId } immediately (202)

GET /api/generate/:id/stream
  └─ replay job.events[] synchronously, then subscribe to live events
  └─ each event emitted as SSE with event.type as the SSE event name

GET /api/generate/:id
  └─ toStatusResponse(job) → full public shape (cost, repairs, AppSpec, clarification)
```

---

## Known cuts (documented, not bugs)

- **In-memory job store** — jobs lost on server restart. Needs Redis/DB for production.
- **`.data/` volume** — must be a persistent volume on Railway/Render; ephemeral on local dev is fine.
- **No live OAuth** — integration actions are correct stubs; real HTTP calls not implemented.
- **9 integrations stubbed** — `implemented: false`; correct metadata, no execution code.
  Fully implemented: Slack, Webhook+HMAC, Stripe, Gmail, Jira.
- **Repair re-prompts use same model tier** — a future improvement would escalate to the next
  model tier on second failure rather than the same model.

---

## Commits
No `Co-Authored-By` line. Commit author is the repo owner only.
