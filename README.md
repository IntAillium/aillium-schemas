# aillium-schemas

## Purpose
`aillium-schemas` is the **single source of truth for contracts** across the Aillium platform.

## What This Repo Does
- Task schemas
- Event schemas
- Usage/metering schemas
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

## Specs
- OpenAPI 3.0 spec for aillium-core lives in `specs/openapi/aillium-core.yaml`.

## Usage
All services must conform to schemas defined here and consume generated artifacts.

## Licence
Apache 2.0
