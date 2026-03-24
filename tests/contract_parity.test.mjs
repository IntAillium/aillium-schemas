/**
 * Contract parity tests: verify TypeScript exports match canonical JSON schemas.
 *
 * Run: node --test tests/contract_parity.test.mjs
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

function loadJSON(relPath) {
  return JSON.parse(readFileSync(resolve(ROOT, relPath), "utf-8"));
}

// Canonical JSON schemas
const taskWorkflow = loadJSON("schemas/core/task-workflow.schema.json");
const runtime = loadJSON("schemas/openclaw/runtime.schema.json");
const executorResponse = loadJSON(
  "schemas/executor/executor.response.schema.json"
);
const remoteSupport = loadJSON(
  "schemas/meshcentral/remote-support.schema.json"
);

// TypeScript exports (import from built dist)
const contracts = await import(
  resolve(ROOT, "packages/typescript/dist/index.js")
);

describe("TypeScript ↔ Canonical JSON parity", () => {
  it("RiskLevelValues matches canonical risk_level enum", () => {
    const canonical = taskWorkflow.$defs.risk_level.enum;
    assert.deepStrictEqual([...contracts.RiskLevelValues], canonical);
  });

  it("TaskStateValues matches canonical task_state enum", () => {
    const canonical = taskWorkflow.$defs.task_state.enum;
    assert.deepStrictEqual([...contracts.TaskStateValues], canonical);
  });

  it("RoleValues matches expected values", () => {
    assert.deepStrictEqual(
      [...contracts.RoleValues],
      ["SUPER_ADMIN", "ADMIN", "USER"]
    );
  });

  it("PlanValues matches expected values", () => {
    assert.deepStrictEqual(
      [...contracts.PlanValues],
      ["STARTER", "GROWTH", "OPERATOR", "ENTERPRISE"]
    );
  });

  it("RuntimeStatusSchema matches canonical runtime status enum", () => {
    const canonical =
      runtime.$defs.runtime_result.properties.status.enum;
    // Extract enum values from Zod schema
    assert.deepStrictEqual(
      contracts.RuntimeStatusSchema.options,
      canonical
    );
  });

  it("Executor response status enum matches canonical", () => {
    const canonical = executorResponse.properties.status.enum;
    assert.deepStrictEqual(canonical, [
      "succeeded",
      "failed",
      "cancelled",
      "timed_out",
    ]);
  });

  it("MeshCentral session state status matches canonical", () => {
    const canonical =
      remoteSupport.$defs.session_state.properties.status.enum;
    assert.deepStrictEqual(canonical, [
      "requested",
      "establishing",
      "active",
      "ended",
      "failed",
    ]);
  });
});

describe("Canonical JSON schema internal consistency", () => {
  it("risk_level has MEDIUM between LOW and HIGH", () => {
    const levels = taskWorkflow.$defs.risk_level.enum;
    assert.ok(levels.includes("MEDIUM"), "MEDIUM missing from risk_level");
    assert.ok(
      levels.indexOf("MEDIUM") > levels.indexOf("LOW"),
      "MEDIUM should come after LOW"
    );
    assert.ok(
      levels.indexOf("MEDIUM") < levels.indexOf("HIGH"),
      "MEDIUM should come before HIGH"
    );
  });

  it("Python embedded schema matches canonical schema", () => {
    const embedded = loadJSON(
      "packages/python/aillium_schemas/schemas/core/task-workflow.schema.json"
    );
    assert.deepStrictEqual(embedded, taskWorkflow);
  });
});
