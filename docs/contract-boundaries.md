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
