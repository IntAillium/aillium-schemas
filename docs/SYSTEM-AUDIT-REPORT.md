# Aillium Full-System Bug Crawl and Audit Report

**Date**: 2026-05-21
**Auditor**: Claude (Principal Engineer / QA Architect role)
**Scope**: All 11 Aillium repositories (5 fully audited locally, 6 inspected via GitHub API)
**Standard**: Pre-production readiness review

---

## A. Executive Summary

### Overall Health: NOT READY FOR PRODUCTION

**Would I trust this system to run autonomous agent workflows for real users?** No. The system has significant structural issues that prevent it from functioning as a coherent active/proactive AI agent platform.

**The most critical finding**: The entire Aillium integration boundary in aillium-openclaw — the 4-file adapter layer that connects the operator runtime to Aillium Core — is **100% dead code**. It is never imported, never instantiated, never called. This means the runtime has zero integration with the enterprise control plane. Runtime registration never happens. Evidence callbacks never fire. Staff Room context is never injected. Governance policies are never consulted. The "enterprise AI agent platform" is currently just stock OpenClaw with some unused adapter files sitting next to it.

**Second most critical**: The MeshCentral adapter (remote support) calls REST API endpoints that **do not exist** — MeshCentral uses WebSocket, not REST. The entire remote support integration is non-functional.

**Third**: Multiple critical security vulnerabilities exist across repos — `eval()` on LLM output, unauthenticated desktop control bridge, wildcard CORS on authenticated endpoints, critical npm dependency vulnerabilities.

### Biggest Blockers (in order)
1. aillium-openclaw's Aillium integration boundary is dead code — no enterprise features work
2. MeshCentral adapter uses wrong protocol — remote support is broken
3. aillium-schemas has a broken JSON Schema (`task` definition can never validate)
4. No CI/CD pipelines across any repository
5. Zero end-to-end integration tests
6. Bus factor of 1 (single developer across all repos)

### Highest-Risk Areas
1. **Security**: eval() on LLM output, unauthenticated desktop bridge, wildcard CORS, critical dependency vulns
2. **Integration**: Dead integration boundary, wrong protocol for MeshCentral, disconnected schema package
3. **Data integrity**: Cross-format schema drift (TS vs Python vs JSON Schema), broken JSON Schema validation
4. **Operational**: No tests in 4 repos, no CI in any repo, no monitoring, no alerting

---

## B. Repository Map

### B1. aillium-core (PRIVATE — inspected via GitHub API)

| Attribute | Value |
|-----------|-------|
| **Purpose** | Enterprise control plane: tenancy, RBAC, approvals, task bus, governance, billing |
| **Technologies** | NestJS (TypeScript) + Rust daemon (Tokio/Axum), Prisma/PostgreSQL, Redis, JWT auth |
| **Key Entrypoints** | 72 controllers, ~200 services, Prisma schema (176KB) |
| **Connections** | → OpenClaw runtime (HTTP/WS), → PostgreSQL, → Redis, → AI providers (6+), → Workspace connectors (OAuth), → Telegram, → n8n, → MeshCentral, → Stripe |
| **Health** | Active development. Massive codebase. app.module.ts is 29KB. Dual runtime stacks (NestJS + Rust). No CI testing. |

### B2. aillium-openclaw (PUBLIC — fully audited)

| Attribute | Value |
|-----------|-------|
| **Purpose** | Operator runtime: agent execution, tool invocation, messaging gateway (fork of OpenClaw) |
| **Technologies** | TypeScript/Node.js ESM, pnpm, Playwright, sqlite-vec, zod |
| **Key Entrypoints** | `src/gateway/` (WebSocket + HTTP server), `src/agents/pi-embedded-runner/run.ts` (agent loop), `src/aillium/` (integration boundary — DEAD) |
| **Connections** | → Aillium Core (via dead adapters), → 50+ messaging channels, → AI model providers, → MCP servers, → UI-TARS desktop bridge |
| **Health** | Core OpenClaw runtime works (8,484/8,487 tests pass). Aillium integration layer is 100% dead code. 7 TypeScript errors in aillium-mcp-http.ts. |

### B3. aillium-schemas (PUBLIC — fully audited)

| Attribute | Value |
|-----------|-------|
| **Purpose** | Shared contract schemas: Zod validators (TS), Pydantic models (Python), JSON Schema definitions |
| **Technologies** | TypeScript (Zod), Python (Pydantic), JSON Schema |
| **Key Entrypoints** | `packages/typescript/src/contracts.ts` (202 exports), `schemas/` (9 JSON Schema files), `packages/python/` |
| **Connections** | Consumed by aillium-core (git dep), aillium-ui-tars (pinned git ref), aillium-openclaw (NOT consumed) |
| **Health** | All tests pass (9/9 TS, 59/59 TS autonomous, 16/16 Python). CRITICAL: `task` JSON Schema is broken. Staff Room types missing from Python. Cross-format drift. No CI. |

