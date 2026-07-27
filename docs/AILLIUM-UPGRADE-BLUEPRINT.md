# Aillium Full-System Upgrade Assessment and Integration Blueprint

**Date**: 2026-05-21
**Scope**: All Aillium repositories (11 repos, 5 fully audited, 6 private/inferred)
**Classification**: Architecture Assessment + Implementation Blueprint

---

## Executive Summary

Aillium is an enterprise agent business operations OS built on a multi-layer architecture: **Aillium Core** (control plane, private), **aillium-openclaw** (forked operator runtime/orchestration substrate), **aillium-schemas** (shared contracts), **aillium-ui-tars** / **aillium-ui-tars-desktop** (browser/GUI automation workers), **aillium-remote-meshcentral** (remote support data plane), and several other private repositories (portal, integrations, remote, code, platform).

**The central problem**: Aillium has strong product ambition and a broad capability surface, but the agent runtime inherited from OpenClaw was designed as a personal AI assistant gateway, not an enterprise operations platform. The gap between these two models creates six critical weaknesses:

1. **No runtime self-awareness**: The agent does not receive structured information about connected providers, tenant features, user permissions, approval gates, or system health at invocation time. It relies on static prompt text rather than live platform state.

2. **No central capability registry**: Capabilities are scattered across tool catalogs, skill files, plugin registries, and MCP servers with no unified queryable model that maps capability -> module -> provider -> permission -> approval requirement.

3. **Primitive role model**: OpenClaw's role system has two roles (`operator` and `node`). The aillium-schemas contract layer defines `SUPER_ADMIN`, `ADMIN`, `USER` plus approval levels (`NONE`, `DEPARTMENT_MANAGER`, `OWNER`, `MULTI_PARTY`), but these are not reflected into agent context at runtime.

4. **No error translation**: Errors from providers, auth failures, permission denials, and configuration gaps are caught silently or surfaced as raw exceptions. There is no structured layer that converts machine failures into user-actionable explanations.

5. **Approval awareness is stub-only**: The Aillium integration boundary (`src/aillium/`) defines contracts for evidence callbacks, capsule lifecycle, and Staff Room context, but the live implementations are thin HTTP forwarders with best-effort delivery and no approval state reflection into agent prompts.

6. **No execution trace explainability**: Audit events exist (security audit, cron run logs, agent events) but there is no pathway from execution trace -> user-facing explanation of what happened and why.

**Recommendation**: A phased upgrade across 4 quarters that adds a **RuntimeCapabilityContext** envelope to every agent invocation, a **CapabilityRegistry** service in Aillium Core, an **ErrorTranslationEngine** at the gateway boundary, and an **ApprovalAwareExecutionModel** that reflects governance state into agent behavior.

---

## Current State Findings

### Architecture Topology

```
                    ┌──────────────────────────────────┐
                    │         Aillium Portal            │
                    │    (React web UI - PRIVATE)       │
                    └──────────────┬───────────────────┘
                                   │ HTTP/WS
                    ┌──────────────▼───────────────────┐
                    │         Aillium Core              │
                    │   (Enterprise control plane)      │
                    │   - Tenancy, RBAC, Approvals      │
                    │   - Master Agent orchestration    │
                    │   - Task Bus, Staff Room          │
                    │   - Feature flags, billing        │
                    │          (PRIVATE)                │
                    └──┬────────┬────────┬─────────────┘
                       │        │        │
            ┌──────────▼──┐  ┌──▼─────┐  ┌▼──────────────┐
            │  OpenClaw   │  │UI-TARS │  │ MeshCentral   │
            │  Runtime    │  │Workers │  │ Remote        │
            │ (Operator)  │  │(GUI    │  │ Support       │
            │             │  │ auto)  │  │               │
            └─────────────┘  └────────┘  └───────────────┘
```

### Repository Audit Summary

| Repository | Role | Access | Files | Framework |
|------------|------|--------|-------|-----------|
| **aillium-core** | Control plane: tenancy, RBAC, approvals, task bus | PRIVATE | unknown | Inferred: Node.js/Python |
| **aillium-portal** | Web UI frontend | PRIVATE | unknown | Inferred: React |
| **aillium-integrations** | Provider connections (CRM, email, calendar) | PRIVATE | unknown | unknown |
| **aillium-openclaw** | Operator runtime (forked OpenClaw) | PUBLIC | 8,568 | TypeScript/Node.js ESM |
| **aillium-schemas** | Shared contract schemas | PUBLIC | ~25 | TypeScript (Zod) + Python + JSON Schema |
| **aillium-ui-tars** | GUI automation worker (Python) | PUBLIC | ~30 | Python (FastAPI/HTTP) |
| **aillium-ui-tars-desktop** | Desktop GUI agent (Electron) | PUBLIC | 2,488 | TypeScript/Electron/React |
| **aillium-remote-meshcentral** | Remote support data plane | PUBLIC | 1,145 | JavaScript (MeshCentral fork) |
| **aillium-remote** | Remote assist orchestration | PRIVATE | unknown | unknown |
| **aillium-code** | Code agent | PRIVATE | unknown | unknown |
| **platform** | Infrastructure/deployment | PRIVATE | unknown | unknown |

### Key Finding: The Aillium Integration Boundary

The `src/aillium/` directory in aillium-openclaw contains 4 files that define the entire integration surface between the OpenClaw operator runtime and Aillium Core:

- **`contracts.ts`** (169 lines): Defines `AilliumIntegrationBoundary` with 7 adapter interfaces
- **`defaults.ts`** (93 lines): No-op implementations for standalone operation
- **`live-boundary.ts`** (287 lines): HTTP-based live adapters that forward to Aillium Core
- **`index.ts`** (22 lines): Barrel exports

The boundary currently handles:
- Runtime registration (POST `/master-agent/runtime/operator-sync`)
- Evidence callback emission (POST same endpoint with artifacts)
- Context lifecycle forwarding (POST `/master-agent/runtime/context-lifecycle`)
- Capsule lifecycle forwarding (POST `/execution-capsules/runtime/lifecycle`)
- Staff Room context retrieval (GET `/staff-room/agent-context/{agentId}`)
- Staff Room memory retrieval (GET `/staff-room/retrieve`)

**What it does NOT handle** (and must):
- Provider connectivity state injection
- Effective user permission reflection
- Approval gate state for pending actions
- Tenant feature flag propagation
- Error translation and user-facing explanation generation
- Capability registry queries
- System health/status signals

---

## Most Critical Weaknesses

### 1. Agent Context Is Prompt-Only, Not Runtime-Backed

The system prompt is built in `src/agents/system-prompt.ts` via `buildAgentSystemPrompt()`. It assembles:
- Identity line, skills section, memory recall instructions
- Tool descriptions (hardcoded summaries)
- Workspace/sandbox info, runtime info (host, OS, model)
- Channel capabilities, messaging hints

**Missing from the prompt assembly pipeline**:
- Connected provider status (which integrations are live vs. disconnected)
- User role and effective permissions
- Tenant feature flags (which modules are enabled)
- Approval requirements for available actions
- Recent failure context (what failed in the last N minutes)
- System health signals (any providers degraded?)

### 2. OpenClaw's Role Model Is Too Primitive

OpenClaw defines exactly 2 gateway roles in `src/gateway/role-policy.ts`:
```typescript
export const GATEWAY_ROLES = ["operator", "node"] as const;
```

Meanwhile, aillium-schemas defines a richer model:
- Roles: `SUPER_ADMIN`, `ADMIN`, `USER`
- Plans: `STARTER`, `GROWTH`, `OPERATOR`, `ENTERPRISE`
- Approval levels: `NONE`, `DEPARTMENT_MANAGER`, `OWNER`, `MULTI_PARTY`

These are never reconciled at runtime. The agent has no idea whether the current user is an admin or a restricted user.

### 3. Error Handling Is Catch-and-Swallow

