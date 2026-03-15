# aillium-schemas

## Purpose
`aillium-schemas` is the **single source of truth for contracts** across the Aillium platform.

## Architecture boundary split
Contracts are organized by architecture boundary:
- **Aillium Core** (control plane)
  - `specs/openapi/aillium-core.yaml`
  - `schemas/core/task-workflow.schema.json`
- **OpenClaw runtime** (runtime/orchestration substrate)
  - `schemas/openclaw/runtime.schema.json`
  - `schemas/executor/*.schema.json` (runtime compatibility surface)
- **MeshCentral integration** (remote-support substrate)
  - `schemas/meshcentral/remote-support.schema.json`
- **Deprecated legacy worker surfaces**
  - `schemas/deprecated/worker-poll.schema.json`

See `docs/contract-boundaries.md` for migration notes and deprecation guidance.

## What This Repo Does
- Task schemas
- Event schemas
- Runtime/executor schemas
- Remote-support schemas
- OpenAPI specifications
- Shared SDK generation (TypeScript + Python)

## What This Repo Does NOT Do
- No business logic
- No environment config
- No secrets

## Architecture Role
Contracts & Interfaces

## Packages
- `@aillium/schemas` (TypeScript): Zod validators, TypeScript interfaces, API client types.
- `aillium-schemas` (Python): Pydantic models, API client types.

## Usage
All services must conform to schemas defined here and consume generated artifacts.

## Licence
Apache 2.0
