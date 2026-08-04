# Contract boundaries

This repository is the source of truth for boundary contracts split by architecture domain.

## Aillium Core (control plane)
- OpenAPI: `specs/openapi/aillium-core.yaml`
- JSON Schema: `schemas/core/task-workflow.schema.json`
- Scope: task lifecycle, approvals, workflow events, and control-plane state.

## OpenClaw Runtime (runtime/orchestration substrate)
- JSON Schema: `schemas/openclaw/runtime.schema.json`
- Legacy executor compatibility: `schemas/executor/*.schema.json`
- Scope: runtime dispatch/result and execution orchestration.

## MeshCentral (remote-support substrate)
- JSON Schema: `schemas/meshcentral/remote-support.schema.json`
- Scope: remote-support session request/state between control plane and MeshCentral integration.

## Deprecated worker surfaces
- OpenAPI deprecated endpoints:
  - `/workers/{worker_id}/poll`
  - `/workers/{worker_id}/results`
- JSON Schema: `schemas/deprecated/worker-poll.schema.json`
- Replacement: OpenClaw runtime contracts.

## Autonomous Agent (Aillium 2.0)
- JSON Schema: `schemas/core/autonomous-agent.schema.json`
- Scope: self-skill-creation, learning loop (trajectory/evaluation/gradient),
  governance policies, tool library, UK/GBP payments, heartbeat reporting.
- Contracts: skill_candidate, skill_draft_request, skill_validation_result,
  trajectory_record, learning_evaluation, governance_policy,
  action_evaluation_request/result, tool_definition, tool_execution_request/result,
  payment_intent, invoice, heartbeat_report, eod_report, ooo_session_state,
  crm_contact, crm_deal, support_ticket, approval_request, approval_decision.

## Canonical naming policy
All new and active contracts use snake_case naming, including:
- `task_id`
- `worker_id`
- `tenant_id`
- `trace_id`

CamelCase aliases are intentionally removed from active schemas. Deprecated shapes are preserved only under the deprecated boundary.

## Language parity
TypeScript (`packages/typescript/src/contracts.ts`) and Python (`packages/python/aillium_schemas/contracts.py`) mirror the same boundary split and canonical field names.
# Canonical lifecycle v2

The Core-owned `2.0` lifecycle is the only supported contract for new
conversation-to-execution work:

- `Conversation` maps to Core `RequestThread` during the migration window.
- An `ANSWER` creates no `WorkOrder`.
- An `ACT` creates exactly one `WorkOrder` and one initial `Run`, guarded by a
  tenant-scoped idempotency key.
- `Task`, `MasterAgentSession`, `CoordinatorRun`, `ExecutionCapsule`, and
  `DaemonJob` are legacy execution records referenced through Core's single
  compatibility boundary. They are not public lifecycle authorities.
- User-visible progress is emitted as resumable `RunEvent` records. Raw model
  chain-of-thought and system prompts are never part of this contract.
- `PAUSE`, `RESUME`, `STEER`, `CANCEL`, and `TAKEOVER` are idempotent commands.
  Requested states are distinct from executor-acknowledged states.

The TypeScript Zod contracts live in `packages/typescript/src/lifecycle-v2.ts`.
Adapters may consume these contracts but must not redefine their own work or
run state machines.

# Provider-neutral runtime v1

The Core-owned `1.0` runtime boundary lives in
`packages/typescript/src/runtime-v1.ts`. It defines the provider-neutral model
and tool capability contracts used by durable execution:

- `ExecutionContextWireV1` contains only serializable tenant, work, run, step,
  attempt, idempotency, fence, checkpoint, executor, active lease, deadline,
  model ceilings, and consumed/remaining budget-ledger data.
- `ExecutionContextV1` is process-local and adds an `AbortSignal` only after a
  wire context is validated. Signals are never serialized or trusted from a
  worker or adapter.
- `ModelAdapterV1` normalizes text, usage, native/external tool requests,
  completion, failure, and cancellation while advertising model capabilities.
- `ToolAdapterV1` advertises side-effect, approval, cancellation,
  reconciliation, and idempotency semantics and implements execute, cancel,
  and reconcile operations.
- `RuntimeCheckpointV1` records durable state before and after each model or
  tool boundary, including idempotency, fence, executor, lease, and unresolved
  side-effect state. Core remains the checkpoint and lifecycle authority.
- Lease acquire, renew, heartbeat, and loss messages use a separate serializable
  envelope because acquisition happens before an active execution context
  exists.
- Cancellation requests enforce the two-second acknowledgement and five-second
  forced-stop deadlines. Results carry correlated request, acknowledgement,
  enforcement, mechanism, and outcome timestamps.

The external tool-request protocol is a strict, bounded JSON object. It is for
models without native tool calling and does not grant authority: Core still
validates the tool allowlist, policy, approval, budget, fence, and idempotency
key before executing an adapter.

Every active runtime wire field uses `snake_case`. The canonical structural
JSON Schema is `schemas/runtime/provider-neutral-runtime-v1.schema.json`; its
byte-identical Python package copy and Python-facing round-trip adapter prevent
language-specific casing drift. The Python adapter uses the generated schema
to discriminate and fully validate every runtime and lease message payload;
decoded context, budget, ledger, and payload trees are deeply immutable.
Zod/Python refinements additionally enforce
identity equality, deadline chronology, ledger balancing, fencing, and
reconciliation rules that JSON Schema cannot express by itself.

All integer fields carry explicit generated-schema maxima. Runtime duration is
bounded to 31 days; attempts and call/retry/revision counts to 1,000,000;
individual input or output token counts to 1,000,000,000; total tokens to
2,000,000,000; cost to 1,000,000,000,000 minor units; and monotonic ordinals to
1,000,000,000,000. These domain limits keep pairwise and 64-model aggregate
ledger arithmetic exactly representable by JavaScript numbers while remaining
well above a permitted execution's operational range.

Runtime JSON values are bounded by byte size, depth, and node count. The
external structured tool protocol uses the narrower 64 KiB and 12-level depth
limits. The one-MiB global bound applies to the complete model request and wire
envelope, including all message text. These limits are transport protection
only; Core must still validate
the selected tool against the trusted allowlist and approval policy.