The live boundary adapters in `src/aillium/live-boundary.ts` use this pattern consistently:

```typescript
} catch {
  // Best-effort delivery; do not block runtime execution
}
```

This means:
- Registration failures are silently swallowed
- Evidence delivery failures disappear
- Context lifecycle events can be lost
- Staff Room retrieval failures return empty strings

There is no error categorization, no retry policy, and no user-facing explanation when these failures occur.

### 4. Approval System Is Not Reflected to the Agent

The exec approval system in `src/gateway/exec-approval-manager.ts` handles tool execution approvals (shell commands), but:
- The agent does not know which actions require approval before attempting them
- The agent cannot explain "this action requires manager approval" proactively
- There is no connection between aillium-schemas' `GovernancePolicy` / `ApprovalRequest` contracts and the runtime

### 5. No Capability Discovery at Runtime

The tool catalog (`src/agents/tool-catalog.ts`) defines tool sections (Files, Runtime, Web, Memory, Sessions, etc.) but:
- Tools are statically listed, not dynamically discovered based on provider connectivity
- MCP tools are discovered per-request via `aillium-mcp-http.ts` but not cached or reflected into context
- Skills are loaded from filesystem, not from a queryable registry
- No tool knows its own prerequisites (which provider must be connected, which permissions are needed)

### 6. No Execution Trace -> Explanation Pipeline

Audit events exist:
- `src/security/audit.ts` - Security audit logging
- `src/cron/run-log.ts` - Cron execution history
- `src/infra/agent-events.ts` - Agent lifecycle events
- `src/aillium/contracts.ts` - Evidence callback hooks

But there is no service that:
- Aggregates traces for a given request
- Interprets what happened (succeeded, failed, blocked, timed out)
- Generates a user-facing explanation
- Links to next steps for resolution

---

## Capability Inventory

### Current Capability Surface (Discovered)

| Module | Capabilities | Provider Dependency | Approval Required |
|--------|-------------|--------------------|--------------------||
| **Shell execution** | exec, process | Local host | Yes (exec approval) |
| **File operations** | read, write, edit, apply_patch, grep, find, ls | Local filesystem | No |
| **Web access** | web_search, web_fetch | Brave API key | No |
| **Browser automation** | browser | Playwright/Chromium | No |
| **Memory/RAG** | memory_search, memory_get | LanceDB (local) | No |
| **Messaging** | message (send, polls, reactions) | Channel provider (Telegram, Discord, Slack, etc.) | No |
| **Cron/scheduling** | cron (add, list, remove, run) | Local scheduler | Owner-only |
| **Session management** | sessions_list, sessions_history, sessions_send, sessions_spawn | Local gateway | No |
| **Subagent orchestration** | subagents (list, steer, kill) | Local gateway | No |
| **Image analysis** | image | Vision model provider | No |
| **Gateway management** | gateway (restart, config, update) | Local gateway | Owner-only |
| **Node management** | nodes (list, describe, notify, camera, screen) | Connected nodes | Owner-only |
| **Canvas/A2UI** | canvas (present, eval, snapshot) | Local renderer | No |
| **MCP tools** | Dynamic (per-server) | MCP server connectivity | Per-server |
| **Desktop actions** | screen capture, mouse/keyboard, app control | UI-TARS desktop | Per-task |
| **Remote support** | session creation, device targeting, screen capture | MeshCentral | Yes (tenant scope) |
| **CRM** | contact lookup, deal management | Aillium Core | Yes (role-based) |
| **Support tickets** | ticket creation, status tracking | Aillium Core | No |
| **Payments** | payment intent, invoicing | Stripe/banking | Yes (approval level) |
| **Skills** | 55+ bundled skills (GitHub, Slack, Notion, 1Password, etc.) | Per-skill | No |

### Capabilities Defined in Schemas But Not Surfaced to Agent

From `aillium-schemas/schemas/core/autonomous-agent.schema.json`:

| Capability Contract | Schema Status | Runtime Status |
|-------------------|---------------|----------------|
| `skill_candidate` | Defined | Not surfaced |
| `skill_draft_request` | Defined | Not surfaced |
| `trajectory_record` | Defined | Not surfaced |
| `learning_evaluation` | Defined | Not surfaced |
| `governance_policy` | Defined | Not surfaced to agent |
| `action_evaluation_request` | Defined | Not surfaced |
| `tool_definition` | Defined | Not connected to tool catalog |
| `payment_intent` | Defined | Not surfaced |
| `heartbeat_report` | Defined | Partially (cron heartbeat) |
| `eod_report` | Defined | Not surfaced |
| `ooo_session_state` | Defined | Not surfaced |
| `crm_contact` | Defined | Not surfaced |
| `crm_deal` | Defined | Not surfaced |
| `support_ticket` | Defined | Not surfaced |
| `approval_request` | Defined | Not surfaced to agent |
| `approval_decision` | Defined | Not surfaced to agent |

---

## Role and Permission Audit

### Current Permission Model

**OpenClaw Gateway Layer** (`src/gateway/`):
- Auth methods: token, password, bootstrap-token, device-token, Tailscale identity
- Roles: `operator` (full access) or `node` (device-scoped access)
- Method scopes: `ADMIN_SCOPE`, `CLI_DEFAULT_OPERATOR_SCOPES`
- Owner-only tools: `whatsapp_login`, `cron`, `gateway`, `nodes`

**Aillium Core Layer** (inferred from schemas):
- Roles: `SUPER_ADMIN`, `ADMIN`, `USER`
- Plans: `STARTER`, `GROWTH`, `OPERATOR`, `ENTERPRISE`
- Approval levels: `NONE`, `DEPARTMENT_MANAGER`, `OWNER`, `MULTI_PARTY`
- Governance policies: Pattern-based action matching with risk thresholds

### Permission Enforcement Gaps