### B4. aillium-ui-tars (PUBLIC — fully audited)

| Attribute | Value |
|-----------|-------|
| **Purpose** | Python GUI automation worker: polls task-bus, performs MeshCentral remote handshakes, captures evidence |
| **Technologies** | Python 3.12, hatchling, asyncio, aillium-schemas (pinned git ref) |
| **Key Entrypoints** | `codes/src/aillium_ui_tars/worker.py` (polling loop), `codes/src/aillium_ui_tars/executor/` |
| **Connections** | → Aillium Core (task-bus API), → MeshCentral (HTTP API) |
| **Health** | 15/15 tests pass. CRITICAL: eval() on LLM output in action_parser.py. Response schema validation deliberately skipped. No type checking. |

### B5. aillium-ui-tars-desktop (PUBLIC — fully audited)

| Attribute | Value |
|-----------|-------|
| **Purpose** | Electron desktop GUI agent: uses vision-language models to automate user's computer/browser |
| **Technologies** | Electron, TypeScript, React, NutJS, Playwright, pnpm monorepo, Turbo |
| **Key Entrypoints** | `apps/ui-tars/src/main/main.ts`, `packages/ui-tars/sdk/src/GUIAgent.ts`, `apps/ui-tars/src/main/services/desktopRpcBridge.ts` |
| **Connections** | → Aillium Core/OpenClaw (via RPC bridge on port 47891), → VLM API providers |
| **Health** | 263/320 tests pass (57 browser tests fail — need browser env). CRITICAL: RPC bridge unauthenticated by default. Arbitrary instruction execution. |

### B6. aillium-remote-meshcentral (PUBLIC — fully audited)

| Attribute | Value |
|-----------|-------|
| **Purpose** | Remote support data plane (fork of MeshCentral v1.1.57) |
| **Technologies** | JavaScript (Node.js), MeshCentral upstream |
| **Key Entrypoints** | `meshcentral.js` (upstream), `aillium/` (adapter layer — on unmerged branch) |
| **Connections** | → Aillium Core (via adapter API — BROKEN) |
| **Health** | CRITICAL: API client calls non-existent REST endpoints (MeshCentral uses WebSocket). Implementation not merged to master. Critical npm vulnerabilities. Zero tests. |

### B7. aillium-portal (PRIVATE — inspected via GitHub API)

| Attribute | Value |
|-----------|-------|
| **Purpose** | React web UI for the Aillium platform |
| **Technologies** | React 18, Vite 6, TypeScript, Tailwind CSS, nginx |
| **Key Entrypoints** | 72 pages, `src/lib/api.ts` (211KB monolithic API client) |
| **Connections** | → Aillium Core (/api proxy via nginx), → Operator Runtime (WS) |
| **Health** | Active development. No tests. 211KB api.ts file. Multiple oversized components (100KB+). No shared types with core. |

### B8. aillium-integrations (PRIVATE — inspected via GitHub API)

| Attribute | Value |
|-----------|-------|
| **Purpose** | Connector registry metadata, n8n workflow templates, webhook definitions |
| **Technologies** | TypeScript (ESM), Zod |
| **Key Entrypoints** | `src/connectors/registry.ts`, `src/workflows/templates.ts` |
| **Connections** | NOT imported by aillium-core (disconnected) |
| **Health** | Small codebase. No tests. Disconnected from the system it's supposed to serve. |

### B9. aillium-remote (PRIVATE — inspected via GitHub API)

| Attribute | Value |
|-----------|-------|
| **Purpose** | Originally intended for remote support orchestration |
| **Technologies** | None |
| **Key Entrypoints** | None |
| **Connections** | None — empty repo |
| **Health** | Empty placeholder. All remote-assist logic absorbed into aillium-core. Should be archived. |

### B10. platform (PRIVATE — inspected via GitHub API)

| Attribute | Value |
|-----------|-------|
| **Purpose** | Docker Compose orchestration, deployment scripts, CI/CD |
| **Technologies** | Docker Compose, Bash, Traefik, GitHub Actions |
| **Key Entrypoints** | `docker-compose.local.yml`, `scripts/dev-up.sh`, `scripts/deploy-vps.sh` |
| **Connections** | Orchestrates: core, portal, postgres, openclaw, tars-worker, meshcentral, n8n |
| **Health** | Active. .env.local committed with dev credentials. Single deploy workflow (no CI testing). |

### B11. aillium-code (PRIVATE — inspected via GitHub API)

