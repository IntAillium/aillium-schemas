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

## Canonical naming policy
All new and active contracts use snake_case naming, including:
- `task_id`
- `worker_id`
- `tenant_id`
- `trace_id`

CamelCase aliases are intentionally removed from active schemas. Deprecated shapes are preserved only under the deprecated boundary.

## Language parity
TypeScript (`packages/typescript/src/contracts.ts`) and Python (`packages/python/aillium_schemas/contracts.py`) mirror the same boundary split and canonical field names.