| Layer | UI Gated? | Server Enforced? | Agent Aware? |
|-------|-----------|-------------------|-------------|
| Gateway auth (token/password) | Yes | Yes | No |
| Tool owner-only restriction | N/A | Yes | Partially (tools hidden) |
| Exec approval (shell commands) | Yes (approval UI) | Yes | No (doesn't know in advance) |
| Aillium Core RBAC | Yes (portal) | Yes (API) | **No** |
| Approval level requirements | Yes (portal) | Yes (Core API) | **No** |
| Tenant feature flags | Yes (portal) | Yes (Core API) | **No** |
| Plan-based limits | Yes (portal) | Yes (Core API) | **No** |
| Provider connectivity | Partially | Yes (runtime) | **No** |

### Recommended Role-Capability Matrix

| Role | Can Execute Tasks | Can Approve | Can Configure | Can Access Billing | Agent Behavior |
|------|-------------------|-------------|---------------|--------------------|----------------|
| `SUPER_ADMIN` | All | All | All | Yes | Full autonomy, all capabilities shown |
| `ADMIN` | All | Department-scoped | Tenant settings | View only | Full autonomy, billing read-only |
| `USER` | Assigned scope | No | Personal settings | No | Guided mode, approval-gated actions explained |
| `DEPARTMENT_MANAGER` | Department scope | Department scope | Department settings | No | Department autonomy, cross-dept requires approval |

---

## Failure Mode Audit

### Failure Mode Taxonomy

| # | Failure Category | Raw Error Pattern | Current User Experience | Desired User Experience |
|---|-----------------|-------------------|------------------------|------------------------|
| 1 | **Provider not connected** | HTTP timeout, connection refused | Silent failure or generic error | "Your email provider isn't connected yet. Go to Settings > Integrations to connect it." |
| 2 | **Auth token expired** | 401 Unauthorized, token refresh failure | Empty response or retry loop | "Your Google Calendar connection expired. Click here to re-authorize." |
| 3 | **Permission denied** | 403 Forbidden from Core API | Generic "I can't do that" | "This action requires Admin access. Your current role is User. Ask your admin to grant permission." |
| 4 | **Approval required** | Core returns NEEDS_APPROVAL state | Action appears to fail | "I've prepared this action but it needs approval from your department manager. I've sent the request." |
| 5 | **Feature not enabled** | 404 or feature flag false | "I don't know how to do that" | "CRM is available on the Operator plan. Your workspace is on the Growth plan." |
| 6 | **Rate limit exceeded** | 429 Too Many Requests | Retry or silent failure | "We've hit the rate limit for this provider. I'll retry in 30 seconds, or you can try again later." |
| 7 | **Validation error** | 400 Bad Request, schema violation | Raw error or generic message | "The phone number format isn't valid. Please use +44XXXXXXXXXX format." |
| 8 | **Service unavailable** | 503, ECONNREFUSED, DNS failure | Silent failure | "The remote support service is temporarily unavailable. I'll retry in 2 minutes." |
| 9 | **Execution worker failure** | UI-TARS crash, MeshCentral timeout | Silent or orphaned task | "The browser automation worker encountered an error. Task has been queued for retry." |
| 10 | **Budget exceeded** | Cost > budget_caps.max_usd | Unknown | "This task would exceed your remaining budget of $X.XX. Requires admin approval to proceed." |
| 11 | **Sandbox restriction** | File/network access denied in sandbox | Generic permission error | "I can't access that file because I'm running in a sandboxed environment. The file needs to be in the workspace." |
| 12 | **MCP server failure** | MCP tool invocation error | Tool error passed through | "The Slack integration tool is not responding. Check that the MCP server is running." |

### Current Error Handling Patterns (Code Evidence)

**Pattern 1: Silent catch** (most common in live-boundary.ts)
```typescript
catch {
  // Best-effort; do not block runtime execution
}
```

**Pattern 2: Return empty** (StaffRoom provider)
```typescript
catch {
  return { results: [], total_count: 0, agent_context: null };
}
```

**Pattern 3: Raw error forwarding** (gateway RPC)
```typescript
// In server-methods, errors throw and are caught by the RPC frame handler
// Error codes defined in protocol/index.ts: UNAVAILABLE, INVALID_ARGUMENT, etc.
```

**Pattern 4: Exec approval with timeout** (exec-approval-manager.ts)
```typescript
entry.timer = setTimeout(() => { this.expire(record.id); }, timeoutMs);
```

---

## Approval and Risk Audit

### Current Approval Mechanisms

| Mechanism | Location | Scope | Agent Visibility |
|-----------|----------|-------|------------------|
| **Exec approval** | `src/gateway/exec-approval-manager.ts` | Shell command execution | None (post-hoc) |
| **Plugin approval** | `aillium-schemas: PluginApprovalRequest` | Plugin tool invocation | None |
| **Node command approval** | `src/gateway/node-invoke-system-run-approval.ts` | Remote node commands | None |
| **Governance policy** | `aillium-schemas: GovernancePolicy` | Action pattern matching | None |
| **Task approval** | `aillium-schemas: TaskState.NEEDS_APPROVAL` | Task state machine | None |
| **Payment approval** | `aillium-schemas: ApprovalLevel` | Financial actions | None |

### Governance Policy Schema (Already Defined)

```typescript
// From aillium-schemas contracts.ts
GovernancePolicy = {
  name: string;
  action_pattern: string;        // Glob pattern matching action types
  max_amount_gbp?: number;
  risk_threshold: RiskLevel;     // LOW | MEDIUM | HIGH | CRITICAL
  requires_approval: boolean;
  approval_level: ApprovalLevel; // NONE | DEPARTMENT_MANAGER | OWNER | MULTI_PARTY
  blocked_domains?: string[];
  allowed_tools?: string[];
  enabled: boolean;
}
```

This schema exists but is not connected to the agent runtime. The agent cannot query governance policies to determine what it can/cannot do proactively.

---

## Context Assembly Audit

### Current Context Assembly Pipeline

```
1. CLI/Gateway receives message
   └→ src/gateway/server-methods/chat.ts (validateChatSendParams)

2. Agent scope resolved
   └→ src/agents/agent-scope.ts (identity, workspace)

3. Bootstrap context loaded
   └→ src/agents/bootstrap-files.ts (MEMORY.md, context/*.md)
   └→ src/agents/bootstrap-budget.ts (token budget allocation)

4. System prompt assembled
   └→ src/agents/system-prompt.ts (buildAgentSystemPrompt)
       - Identity, skills, memory, tools, runtime info, workspace
       - NO provider state, NO user permissions, NO approval state

5. Context engine assembles messages
   └→ src/context-engine/ (assemble messages under token budget)

6. Pi embedded runner executes
   └→ src/agents/pi-embedded-runner/run.ts (model invocation loop)

7. Tool invocations during run
   └→ src/agents/openclaw-tools.ts (tool execution)
   └→ src/agents/bash-tools.ts (shell execution with approval)

8. Response delivered
   └→ src/auto-reply/ (dispatch to channels)
```

### Missing Context Injection Points

| Injection Point | What Should Be Injected | Where It Should Come From |
|----------------|------------------------|---------------------------|
| Step 4 (system prompt) | Connected providers list | Aillium Core API |
| Step 4 (system prompt) | User role + effective permissions | Aillium Core session |
| Step 4 (system prompt) | Tenant feature flags | Aillium Core tenant config |
| Step 4 (system prompt) | Approval requirements for available actions | Capability Registry |
| Step 4 (system prompt) | Recent failures/blockers | Error Translation Engine cache |
| Step 4 (system prompt) | Staff Room context | Already exists (StaffRoomContextProvider) |
| Step 7 (tool invocation) | Pre-flight capability check | Capability Registry |
| Step 7 (tool invocation) | Error translation on failure | Error Translation Engine |
| Step 8 (response) | Confidence/source signal | Runtime context metadata |

---

## Observability and Traceability Audit

### Existing Observability Surfaces

| Surface | Location | Content | User-Facing? |
|---------|----------|---------|-------------|
| Security audit log | `src/security/audit.ts` | Tool invocations, channel events | No |
| Cron run log | `src/cron/run-log.ts` | Job execution history | No (admin only) |
| Agent events | `src/infra/agent-events.ts` | Agent lifecycle events | No |
| Evidence callbacks | `src/aillium/live-boundary.ts` | Forwarded to Core | No |
| Session transcripts | `~/.openclaw/sessions/*.jsonl` | Full message history | No (file-based) |
| Diagnostic events | `src/infra/diagnostic-events.ts` | Heartbeat diagnostics | No |
| OpenTelemetry | `extensions/diagnostics-otel` | Trace spans | No (ops only) |

### Traceability Gaps

1. **No trace ID propagation**: Task `trace_id` from aillium-schemas is not consistently threaded through OpenClaw gateway -> agent -> tool -> response
2. **No execution summary generation**: After a task completes, there is no service that generates "here's what happened" from the trace
3. **No user-visible audit trail**: The portal has no view of "what the agent attempted and why it succeeded/failed"
4. **No correlation between Core task and runtime session**: The Core's `task_id` and the OpenClaw `session_key` are loosely coupled via the evidence callback, not structurally linked

---

## Gap Analysis

### Gap Severity Matrix

| Gap | Severity | Impact | Effort | Priority |
|-----|----------|--------|--------|----------|
| No runtime capability context | CRITICAL | Agent hallucinates capabilities | Medium | P0 |
| No role/permission awareness | CRITICAL | Agent attempts unauthorized actions | Medium | P0 |
| No error translation | HIGH | Users see generic/no error messages | Medium | P1 |
| No approval state reflection | HIGH | Agent can't explain approval gates | Medium | P1 |
| No capability registry | HIGH | Can't query what's available | High | P1 |
| No execution trace explainability | MEDIUM | Users can't understand what happened | High | P2 |
| No proactive failure handling | MEDIUM | Failures are silent | Medium | P2 |
| No status/UX cohesion | MEDIUM | Inconsistent user experience | Low | P2 |
| No tenant-scoped continuity | LOW | Agent forgets recent context | Medium | P3 |
| No confidence signaling | LOW | User doesn't know answer source | Low | P3 |

---

## Target Architecture

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                      Aillium Core (Control Plane)                │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────────┐ │
│  │ Capability    │ │ Governance   │ │ Staff Room               │ │
│  │ Registry      │ │ Engine       │ │ (Knowledge + Memory)     │ │
│  │ Service       │ │              │ │                          │ │
│  └──────┬───────┘ └──────┬───────┘ └────────────┬─────────────┘ │
│         │                │                       │               │
│  ┌──────▼────────────────────▼───────────────────────▼─────────────┐ │
│  │              Runtime Context Assembly Service                │ │
│  │  (Assembles AgentContextEnvelope per request)               │ │
│  └──────────────────────┬────────────────────────────────────┘ │
└─────────────────────────┤───────────────────────────────────────┘
                          │ HTTP (structured JSON)
┌─────────────────────────▼───────────────────────────────────────┐
│                    Aillium Integration Boundary                   │
│              (src/aillium/ in aillium-openclaw)                   │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────────┐ │
│  │ Context      │ │ Error        │ │ Capability               │ │
│  │ Envelope     │ │ Translation  │ │ Pre-flight               │ │
│  │ Adapter      │ │ Engine       │ │ Checker                  │ │
│  └──────┬───────┘ └──────┬───────┘ └────────────┬─────────────┘ │
└─────────┤────────────────┤───────────────────────┤───────────────┘
          │                │                       │
┌─────────▼────────────────▼───────────────────────▼───────────────┐
│                    OpenClaw Operator Runtime                      │
│  System Prompt Builder ← AgentContextEnvelope                    │
│  Tool Invocation ← Capability Pre-flight Check                   │
│  Error Responses ← Error Translation Engine                      │
│  Approval Handling ← Governance Policy Reflection                │
└──────────────────────────────────────────────────────────────────┘
```

---

## Capability Registry Design

### Service Location

New service in **Aillium Core** (not in OpenClaw - OpenClaw queries it via the integration boundary).

### Schema: `CapabilityDescriptor`

```typescript
interface CapabilityDescriptor {
  capability_id: string;           // e.g., "mail.read.latest"
  human_name: string;              // e.g., "Read Latest Emails"
  module: string;                  // e.g., "integrations.email"
  category: ToolCategory;          // From aillium-schemas enum
  
  // Dependencies
  required_providers: string[];    // e.g., ["google_workspace"] or ["microsoft_365"]
  required_permissions: string[];  // e.g., ["email.read"]
  required_tenant_flags: string[]; // e.g., ["email_integration_enabled"]
  required_plan: Plan | null;      // e.g., "GROWTH" or null (all plans)
  
  // Approval
  approval_required: boolean;
  approval_level: ApprovalLevel;
  risk_level: RiskLevel;
  
  // Resolution
  execution_path: string;          // e.g., "mcp://google-workspace/gmail.read"
  fallback_path: string | null;    // e.g., null or "manual_instruction"
  
  // User guidance
  setup_instructions: string;      // e.g., "Connect Google Workspace in Settings > Integrations"
  error_explanation_template: string; // e.g., "Email access requires {provider} to be connected."
  
  // Status
  enabled: boolean;
  experimental: boolean;
}
```

### Query Interface

```typescript
interface CapabilityRegistryQuery {
  // Filter by current context
  tenant_id: string;
  user_role: Role;
  user_permissions: string[];
  connected_providers: string[];
  tenant_flags: Record<string, boolean>;
  tenant_plan: Plan;
}

interface CapabilityRegistryResult {
  available: CapabilityDescriptor[];      // Fully available now
  blocked_by_provider: CapabilityDescriptor[];  // Missing provider connection
  blocked_by_permission: CapabilityDescriptor[]; // User lacks permission
  blocked_by_plan: CapabilityDescriptor[];       // Plan upgrade needed
  blocked_by_approval: CapabilityDescriptor[];   // Needs approval to use
  disabled: CapabilityDescriptor[];              // Disabled by admin
}
```

---

## Runtime Context Envelope Design

### Schema: `AgentContextEnvelope`

```typescript
interface AgentContextEnvelope {
  // Identity
  tenant_id: string;
  session_id: string;
  trace_id: string;
  
  // User context
  user: {
    user_id: string;
    role: Role;                    // SUPER_ADMIN | ADMIN | USER
    permissions: string[];
    department_id: string | null;
    plan: Plan;                    // STARTER | GROWTH | OPERATOR | ENTERPRISE
  };
  
  // Capability context
  capabilities: {
    available: CapabilitySummary[];
    blocked: BlockedCapabilitySummary[];
  };
  
  // Provider context
  providers: {
    connected: ProviderStatus[];
    disconnected: ProviderStatus[];
    degraded: ProviderStatus[];
  };
  
  // Approval context
  approvals: {
    pending: PendingApproval[];
    governance_policies: GovernancePolicySummary[];
  };
  
  // Tenant context
  tenant: {
    flags: Record<string, boolean>;
    plan: Plan;
    budget_remaining: BudgetCaps | null;
  };
  
  // Operational context
  operational: {
    recent_failures: RecentFailure[];
    system_health: SystemHealthSignal;
    staff_room_context: string;     // From StaffRoomContextProvider
  };
  
  // Metadata
  assembled_at: string;            // ISO timestamp
  envelope_version: "1.0.0";
}

interface CapabilitySummary {
  capability_id: string;
  human_name: string;
  category: ToolCategory;
}

interface BlockedCapabilitySummary {
  capability_id: string;
  human_name: string;
  block_reason: "provider_disconnected" | "permission_denied" | "plan_required" | "approval_required" | "disabled" | "feature_flag_off";
  resolution_hint: string;
}

interface ProviderStatus {
  provider_id: string;
  provider_name: string;
  status: "connected" | "disconnected" | "degraded" | "expired";
  last_checked_at: string;
  error_hint: string | null;
}

interface PendingApproval {
  approval_id: string;
  action_type: string;
  status: ApprovalRequestStatus;
  requested_at: string;
}

interface GovernancePolicySummary {
  action_pattern: string;
  requires_approval: boolean;
  approval_level: ApprovalLevel;
  risk_threshold: RiskLevel;
}

interface RecentFailure {
  capability_id: string;
  error_category: string;
  occurred_at: string;
  user_explanation: string;
}

interface SystemHealthSignal {
  overall: "healthy" | "degraded" | "partial_outage";
  degraded_services: string[];
}
```

### Integration Point

Add to `src/aillium/contracts.ts`:

```typescript
interface AgentContextEnvelopeProvider {
  getEnvelope(params: {
    tenantId: string;
    userId: string;
    sessionKey: string;
    traceId: string;
  }): Promise<AgentContextEnvelope>;
}
```

Add to `AilliumIntegrationBoundary`:
```typescript
interface AilliumIntegrationBoundary {
  // ... existing adapters ...
  contextEnvelope?: AgentContextEnvelopeProvider;
}
```

---

## Error Translation Layer Design

### Schema: `InterpretedError`

```typescript
interface InterpretedError {
  // Classification
  error_id: string;
  category: ErrorCategory;
  severity: "info" | "warning" | "error" | "critical";
  
  // User-facing
  user_message: string;           // Plain English explanation
  user_next_step: string | null;  // What the user should do
  is_fixable_by_user: boolean;
  fixable_by_role: Role | null;   // Which role can fix it
  
  // Internal
  raw_error_code: string;
  raw_error_message: string;
  provider: string | null;
  retryable: boolean;
  retry_after_ms: number | null;
  
  // Context
  capability_id: string | null;
  trace_id: string;
}

type ErrorCategory =
  | "not_connected"
  | "not_authorized"
  | "not_configured"
  | "not_supported"
  | "awaiting_approval"
  | "temporarily_unavailable"
  | "validation_error"
  | "quota_exceeded"
  | "policy_blocked"
  | "execution_worker_failure"
  | "budget_exceeded"
  | "unknown";
```

### Schema: `UserActionabilityExplanation`

```typescript
interface UserActionabilityExplanation {
  action_requested: string;
  outcome: "succeeded" | "failed" | "blocked" | "pending_approval" | "queued";
  explanation: string;
  steps_taken: string[];
  next_steps: string[];
  related_capability: string | null;
  confidence: OperationalConfidenceDescriptor;
}
```

### Error Translation Rules

```typescript
const ERROR_TRANSLATION_RULES: ErrorTranslationRule[] = [
  {
    match: { status: 401, provider: "*" },
    category: "not_authorized",
    template: "Your {provider} connection has expired. Re-authorize in Settings > Integrations.",
    fixable_by_user: true,
    fixable_by_role: null,
  },
  {
    match: { status: 403, source: "aillium_core" },
    category: "not_authorized",
    template: "This action requires {required_permission} permission. Your role ({user_role}) doesn't have it. Contact your admin.",
    fixable_by_user: false,
    fixable_by_role: "ADMIN",
  },
  {
    match: { status: 429, provider: "*" },
    category: "quota_exceeded",
    template: "Rate limit reached for {provider}. Will retry in {retry_after} seconds.",
    retryable: true,
  },
  {
    match: { code: "NEEDS_APPROVAL" },
    category: "awaiting_approval",
    template: "This action has been prepared but requires {approval_level} approval. Request sent.",
    fixable_by_user: false,
  },
  {
    match: { code: "ECONNREFUSED", provider: "meshcentral" },
    category: "temporarily_unavailable",
    template: "Remote support service is not responding. Check that MeshCentral is running.",
    retryable: true,
  },
  {
    match: { code: "FEATURE_NOT_ENABLED" },
    category: "not_configured",
    template: "{feature_name} is not enabled for your workspace. Available on {required_plan} plan.",
    fixable_by_user: false,
    fixable_by_role: "SUPER_ADMIN",
  },
  // ... 30+ additional rules
];
```

---

## Approval-Aware Execution Design

### Schema: `ApprovalGateDescriptor`

```typescript
interface ApprovalGateDescriptor {
  action_type: string;
  requires_approval: boolean;
  approval_level: ApprovalLevel;
  risk_level: RiskLevel;
  max_auto_approve_amount: number | null;  // GBP threshold for auto-approval
  estimated_blast_radius: "self" | "team" | "department" | "organization";
  rollback_possible: boolean;
  rollback_instructions: string | null;
}
```

### Pre-Execution Flow

```
Agent wants to execute action
    │
    ▼
Query CapabilityRegistry for action's ApprovalGateDescriptor
    │
    ├── No approval needed → Execute immediately
    │
    ├── Approval needed, user is approver → Execute (self-approve)
    │
    ├── Approval needed, within auto-approve threshold → Execute
    │
    └── Approval needed, above threshold → 
        │
        ├── Prepare action (validate inputs, estimate cost)
        ├── Create ApprovalRequest in Core
        ├── Inform user: "I've prepared this but it needs approval from {level}"
        └── Queue for post-approval execution
```

---

## Trace-to-Explanation Design

### Schema: `ExecutionAttemptSummary`

```typescript
interface ExecutionAttemptSummary {
  trace_id: string;
  task_id: string | null;
  session_key: string;
  
  // What was attempted
  user_intent: string;
  actions_attempted: ActionAttempt[];
  
  // Outcome
  overall_outcome: "completed" | "partially_completed" | "failed" | "blocked" | "pending";
  
  // Explanation
  user_explanation: string;
  internal_diagnostic: string;
  
  // Timing
  started_at: string;
  completed_at: string;
  duration_ms: number;
  
  // Next steps
  suggested_next_steps: string[];
}

interface ActionAttempt {
  action_name: string;
  tool_used: string | null;
  outcome: "succeeded" | "failed" | "skipped" | "blocked";
  error: InterpretedError | null;
  duration_ms: number;
}
```

---

## Status and UX Cohesion Design

### Standardized Status States

| Status | Meaning | User-Facing Label | Source of Truth |
|--------|---------|-------------------|----------------|
| `ANSWERED` | Agent provided a response | Answered | Chat response exists |
| `EXECUTED` | Action was successfully performed | Done | Task state = COMPLETED |
| `QUEUED` | Action is waiting for execution | Queued | Task state = PENDING |
| `AWAITING_APPROVAL` | Action needs human approval | Needs Approval | Task state = NEEDS_APPROVAL |
| `BLOCKED_BY_SETUP` | Missing provider or configuration | Setup Required | Capability check failed |
| `BLOCKED_BY_PERMISSIONS` | User lacks permission | Access Denied | Role check failed |
| `FAILED` | Action failed after attempt | Failed | Task state = FAILED |
| `PARTIALLY_COMPLETED` | Some steps succeeded, some failed | Partial | Mixed action outcomes |
| `RETRYING` | Transient failure, retrying | Retrying... | Retry policy active |
| `ESCALATED` | Routed to human operator | Escalated | Escalation triggered |
| `CANCELLED` | User or system cancelled | Cancelled | Task state = CANCELLED |

---

## Continuity and Memory Design

### Tenant-Scoped Operational Context

Add to the `AgentContextEnvelope.operational`:

```typescript
interface OperationalContinuity {
  // Recent blockers the agent already encountered in this session
  known_blockers: Array<{
    capability_id: string;
    block_reason: string;
    first_encountered_at: string;
    still_blocked: boolean;
  }>;
  
  // Open approval requests from this session
  open_approvals: PendingApproval[];
  
  // Recent failures in this tenant (last 24h)
  tenant_recent_failures: Array<{
    capability_id: string;
    failure_count: number;
    last_failure_at: string;
  }>;
  
  // User intent patterns (from thread history)
  repeated_intents: Array<{
    intent: string;
    count: number;
    last_attempted_at: string;
    last_outcome: string;
  }>;
}
```

---

## Confidence and Source-of-Truth Signaling

### Schema: `OperationalConfidenceDescriptor`

```typescript
interface OperationalConfidenceDescriptor {
  source: ConfidenceSource;
  freshness: "live" | "cached" | "stale" | "static";
  cache_age_ms: number | null;
  confidence_level: "high" | "medium" | "low" | "uncertain";
  reasoning: string;
}

type ConfidenceSource =
  | "live_provider_api"       // Just queried the provider
  | "cached_platform_state"   // From Aillium Core cache
  | "capability_registry"     // From static capability metadata
  | "execution_trace"         // From recent execution records
  | "staff_room_knowledge"    // From Staff Room knowledge base
  | "static_product_knowledge" // Built-in knowledge
  | "uncertain_inference";     // LLM inference, not verified
```

---

## Recommended Services, Interfaces, and Schemas

### New Services Required

| Service | Location | Purpose |
|---------|----------|---------|
| `CapabilityRegistryService` | Aillium Core | Central capability metadata store |
| `RuntimeContextAssemblyService` | Aillium Core | Assembles AgentContextEnvelope per request |
| `ErrorTranslationEngine` | Aillium Core + OpenClaw boundary | Converts raw errors to InterpretedError |
| `ExecutionExplainerService` | Aillium Core | Generates ExecutionAttemptSummary from traces |
| `GovernanceEvaluationService` | Aillium Core | Evaluates ActionEvaluationRequest against policies |

### New Adapters in src/aillium/

| Adapter | Purpose |
|---------|---------|
| `AgentContextEnvelopeProvider` | Fetches assembled context envelope from Core |
| `CapabilityPreflightChecker` | Pre-checks capability availability before tool invocation |
| `ErrorTranslationAdapter` | Translates raw errors into InterpretedError locally |
| `ApprovalStateReflector` | Queries pending approvals and governance policies |

### New Schemas in aillium-schemas

| Schema | File |
|--------|------|
| `RuntimeCapabilityContext` | `schemas/core/runtime-context.schema.json` |
| `CapabilityDescriptor` | `schemas/core/capability-registry.schema.json` |
| `InterpretedError` | `schemas/core/error-translation.schema.json` |
| `AgentContextEnvelope` | `schemas/core/agent-context-envelope.schema.json` |
| `ExecutionAttemptSummary` | `schemas/core/execution-summary.schema.json` |
| `OperationalConfidenceDescriptor` | `schemas/core/confidence.schema.json` |

---

## Recommended File-Level or Module-Level Changes

### aillium-openclaw Changes

| File | Change | Priority |
|------|--------|----------|
| `src/aillium/contracts.ts` | Add `AgentContextEnvelopeProvider`, `CapabilityPreflightChecker`, `ErrorTranslationAdapter` interfaces | P0 |
| `src/aillium/live-boundary.ts` | Implement live HTTP adapters for new interfaces | P0 |
| `src/aillium/defaults.ts` | Add no-op defaults for new interfaces | P0 |
| `src/agents/system-prompt.ts` | Inject context envelope sections into system prompt | P0 |
| `src/agents/system-prompt-params.ts` | Accept and format AgentContextEnvelope | P0 |
| `src/agents/openclaw-tools.ts` | Add pre-flight capability check before tool invocation | P1 |
| `src/agents/pi-embedded-runner/run.ts` | Thread trace_id through execution | P1 |
| `src/agents/bash-tools.exec.ts` | Use ErrorTranslationAdapter on exec failures | P1 |
| `src/gateway/aillium-mcp-http.ts` | Add error translation for MCP failures | P1 |
| `src/agents/tool-catalog.ts` | Make tool availability dynamic based on context envelope | P2 |

### aillium-schemas Changes

| File | Change | Priority |
|------|--------|----------|
| `schemas/core/agent-context-envelope.schema.json` | New schema | P0 |
| `schemas/core/capability-registry.schema.json` | New schema | P0 |
| `schemas/core/error-translation.schema.json` | New schema | P1 |
| `schemas/core/execution-summary.schema.json` | New schema | P2 |
| `packages/typescript/src/contracts.ts` | Add Zod validators for all new schemas | P0 |

### aillium-core Changes (Recommendations for Private Repo)

| Component | Change | Priority |
|-----------|--------|----------|
| `/api/master-agent/runtime/context-envelope` | New endpoint: assemble and return AgentContextEnvelope | P0 |
| Capability Registry Service | New service: CRUD + query for CapabilityDescriptor | P0 |
| Governance Evaluation Service | New endpoint: evaluate action against governance policies | P1 |
| Error Translation Rules Store | New store: configurable error translation rules | P1 |
| Execution Explainer Service | New service: generate ExecutionAttemptSummary from traces | P2 |

---

## Pseudocode

### 1. Assembling Runtime Capability Context Before Model Invocation

```typescript
async function assembleRuntimeContext(
  boundary: AilliumIntegrationBoundary,
  sessionKey: string,
  userId: string,
  tenantId: string,
  traceId: string,
): Promise<AgentContextEnvelope | null> {
  if (!boundary.contextEnvelope) {
    return null; // Standalone mode, no Aillium Core
  }
  
  try {
    const envelope = await boundary.contextEnvelope.getEnvelope({
      tenantId,
      userId,
      sessionKey,
      traceId,
    });
    return envelope;
  } catch (err) {
    // Degrade gracefully: agent runs without enhanced context
    logWarning("Failed to fetch context envelope", { traceId, error: err });
    return null;
  }
}
```

### 2. Evaluating Effective User Capabilities

```typescript
function evaluateEffectiveCapabilities(
  envelope: AgentContextEnvelope,
): EffectiveUserCapabilityProfile {
  const profile: EffectiveUserCapabilityProfile = {
    can_execute: [],
    needs_approval: [],
    blocked: [],
    setup_required: [],
  };
  
  for (const cap of envelope.capabilities.available) {
    // Check if any governance policy gates this capability
    const matchingPolicy = envelope.approvals.governance_policies.find(
      p => matchGlob(p.action_pattern, cap.capability_id)
    );
    
    if (matchingPolicy?.requires_approval) {
      profile.needs_approval.push({
        ...cap,
        approval_level: matchingPolicy.approval_level,
        risk_level: matchingPolicy.risk_threshold,
      });
    } else {
      profile.can_execute.push(cap);
    }
  }
  
  for (const blocked of envelope.capabilities.blocked) {
    if (blocked.block_reason === "provider_disconnected") {
      profile.setup_required.push(blocked);
    } else {
      profile.blocked.push(blocked);
    }
  }
  
  return profile;
}
```

### 3. Resolving Action Against Capabilities, Permissions, Approvals, and Health

```typescript
async function resolveActionFeasibility(
  action: string,
  envelope: AgentContextEnvelope,
  capabilityRegistry: CapabilityPreflightChecker,
): Promise<ActionFeasibilityResult> {
  // Step 1: Find matching capability
  const capability = await capabilityRegistry.findCapability(action);
  if (!capability) {
    return { feasible: false, reason: "not_supported",
      explanation: `This action is not available in the current system.` };
  }
  
  // Step 2: Check provider connectivity
  const requiredProviders = capability.required_providers;
  const disconnected = requiredProviders.filter(
    p => !envelope.providers.connected.some(c => c.provider_id === p)
  );
  if (disconnected.length > 0) {
    return { feasible: false, reason: "provider_disconnected",
      explanation: `Requires ${disconnected.join(", ")} to be connected.`,
      setup_hint: capability.setup_instructions };
  }
  
  // Step 3: Check user permissions
  const missingPerms = capability.required_permissions.filter(
    p => !envelope.user.permissions.includes(p)
  );
  if (missingPerms.length > 0) {
    return { feasible: false, reason: "permission_denied",
      explanation: `Your role (${envelope.user.role}) lacks: ${missingPerms.join(", ")}`,
      fixable_by_role: "ADMIN" };
  }
  
  // Step 4: Check tenant plan
  if (capability.required_plan && 
      planOrder(envelope.tenant.plan) < planOrder(capability.required_plan)) {
    return { feasible: false, reason: "plan_required",
      explanation: `Available on ${capability.required_plan} plan. Current: ${envelope.tenant.plan}` };
  }
  
  // Step 5: Check approval requirements
  if (capability.approval_required) {
    return { feasible: true, gated: true, reason: "approval_required",
      approval_level: capability.approval_level,
      explanation: `This action can be prepared but requires ${capability.approval_level} approval.` };
  }
  
  // Step 6: Check system health
  if (envelope.operational.system_health.overall === "partial_outage" &&
      envelope.operational.system_health.degraded_services.includes(capability.module)) {
    return { feasible: true, degraded: true,
      explanation: `${capability.human_name} is available but the service is currently degraded.` };
  }
  
  return { feasible: true, explanation: "Ready to execute." };
}
```

### 4. Normalizing Raw Exceptions into Interpreted Errors

```typescript
function translateError(
  rawError: unknown,
  context: { capability_id?: string; provider?: string; trace_id: string },
  rules: ErrorTranslationRule[],
): InterpretedError {
  const normalized = normalizeRawError(rawError);
  
  // Match against translation rules (most specific first)
  for (const rule of rules) {
    if (matchesRule(normalized, rule.match)) {
      return {
        error_id: generateErrorId(),
        category: rule.category,
        severity: rule.severity ?? "error",
        user_message: interpolateTemplate(rule.template, {
          provider: context.provider ?? "the service",
          capability: context.capability_id ?? "this action",
          ...normalized.metadata,
        }),
        user_next_step: rule.next_step ?? null,
        is_fixable_by_user: rule.fixable_by_user ?? false,
        fixable_by_role: rule.fixable_by_role ?? null,
        raw_error_code: normalized.code,
        raw_error_message: normalized.message,
        provider: context.provider ?? null,
        retryable: rule.retryable ?? false,
        retry_after_ms: normalized.retryAfterMs ?? null,
        capability_id: context.capability_id ?? null,
        trace_id: context.trace_id,
      };
    }
  }
  
  // Fallback: unknown but bounded
  return {
    error_id: generateErrorId(),
    category: "unknown",
    severity: "error",
    user_message: "Something went wrong. The system encountered an unexpected error.",
    user_next_step: "Try again, or contact support if the issue persists.",
    is_fixable_by_user: false,
    fixable_by_role: null,
    raw_error_code: normalized.code,
    raw_error_message: normalized.message,
    provider: context.provider ?? null,
    retryable: true,
    retry_after_ms: 5000,
    capability_id: context.capability_id ?? null,
    trace_id: context.trace_id,
  };
}

function normalizeRawError(err: unknown): NormalizedError {
  if (err instanceof Response || (err && typeof err === "object" && "status" in err)) {
    return { code: `HTTP_${(err as any).status}`, message: String((err as any).statusText ?? ""),
             status: (err as any).status, metadata: {} };
  }
  if (err instanceof Error) {
    return { code: err.name, message: err.message, status: null,
             metadata: { stack: err.stack } };
  }
  return { code: "UNKNOWN", message: String(err), status: null, metadata: {} };
}
```

### 5. Generating User-Facing Explanation from Execution Trace

```typescript
function generateExplanation(
  trace: ExecutionTrace,
  interpretedErrors: InterpretedError[],
  envelope: AgentContextEnvelope,
): UserActionabilityExplanation {
  const actions = trace.actions.map(action => {
    const error = interpretedErrors.find(e => e.trace_id === action.trace_id);
    return {
      description: action.description,
      outcome: error ? "failed" : "succeeded",
      error_explanation: error?.user_message ?? null,
    };
  });
  
  const allSucceeded = actions.every(a => a.outcome === "succeeded");
  const allFailed = actions.every(a => a.outcome === "failed");
  
  const outcome = allSucceeded ? "succeeded" 
    : allFailed ? "failed"
    : "partially_completed";
  
  const steps_taken = actions.map(a => 
    a.outcome === "succeeded" 
      ? `Completed: ${a.description}`
      : `Failed: ${a.description} - ${a.error_explanation}`
  );
  
  const next_steps = interpretedErrors
    .filter(e => e.user_next_step)
    .map(e => e.user_next_step!);
  
  return {
    action_requested: trace.user_intent,
    outcome,
    explanation: buildNarrativeExplanation(outcome, actions),
    steps_taken,
    next_steps: next_steps.length > 0 ? next_steps : ["Try the request again or ask for help."],
    related_capability: trace.capability_id ?? null,
    confidence: {
      source: "execution_trace",
      freshness: "live",
      cache_age_ms: null,
      confidence_level: "high",
      reasoning: "Based on actual execution results from this request.",
    },
  };
}
```

### 6. End-to-End Request Execution Flow

```typescript
async function handleUserRequest(
  message: string,
  sessionKey: string,
  userId: string,
  tenantId: string,
  boundary: AilliumIntegrationBoundary,
): Promise<AgentResponse> {
  const traceId = generateTraceId();
  
  // 1. Fetch runtime context envelope
  const envelope = await assembleRuntimeContext(
    boundary, sessionKey, userId, tenantId, traceId
  );
  
  // 2. Build enhanced system prompt with context
  const systemPrompt = buildAgentSystemPrompt({
    ...baseParams,
    contextEnvelope: envelope,  // NEW: inject envelope
  });
  
  // 3. Execute agent with context-aware tools
  const result = await piEmbeddedRunner.run({
    systemPrompt,
    messages: [{ role: "user", content: message }],
    tools: buildContextAwareTools(envelope),  // NEW: filter tools by capability
    onToolCall: async (toolCall) => {
      // 4. Pre-flight check before execution
      if (envelope) {
        const feasibility = await resolveActionFeasibility(
          toolCall.name, envelope, boundary.capabilityPreflight!
        );
        if (!feasibility.feasible) {
          return { error: feasibility.explanation };
        }
        if (feasibility.gated) {
          // Create approval request and inform user
          return { pending_approval: true, message: feasibility.explanation };
        }
      }
      
      // 5. Execute with error translation
      try {
        return await executeTool(toolCall);
      } catch (err) {
        const interpreted = translateError(err, {
          capability_id: toolCall.name,
          provider: detectProvider(toolCall),
          trace_id: traceId,
        }, errorTranslationRules);
        
        // Return user-friendly error to agent
        return { error: interpreted.user_message, 
                 next_step: interpreted.user_next_step };
      }
    },
  });
  
  // 6. Emit evidence
  await boundary.evidenceHooks[0]?.onEvidence("request_completed", {
    trace_id: traceId,
    outcome: result.success ? "completed" : "failed",
    actions: result.toolCalls.length,
  }, { runtimeSessionKey: sessionKey } as any);
  
  return result;
}
```

---

## Example Responses

### Good vs. Bad Agent Responses

#### Example 1: Provider Not Connected

**Bad (current)**:
> "I'd be happy to check your latest emails. Let me look into that for you..."
> [Tool call fails silently, no response or generic error]

**Good (target)**:
> "I can't access your emails right now because your email provider isn't connected. To set this up, go to **Settings > Integrations > Email** and connect your Google Workspace or Microsoft 365 account. Once connected, I'll be able to read, search, and manage your emails."

#### Example 2: Permission Denied

**Bad (current)**:
> "I encountered an error trying to create that invoice."

**Good (target)**:
> "I can't create invoices with your current account. Invoice creation requires the **Finance** permission, which is available to Admin users. Your current role is **User**. Ask your workspace admin to grant you Finance permissions, or I can draft the invoice details for you to send to someone with the right access."

#### Example 3: Approval Required

**Bad (current)**:
> [Attempts action, gets blocked, returns vague error]

**Good (target)**:
> "I've prepared the payment of 2,450.00 GBP to Acme Corp. However, payments over 1,000 GBP require **Department Manager** approval per your workspace policy. I've submitted the approval request to Sarah Chen (your department manager). You'll be notified when it's approved, and I'll process the payment automatically."

#### Example 4: Feature Not Available on Plan

**Bad (current)**:
> "As an AI assistant, I'm not able to access CRM functionality."

**Good (target)**:
> "CRM features aren't available on your current **Growth** plan. The CRM module (contact management, deal tracking, pipeline views) is included in the **Operator** plan. You can upgrade in **Settings > Billing**, or I can help you manage contacts using a spreadsheet in the meantime."

#### Example 5: Transient Failure with Retry

**Bad (current)**:
> [Silent failure, no message to user]

**Good (target)**:
> "The calendar service is temporarily unavailable (it returned a timeout error). I'll retry in 30 seconds. This is usually a brief interruption - if it persists, check your Google Workspace connection in Settings."

### Role-Sensitive Response Examples

| Scenario | Admin Response | User Response |
|----------|---------------|---------------|
| "Delete this customer record" | "Done. Customer record #4521 has been deleted. This action is logged in the audit trail." | "I can't delete customer records with your current permissions. I can flag this record for deletion - your admin will review it." |
| "Show me the billing dashboard" | "Here's your billing overview: [data]" | "Billing information is only visible to Admin users. I can show you your own usage stats instead." |
| "Configure the email integration" | "I'll walk you through the email setup. First, go to Settings > Integrations..." | "Integration configuration requires Admin access. I can send a request to your admin to set up email integration." |
| "What's our monthly spend?" | "Your total spend this month is 4,231.50 GBP across all services." | "Spending details are restricted to Admin view. I can tell you about your personal usage: you've used 42 tasks this month." |

### Blocked Action Guidance Examples

| Block Type | Agent Response |
|------------|---------------|
| Provider disconnected | "Your Slack workspace isn't connected. Connect it in Settings > Integrations > Slack to enable messaging features." |
| Permission denied | "Sending payments requires the Finance permission. Your role (User) doesn't have it. Contact your admin." |
| Feature flag off | "Remote assist is disabled for your workspace. An admin can enable it in Settings > Features." |
| Plan limitation | "Workflow automation is an Operator plan feature. Upgrade in Settings > Billing." |
| Approval pending | "This action was submitted for approval 2 hours ago. It's waiting for Sarah Chen's approval. I'll notify you when approved." |

### Approval-Aware Response Examples

| Scenario | Response |
|----------|----------|
| Payment > threshold | "Payment of 5,000 GBP prepared. Requires Owner approval (policy: payments > 1,000 GBP). Approval request sent to workspace owner." |
| Bulk data export | "Data export request prepared (1.2GB, 50K records). This is classified as HIGH risk and requires Multi-Party approval. Sent to department manager and compliance officer." |
| New integration connection | "Google Workspace connection request prepared. New integration connections require Admin approval. Request sent." |
| Delete workflow | "Workflow deletion prepared. Destructive actions require Department Manager approval. Request queued." |
| Auto-approved action | "Invoice for 450 GBP sent to client. Auto-approved (under 500 GBP department threshold). Logged in audit trail." |

### Confidence/Source-of-Truth Signal Examples

| Statement | Confidence Tag |
|-----------|---------------|
| "Your last 5 emails are..." | Source: live_provider_api / Freshness: live / Confidence: high |
| "Based on your CRM, the deal is in Proposal stage" | Source: cached_platform_state / Freshness: cached (2min) / Confidence: high |
| "Remote assist supports screen sharing and file transfer" | Source: capability_registry / Freshness: static / Confidence: high |
| "The payment was processed yesterday at 3pm" | Source: execution_trace / Freshness: live / Confidence: high |
| "I believe the standard process is to..." | Source: staff_room_knowledge / Freshness: cached / Confidence: medium |
| "Email deliverability is typically around..." | Source: uncertain_inference / Freshness: N/A / Confidence: low |

---

## Quick Wins (0-4 Weeks)

1. **Inject user role into system prompt** - Read role from Aillium Core session and add "Current user role: {role}" to system prompt. ~1 day of work in `src/aillium/live-boundary.ts` + `src/agents/system-prompt.ts`.

2. **Add retry with backoff to live boundary adapters** - Replace silent catch blocks with retry logic. ~2 days across `src/aillium/live-boundary.ts`.

3. **Surface Staff Room context in system prompt** - The `StaffRoomContextProvider` already exists. Wire its output into the system prompt builder. ~1 day.

4. **Add provider connectivity check endpoint** - New Aillium Core endpoint that returns connected/disconnected provider list. Wire into system prompt as a simple text block. ~3 days.

5. **Create error translation rule file** - Start with a static JSON/TypeScript file of the 15 most common errors and their user-facing translations. Apply at the gateway response level. ~3 days.

6. **Add trace_id to all Aillium boundary calls** - Thread trace_id from request through all adapter calls for correlation. ~1 day.

7. **Document the 15 most common failure modes** - Create the error translation reference table and share with the team. ~1 day.

---

## Medium-Term Refactors (1-3 Months)

1. **Build AgentContextEnvelope endpoint in Aillium Core** - Assemble all context (user, providers, capabilities, approvals, health) into a single response. This is the highest-impact architectural change.

2. **Implement CapabilityDescriptor model** - Define all capabilities with their requirements in a queryable store. Start with the 20 most-used capabilities.

3. **Build ErrorTranslationEngine** - Implement the rule-based error translation system with configurable rules per tenant.

4. **Wire approval state into agent context** - Query pending approvals and governance policies, reflect into system prompt.

5. **Add pre-flight capability check to tool invocation** - Before executing a tool, verify the capability is available and the user has permission.

6. **Standardize status states across portal** - Implement the 11 standardized statuses in the portal UI.

7. **Add execution summary generation** - After task completion, generate a structured summary from the execution trace.

---

## Long-Term Platform Upgrades (3-12 Months)

1. **Full Capability Registry Service** - Queryable, versioned, extensible registry with admin UI for capability management.

2. **Proactive failure handling and alerting** - Automated retry policies, fallback actions, escalation routes, and user notifications.

3. **Tenant-scoped operational memory** - Persistent storage of blockers, failures, intents across sessions with automatic staleness management.

4. **Confidence signaling in all responses** - Every agent response tagged with data source and freshness indicator.

5. **Execution trace visualization** - Portal view showing what the agent attempted, tool calls made, and outcomes.

6. **Self-healing capability** - Agent can diagnose and suggest fixes for common configuration issues (disconnected providers, expired tokens, missing permissions).

7. **Learning loop integration** - Connect trajectory records and learning evaluations to improve agent behavior over time.

---

## Risks and Edge Cases

| Risk | Mitigation |
|------|------------|
| Context envelope adds latency to every request | Cache envelope for 60s per session; degrade gracefully if fetch fails |
| Capability registry becomes stale | Version capabilities; add health check that validates registry against live state |
| Error translation rules become brittle | Use category-based matching (not exact string matching); fallback to "unknown but bounded" |
| Agent over-explains blockers instead of acting | Tune prompt to explain only when action is actually blocked; act first when possible |
| Privacy: user role leaks into agent responses | Never expose internal role names in user-facing text; use generic "your account" language |
| Migration: existing prompts break with new context | Feature-flag the context envelope injection; roll out per-tenant |
| Performance: too many pre-flight checks | Batch capability checks; cache results per session |

---

## Final Implementation Roadmap

### Phase 1: Foundation (Weeks 1-6)
- [ ] Add AgentContextEnvelope schema to aillium-schemas
- [ ] Build context envelope assembly endpoint in Aillium Core
- [ ] Add AgentContextEnvelopeProvider to src/aillium/ boundary
- [ ] Inject user role and provider status into system prompt
- [ ] Add retry logic to all live boundary adapters
- [ ] Create static error translation rules (top 15 errors)
- [ ] Thread trace_id through all boundary calls

### Phase 2: Capability Awareness (Weeks 7-12)
- [ ] Build CapabilityDescriptor model and seed initial capabilities
- [ ] Build CapabilityRegistry query endpoint in Core
- [ ] Add capability pre-flight check to tool invocation pipeline
- [ ] Wire approval state into agent context
- [ ] Implement dynamic tool availability based on context envelope
- [ ] Build ErrorTranslationEngine with rule matching
- [ ] Standardize status states in portal

### Phase 3: Explanation and Cohesion (Weeks 13-20)
- [ ] Build ExecutionAttemptSummary generation from traces
- [ ] Add execution trace visualization to portal
- [ ] Implement tenant-scoped operational continuity
- [ ] Add confidence signaling to agent responses
- [ ] Build proactive failure handling (retry, fallback, escalation)
- [ ] Connect governance policy evaluation to agent context

### Phase 4: Intelligence and Learning (Weeks 21-30)
- [ ] Connect trajectory recording to capability registry
- [ ] Implement learning evaluation loop
- [ ] Build self-healing capability suggestions
- [ ] Add cross-session operational memory
- [ ] Full Capability Registry admin UI
- [ ] Performance optimization (caching, batching, prefetch)

---

*This blueprint was generated from a full codebase audit of 5 accessible Aillium repositories (aillium-openclaw, aillium-schemas, aillium-ui-tars, aillium-ui-tars-desktop, aillium-remote-meshcentral) with architectural inference for 6 private repositories (aillium-core, aillium-portal, aillium-integrations, aillium-remote, aillium-code, platform). Assumptions about private repositories are clearly marked and should be validated against the actual codebases.*