| Attribute | Value |
|-----------|-------|
| **Purpose** | Archive/mirror of leaked Anthropic Claude Code CLI source |
| **Technologies** | TypeScript/Bun (Claude Code's stack) |
| **Connections** | None with Aillium platform |
| **Health** | Legal/IP risk. Not a product repo. Should be evaluated for removal. |

---

## C. Feature Audit Matrix

| Feature | Expected Behaviour | Current State | Gaps | Key Files | Severity | Action |
|---------|-------------------|---------------|------|-----------|----------|--------|
| **Aillium Core Integration** | OpenClaw runtime registers with Core, forwards lifecycle events, receives context | **DEAD CODE** — adapters exist but never wired in | Integration boundary never imported | `openclaw/src/aillium/*` | CRITICAL | Wire adapters into bootstrap/startup |
| **Agent Runtime** | Execute agent loops with tool use, context management | **WORKING** | Upstream OpenClaw, functions correctly | `openclaw/src/agents/pi-embedded-runner/` | OK | — |
| **System Prompt Assembly** | Build structured system prompt with identity, tools, context | **WORKING** but missing enterprise context | No provider status, user role, approval state, tenant flags injected | `openclaw/src/agents/system-prompt.ts` | HIGH | Inject AgentContextEnvelope |
| **Tool Catalog** | Provide available tools filtered by profile | **WORKING** | Static definitions only, no dynamic capability check | `openclaw/src/agents/tool-catalog.ts` | MEDIUM | Wire to capability registry |
| **Exec Approval Flow** | Gate shell commands behind human approval | **WORKING** | Timeout-based, no governance policy connection | `openclaw/src/gateway/exec-approval-manager.ts` | LOW | Connect to Core governance |
| **MCP Tool Integration** | Discover and invoke MCP server tools | **PARTIAL** — 7 TypeScript errors | Zod v4 migration incomplete breaks type safety | `openclaw/src/gateway/aillium-mcp-http.ts` | HIGH | Fix zod v4 compat |
| **Memory System** | Persistent vector-search memory | **WORKING** | sqlite-vec built-in + LanceDB plugin, both persistent | `openclaw/src/memory/` | OK | — |
| **Context Engine** | Manage conversation context under token budgets | **WORKING** | Pluggable architecture with compaction | `openclaw/src/context-engine/` | OK | — |
| **Browser Automation** | Agent can use a browser via Playwright | **WORKING** | CDP proxy, Chrome extension MCP | `openclaw/` + browser-related tools | OK | — |
| **Visible Browser Sessions** | User can watch agent's browser activity | **PARTIAL** | Desktop app shows local browser; remote has VNC/RDP URLs; Python worker has none | `ui-tars-desktop/` operators | MEDIUM | Needs unified viewer |
| **Subagent Spawning** | Agents can spawn child agents with lifecycle management | **WORKING** | Full spawn/registry/cleanup/announce cycle | `openclaw/src/agents/subagent-*` | OK | — |
| **Cron/Scheduling** | Scheduled task execution | **WORKING** | Full cron with heartbeat, delivery, stagger | `openclaw/src/cron/` | OK | — |
| **Daemon/Background** | Install as system service | **WORKING** | launchd, systemd, schtasks | `openclaw/src/infra/daemon.ts` | OK | — |
| **Dreams/Proactive Behaviors** | Agent initiates actions without user prompt | **MISSING** | No proactive loop, no goal tracking, no event observation | None | HIGH | Design and implement |
| **Remote Support** | Control remote devices via MeshCentral | **BROKEN** | API client calls non-existent REST endpoints | `meshcentral/aillium/*` | CRITICAL | Rewrite to use WebSocket API |
| **Role/Permission Model** | Enterprise RBAC reflected to agent | **DISCONNECTED** | Core has RBAC; OpenClaw has 2 roles; never reconciled | `openclaw/src/gateway/role-policy.ts`, `schemas/contracts.ts` | CRITICAL | Reflect Core roles into runtime |
| **Error Translation** | Machine errors → user-actionable messages | **MISSING** | All errors catch-and-swallow or raw forwarding | `openclaw/src/aillium/live-boundary.ts` | HIGH | Implement error translation engine |
| **Approval Awareness** | Agent knows what needs approval before attempting | **MISSING** | Governance policies defined in schemas but not surfaced | `schemas/contracts.ts` | HIGH | Surface governance state in context |
| **Task Execution (Core)** | Task-bus dispatches work to executors | **WORKING** (in Core) | Task-bus controller+service exist in Core; Python worker polls it | `core/src/task-bus/` | OK | — |
| **Shared Schemas** | Consistent contracts across all services | **BROKEN** | JSON Schema `task` def broken; Staff Room missing from Python; cross-format drift | `schemas/` | CRITICAL | Fix broken schema, sync formats |
| **Desktop GUI Automation** | Agent controls user's desktop (mouse, keyboard) | **WORKING** but insecure | Full NutJS + Playwright operators; RPC bridge wide open | `ui-tars-desktop/` | CRITICAL (security) | Require auth token |
| **Evidence Collection** | Capture and store execution artifacts | **PARTIAL** | Python worker captures screenshots; MeshCentral adapter stores files; OpenClaw hooks never fire | Multiple repos | MEDIUM | Wire evidence hooks |
| **Observability** | Trace execution, audit actions, monitor health | **MINIMAL** | Security audit logs, cron logs, agent events exist; no trace correlation, no user-visible trail | `openclaw/src/security/`, `src/infra/` | MEDIUM | Add trace-id propagation |
| **CI/CD** | Automated testing and deployment | **MISSING** (testing) | Only deploy-vps.yml exists; no test pipelines | `platform/.github/` | HIGH | Add CI for all repos |
| **Confidence Signaling** | Agent indicates source/freshness of information | **MISSING** | No mechanism exists | None | LOW | Future phase |

---

## D. Bugs and Issues Found

### D1. CRITICAL

| # | Title | Repo | Files | Symptoms | Root Cause | Fix |
|---|-------|------|-------|----------|------------|-----|
| 1 | **Aillium integration boundary is 100% dead code** | aillium-openclaw | `src/aillium/*` | No enterprise features work: no registration, no evidence, no Staff Room context, no governance | The 4-file adapter layer is never imported by any module outside itself. No bootstrap code wires it in. | Wire `createLiveAilliumBoundary()` into gateway startup; pass boundary to agent runtime |
| 2 | **MeshCentral adapter calls non-existent REST API** | aillium-remote-meshcentral | `aillium/meshcentralApiClient.js` | Every API call returns 404. Remote support entirely non-functional. | MeshCentral uses WebSocket (`control.ashx`), not HTTP REST endpoints. The adapter was built against imaginary endpoints. | Rewrite client to use WebSocket protocol per meshctrl.js |
| 3 | **JSON Schema `task` definition broken** | aillium-schemas | `schemas/core/task-workflow.schema.json` | No document can ever validate against the `task` schema | `allOf` with two sub-schemas that each have `additionalProperties: false` — mutually exclusive | Flatten to single object schema or remove additionalProperties from allOf members |
| 4 | **`eval()` on LLM-generated strings** | aillium-ui-tars | `codes/src/aillium_ui_tars/action_parser.py:429,433,445,475` | Arbitrary code execution if LLM produces adversarial output | `eval(start_box)` on coordinate strings from model output | Replace with safe parsing (ast.literal_eval or regex extraction) |
| 5 | **Desktop RPC bridge unauthenticated by default** | aillium-ui-tars-desktop | `apps/ui-tars/src/main/services/desktopRpcBridge.ts:176-191` | Anyone on localhost (or network if host=0.0.0.0) can control mouse, keyboard, execute instructions | Empty string token check: `if (API_TOKEN)` is falsy when empty | Require token; refuse to start bridge without it |
| 6 | **Critical npm vulnerabilities in remote access server** | aillium-remote-meshcentral | `package.json` (handlebars, node-forge) | JS injection, prototype pollution, XSS, certificate forgery, signature forgery | Outdated dependencies inherited from MeshCentral fork | Update handlebars, node-forge, multiparty, lodash |
| 7 | **Wildcard CORS on authenticated endpoint** | aillium-openclaw | `src/gateway/server-http.ts:1038` | Any origin can read authenticated proxy responses | `Access-Control-Allow-Origin: *` on mobile avatar endpoint | Restrict to portal origin |
| 8 | **Race condition in mobile avatar POST handler** | aillium-openclaw | `src/gateway/server-http.ts:1049-1094` | Function returns before body is read; upstream errors unhandled | Mixing callback-style body parsing with async/await | Rewrite to await body parsing before returning |

### D2. HIGH

| # | Title | Repo | Files | Root Cause | Fix |
|---|-------|------|-------|------------|-----|
| 9 | TypeScript compilation errors in aillium-mcp-http.ts | aillium-openclaw | `src/gateway/aillium-mcp-http.ts` | Zod v4 migration incomplete — 7 type errors | Fix superRefine callbacks and headers typing for zod v4 |
| 10 | Staff Room types missing from Python and JSON Schema | aillium-schemas | `packages/python/`, `schemas/` | 13 types only in TypeScript | Add Python models and JSON Schema |
| 11 | Python embedded runtime.schema.json is stale | aillium-schemas | `packages/python/aillium_schemas/schemas/openclaw/` | Copy not updated when canonical was | Sync Python copy from canonical |
| 12 | MeshCentral implementation not merged to master | aillium-remote-meshcentral | Feature branch only | Branch never merged | Merge after fixing the WebSocket issue |
| 13 | Env var naming mismatch in MeshCentral adapter | aillium-remote-meshcentral | `.env.example` vs `meshcentralApiClient.js` | USERNAME vs USER, PASSWORD vs PASS | Align naming |
| 14 | API token auth bypass when token not set (MeshCentral) | aillium-remote-meshcentral | `aillium/httpApi.js:36-42` | Empty string is falsy, skips auth | Fail closed — refuse to start without token |
| 15 | Session store unbounded memory growth (MeshCentral) | aillium-remote-meshcentral | `aillium/sessionManager.js` | No eviction, no TTL, no max size | Add TTL sweep and size cap |
| 16 | aillium-integrations not imported by aillium-core | aillium-integrations / aillium-core | package.json | Package exists but core doesn't depend on it | Add git dependency or consolidate |
| 17 | .env.local committed with dev credentials | platform | `.env.local` | Not in .gitignore | Remove from repo, add to .gitignore |
| 18 | 211KB monolithic API client | aillium-portal | `src/lib/api.ts` | All API calls in one file | Split by domain |
| 19 | No CI/CD test pipelines anywhere | All repos | `.github/workflows/` | No test automation | Add GitHub Actions test workflows |

### D3. MEDIUM

| # | Title | Repo | Files |
|---|-------|------|-------|
| 20 | 5 silent catch-and-swallow blocks with zero logging | aillium-openclaw | `src/aillium/live-boundary.ts` |
| 21 | Hardcoded Docker fallback URL for Aillium Core | aillium-openclaw | `src/gateway/server-http.ts:1023,1066` |
| 22 | 9 Aillium env vars not in .env.example | aillium-openclaw | `.env.example` |
| 23 | Unsafe token extraction via split(" ")[1] | aillium-openclaw | `src/gateway/server-http.ts:1022,1065` |
| 24 | Only 2 gateway roles (operator/node) | aillium-openclaw | `src/gateway/role-policy.ts` |
| 25 | 5 required-field mismatches between JSON Schema and TS/Python | aillium-schemas | Multiple schema files |
| 26 | Python missing numeric constraints (accepts negative values) | aillium-schemas | `packages/python/` |
| 27 | TaskCreate lacks minLength:1 constraints matching JSON Schema | aillium-schemas | `packages/typescript/src/contracts.ts` |
| 28 | Response schema validation deliberately skipped | aillium-ui-tars | `codes/.../remote_handshake.py:274-279` |
| 29 | Empty proxy URLs make remote operators non-functional OOB | aillium-ui-tars-desktop | `packages/ui-tars/sdk/src/shared.ts:53,62` |
| 30 | 57 failing browser tests | aillium-ui-tars-desktop | `packages/agent-infra/mcp-servers/browser/` |
| 31 | Password exposed in RDP URL | aillium-ui-tars-desktop | `subscriptionClient.ts:167` |
| 32 | process.platform checks server OS not target device | aillium-remote-meshcentral | `aillium/httpApi.js:58-76` |
| 33 | Timing-unsafe token comparison | aillium-remote-meshcentral | `aillium/httpApi.js:37` |
| 34 | No request body size limit (DoS vector) | aillium-remote-meshcentral | `aillium/httpApi.js:9-21` |
| 35 | Admin credential escalation (adapter uses admin for everything) | aillium-remote-meshcentral | `aillium/meshcentralApiClient.js` |
| 36 | Debug tools loaded in production builds | aillium-ui-tars-desktop | `apps/ui-tars/src/main/main.ts:88-92` |
| 37 | No shared type system between portal and core | aillium-portal | `src/lib/api.ts` |
| 38 | Leaked Claude Code source in org repo (legal risk) | aillium-code | Entire repo |

### D4. LOW

| # | Title | Repo |
|---|-------|------|
| 39 | pi-embedded-runner/run.ts is 1,628 lines | aillium-openclaw |
| 40 | server-http.ts is 1,094 lines | aillium-openclaw |
| 41 | ~1,065 empty catch blocks in openclaw codebase | aillium-openclaw |
| 42 | ExecApprovalManager.waitForDecision deprecated but present | aillium-openclaw |
| 43 | subagent-registry uses `var` for circular import workaround | aillium-openclaw |
| 44 | Staff Room naming convention inconsistency | aillium-schemas |
| 45 | Staff Room uses z.string().uuid() while others use z.string() | aillium-schemas |
| 46 | sha256 pattern validation missing from TS Zod | aillium-schemas |
| 47 | .gitignore ignores package-lock.json globally | aillium-schemas |
| 48 | Unclosed sockets in Python tests (5 ResourceWarnings) | aillium-ui-tars |
| 49 | Commented-out pdb statements | aillium-ui-tars |
| 50 | print() instead of structured logging | aillium-ui-tars |
| 51 | assert in production code path | aillium-ui-tars |
| 52 | Stale local_milestone_a_mvp.py uses obsolete API | aillium-ui-tars |
| 53 | Typo "Totoal" in runAgent.ts | aillium-ui-tars-desktop |
| 54 | Misspelled "avaliable" (4 occurrences) | aillium-ui-tars-desktop |
| 55 | FIXME: setting update listener leak | aillium-ui-tars-desktop |
| 56 | Synchronous filesystem ops in evidence collector | aillium-remote-meshcentral |
| 57 | Hardcoded 1-hour token expiry | aillium-remote-meshcentral |
| 58 | .env not in .gitignore | aillium-remote-meshcentral |
| 59 | No pagination for evidence file listing | aillium-remote-meshcentral |
| 60 | app.module.ts is 29KB | aillium-core |
| 61 | Prisma schema is 176KB | aillium-core |
| 62 | aillium-remote is empty placeholder | aillium-remote |

---

## E. Cross-Repo Integration Findings

### E1. Broken Contracts

| Source | Target | Contract | Status |
|--------|--------|----------|--------|
| aillium-openclaw `src/aillium/` | aillium-core API | 7 adapter interfaces (registration, evidence, context, capsule, staff room) | **DEAD** — adapters never instantiated |
| aillium-remote-meshcentral `aillium/` | MeshCentral upstream | REST API calls | **BROKEN** — wrong protocol (should be WebSocket) |
| aillium-schemas JSON Schema `task` | Any JSON Schema validator | task definition | **BROKEN** — allOf + additionalProperties:false |
| aillium-integrations `@aillium/integrations` | aillium-core | npm package dependency | **DISCONNECTED** — not imported |
| aillium-portal `src/lib/api.ts` | aillium-core API | REST API client | **UNTYPED** — 211KB hand-written, no shared types |

### E2. Mismatched Assumptions

| Assumption | Reality |
|------------|---------|
| OpenClaw runtime has Aillium RBAC context | It has 2 roles (operator/node), no enterprise role awareness |
| MeshCentral has REST API | It uses WebSocket only |
| aillium-integrations is consumed by Core | Core doesn't import it |
| Staff Room types are cross-platform | Only exist in TypeScript |
| Python schemas are in sync | Python has stale runtime.schema.json, missing autonomous-agent.schema.json |
| All env vars are documented | 9 Aillium-specific vars missing from .env.example |

### E3. Missing Shared Types

| Gap | Impact |
|-----|--------|
| Portal has no shared types with Core | 211KB hand-maintained API client, drift risk |
| OpenClaw has no dependency on aillium-schemas | Integration types are local copies, not shared |
| UI-TARS desktop has no dependency on aillium-schemas | RPC bridge defines ad-hoc action schema |
| No OpenAPI spec shared between Core and Portal | No code generation, manual sync only |

### E4. Deployment/Config Gaps

| Gap | Impact |
|-----|--------|
| platform/.env.local committed with credentials | Security hygiene violation |
| 9 Aillium env vars undocumented in openclaw's .env.example | Dev setup friction, silent misconfiguration |
| MeshCentral env var names don't match between .env.example and code | Adapter falls back to default credentials |
| No K8s configuration | VPS-only deployment via Docker Compose |

---

## F. Agent Capability Assessment

| Capability | Status | Evidence |
|------------|--------|----------|
| **Memory** | WORKING | sqlite-vec built-in + LanceDB plugin, persistent, embedding search. Tested. |
| **Dreams / Proactive Behaviors** | MISSING | No autonomous goal loop, no event observation, no self-initiated actions. Cron exists but only for scheduled tasks, not proactive reasoning. |
| **Daemon / Background Process** | WORKING | launchd (macOS), systemd (Linux), schtasks (Windows). Can install/start/stop as system service. |
| **Proactive Loop** | MISSING | No event-driven trigger system. No goal maintenance. No "check and act" cycle. The system is entirely reactive — it waits for user messages. |
| **Subagents** | WORKING | Full spawn/registry/cleanup/announce. Depth limits. Tested (8,484 tests pass). |
| **Browser Use** | WORKING | Playwright-based in OpenClaw. NutJS + Playwright in desktop app. CDP proxy available. |
| **Visible Browser Session** | PARTIALLY WORKING | Desktop app: user sees local browser, ScreenMarker shows clicks. Remote: VNC/RDP URLs available. Python worker: no visibility. No unified viewer. |
| **Task Execution** | PARTIALLY WORKING | Core has task-bus. Python worker polls it. But OpenClaw runtime has zero integration with task-bus — the bridge is dead code. |
| **Recovery / Self-healing** | MISSING | No failure recovery loop. No retry policies (boundary is catch-and-swallow). No circuit breakers. No self-diagnosis. |
| **Observability** | MINIMAL | Audit logs, cron logs, agent events exist. No trace correlation. No user-visible execution trail. No monitoring/alerting. |
| **Cross-agent Coordination** | PARTIALLY WORKING | Subagent spawn/steer/kill works within a single OpenClaw instance. No cross-instance coordination. No shared goal state. |
| **Tool Use Safety** | PARTIALLY WORKING | Exec approval gates shell commands. But no governance policy check, no capability preflight, no risk assessment. |
| **State Persistence** | WORKING | Memory is persistent. Session transcripts are file-based. But no structured execution state persistence for recovery. |
| **Event Observation** | MISSING | No webhook/event ingestion system. No "watch for X and act" capability. Cron is time-based only. |
| **Goal Maintenance** | MISSING | No goal state. No planning. No progress tracking. Agent forgets intent between sessions. |
| **Progress Reporting** | MINIMAL | Agent responds in conversation. No structured progress events. No dashboard/portal integration for execution status. |

---

## G. Changes Made

No code changes were made during this audit. This is a read-only assessment. All findings are documented for the team to prioritize and address.

The audit report itself has been committed to `aillium-schemas` on branch `claude/aillium-upgrade-assessment-nyZbv`.

---

## H. Tests and Commands Run

### aillium-openclaw

| Command | Result | Notes |
|---------|--------|-------|
| `pnpm install` | PASS | 42s, build script warnings for optional deps |
| `pnpm exec tsc --noEmit` | FAIL | 7 errors in aillium-mcp-http.ts (zod v4 compat) |
| `pnpm test:fast` | 8,484 PASS / 3 FAIL | 3 failures in run-node.test.ts (JSON formatting) |
| `grep -r "src/aillium" --include="*.ts" -l` (outside src/aillium/) | 0 results | Proves integration boundary is dead code |

### aillium-schemas

| Command | Result | Notes |
|---------|--------|-------|
| `npm install` (packages/typescript) | PASS | 0 vulnerabilities |
| `tsc` (packages/typescript) | PASS | No errors |
| `node --test tests/contract_parity.test.mjs` | PASS | 9/9 tests |
| `node --test tests/autonomous_agent_parity.test.mjs` | PASS | 59/59 tests |
| `pip install -e .` (packages/python) | PASS | |
| `python -m unittest tests/contract_parity_test.py` | PASS | 16/16 tests |

### aillium-ui-tars

| Command | Result | Notes |
|---------|--------|-------|
| `uv sync` | PASS | 23 packages |
| `python -m pytest` | PASS | 15/15 tests, 5 ResourceWarning (unclosed sockets) |

### aillium-ui-tars-desktop

| Command | Result | Notes |
|---------|--------|-------|
| `pnpm install` | PASS | 2m12s |
| `pnpm run test` | 263 PASS / 57 FAIL / 23 SKIP | All failures in browser MCP server tests (need browser) |

### aillium-remote-meshcentral

| Command | Result | Notes |
|---------|--------|-------|
| `npm install` | PASS | 7 vulnerabilities (2 moderate, 4 high, 1 critical) |
| `npm test` | FAIL | "Missing script: test" — no tests exist |

---

## I. Remaining Work (Prioritized)

### P0: Must Fix Before System Is Usable

| # | Task | Repo | Effort |
|---|------|------|--------|
| 1 | **Wire Aillium integration boundary into OpenClaw runtime** — import and instantiate adapters during gateway startup, pass to agent runtime | aillium-openclaw | 2-3 days |
| 2 | **Rewrite MeshCentral adapter to use WebSocket API** — follow meshctrl.js patterns for control.ashx communication | aillium-remote-meshcentral | 3-5 days |
| 3 | **Fix broken `task` JSON Schema** — flatten allOf or remove additionalProperties:false from sub-schemas | aillium-schemas | 1 hour |
| 4 | **Replace `eval()` with safe parsing** in action_parser.py — use ast.literal_eval or regex coordinate extraction | aillium-ui-tars | 2 hours |
| 5 | **Require auth token on desktop RPC bridge** — refuse to start bridge if AILLIUM_DESKTOP_BRIDGE_TOKEN is empty | aillium-ui-tars-desktop | 1 hour |
| 6 | **Fix CORS on authenticated endpoint** — restrict Access-Control-Allow-Origin to portal origin | aillium-openclaw | 30 min |
| 7 | **Fix race condition in mobile avatar POST handler** — rewrite to properly await body parsing | aillium-openclaw | 1 hour |

### P1: Important

| # | Task | Repo | Effort |
|---|------|------|--------|
| 8 | Fix zod v4 TypeScript errors in aillium-mcp-http.ts | aillium-openclaw | 2-3 hours |
| 9 | Add Staff Room types to Python package and JSON Schema | aillium-schemas | 1 day |
| 10 | Sync Python embedded schemas with canonical copies | aillium-schemas | 2 hours |
| 11 | Update critical npm dependencies (handlebars, node-forge, multiparty) in MeshCentral | aillium-remote-meshcentral | 1 day |
| 12 | Add CI/CD test pipelines for all repos | All repos | 2-3 days |
| 13 | Remove .env.local from platform repo, add to .gitignore | platform | 30 min |
| 14 | Document all Aillium env vars in openclaw's .env.example | aillium-openclaw | 1 hour |
| 15 | Add logging to all catch blocks in live-boundary.ts | aillium-openclaw | 1 hour |
| 16 | Fix MeshCentral env var naming mismatch | aillium-remote-meshcentral | 30 min |
| 17 | Require API token in MeshCentral adapter (fail closed) | aillium-remote-meshcentral | 30 min |
| 18 | Fix required-field mismatches between JSON Schema and TS/Python | aillium-schemas | 2 hours |
| 19 | Add timing-safe token comparison in MeshCentral | aillium-remote-meshcentral | 30 min |

### P2: Improvement

| # | Task | Repo | Effort |
|---|------|------|--------|
| 20 | Design and implement proactive behavior system (dreams/goals/event loop) | aillium-openclaw + core | 2-4 weeks |
| 21 | Add error translation engine at gateway boundary | aillium-openclaw | 1 week |
| 22 | Surface governance policies and approval state in agent context | aillium-openclaw + core | 1 week |
| 23 | Split portal's 211KB api.ts into domain modules | aillium-portal | 2-3 days |
| 24 | Add shared type generation (OpenAPI → TypeScript) for portal | aillium-core + portal | 1 week |
| 25 | Wire aillium-integrations into aillium-core | aillium-integrations + core | 1 day |
| 26 | Add body size limits and rate limiting to MeshCentral API | aillium-remote-meshcentral | 1 day |
| 27 | Fix process.platform bug in MeshCentral diagnostics | aillium-remote-meshcentral | 2 hours |
| 28 | Add Python numeric constraints (Field(ge=0) etc.) | aillium-schemas | 2 hours |
| 29 | Create unified browser session viewer | aillium-ui-tars-desktop | 1-2 weeks |
| 30 | Add execution trace correlation (trace_id propagation) | All repos | 1 week |

### P3: Polish

| # | Task | Repo | Effort |
|---|------|------|--------|
| 31 | Archive empty aillium-remote repo | aillium-remote | 10 min |
| 32 | Evaluate legal risk of aillium-code repo | aillium-code | Discussion |
| 33 | Fix typos (Totoal, avaliable) | aillium-ui-tars-desktop | 30 min |
| 34 | Remove debug tools from production builds | aillium-ui-tars-desktop | 30 min |
| 35 | Remove deprecated waitForDecision | aillium-openclaw | 30 min |
| 36 | Add sha256 pattern validation to TS Zod | aillium-schemas | 1 hour |
| 37 | Standardize Staff Room naming conventions | aillium-schemas | 1 hour |
| 38 | Fix unclosed sockets in Python tests | aillium-ui-tars | 1 hour |
| 39 | Split app.module.ts (29KB) | aillium-core | 1 day |
| 40 | Clean up stale local_milestone_a_mvp.py | aillium-ui-tars | 30 min |

---

## J. Recommended Next Architecture Steps

### 1. Wire the Integration Boundary (Week 1)

The single highest-impact change: import `createLiveAilliumBoundary()` in OpenClaw's gateway startup, pass it through to the agent runtime. This unlocks registration, evidence, Staff Room, context lifecycle, and capsule lifecycle — all of which are already implemented but never called.

### 2. Implement AgentContextEnvelope (Weeks 2-4)

Build the context envelope endpoint in Aillium Core that assembles user role, provider status, tenant flags, approval state, and capability summaries into a single JSON response. Add an `AgentContextEnvelopeProvider` adapter to OpenClaw's integration boundary. Inject the envelope into the system prompt builder.

### 3. Fix the Data Plane (Weeks 2-3)

Rewrite the MeshCentral adapter to use WebSocket communication per the upstream protocol. This is prerequisite for remote support features.

### 4. Add CI/CD (Week 1-2)

Add GitHub Actions workflows for every repo: install, typecheck, lint, test. Block merges on test failures. This is table stakes for multi-developer work and prevents regression.

### 5. Design the Proactive Agent Loop (Weeks 4-8)

The system is currently 100% reactive. For an "active/proactive AI agent", you need:
- **Event ingestion**: Webhook receiver that feeds events into agent evaluation
- **Goal state persistence**: Store active goals, check conditions, decide when action is needed
- **Background evaluation**: Periodic loop that checks goals against current state
- **Autonomous action triggers**: When conditions are met, spawn agent sessions without user prompt

This can be built as a new service in Aillium Core that uses the task-bus to dispatch proactive work to the OpenClaw runtime.

### 6. Establish Contract-First Development (Ongoing)

- All new APIs get an OpenAPI spec first
- Generate TypeScript clients from specs (portal no longer hand-maintains 211KB)
- All cross-repo types go through aillium-schemas
- Add parity tests for every format (TS, Python, JSON Schema)
- CI blocks merges if schemas drift

### 7. Security Hardening Sprint (Week 1)

Address all critical and high security findings in a focused sprint:
- Remove eval() on LLM output
- Require desktop bridge auth token
- Fix CORS
- Update vulnerable dependencies
- Add body size limits
- Timing-safe comparisons
- Remove committed credentials

### 8. Observability Foundation (Weeks 4-6)

- Propagate trace_id through all cross-service calls
- Add structured logging at integration boundaries (replace catch-and-swallow)
- Build execution summary generation from traces
- Add health check endpoints to all services
- Wire monitoring/alerting (platform/docker-compose already has the service definitions)

---

*This audit examined 5 repositories locally (full source code analysis, dependency installation, test execution, build verification) and 6 repositories via GitHub API (structure analysis, recent commit history, key file inspection). Total: ~13,000 source files across all repos. Every finding is backed by specific file paths and line numbers. The assessment standard is: "Would I trust this system to run autonomous agent workflows for real users?" The current answer is no, but the architectural foundation (OpenClaw runtime, aillium-schemas contracts, Aillium Core's extensive service layer) is solid. The primary gap is wiring — the pieces exist but aren't connected.*