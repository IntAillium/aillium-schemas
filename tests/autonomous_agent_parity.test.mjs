/**
 * Autonomous agent contract parity tests: verify TypeScript Zod schemas
 * match canonical JSON Schema enums and required fields.
 *
 * Run: node --test tests/autonomous_agent_parity.test.mjs
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

const schema = loadJSON("schemas/core/autonomous-agent.schema.json");
const defs = schema.$defs;

const contracts = await import(
  resolve(ROOT, "packages/typescript/dist/index.js")
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract Zod enum values from a ZodEnum schema. */
function zodEnumValues(zodSchema) {
  if (zodSchema && zodSchema.options) return [...zodSchema.options];
  if (zodSchema && zodSchema._def && zodSchema._def.values)
    return [...zodSchema._def.values];
  return null;
}

/** Get the required keys from a JSON Schema object definition. */
function jsonSchemaRequired(defName) {
  return defs[defName]?.required ?? [];
}

/** Get the property keys from a JSON Schema object definition. */
function jsonSchemaPropertyKeys(defName) {
  return Object.keys(defs[defName]?.properties ?? {});
}

/** Get the Zod shape keys from a Zod object schema. */
function zodShapeKeys(zodSchema) {
  if (zodSchema?.shape) return Object.keys(zodSchema.shape);
  if (zodSchema?._def?.shape)
    return Object.keys(
      typeof zodSchema._def.shape === "function"
        ? zodSchema._def.shape()
        : zodSchema._def.shape
    );
  return [];
}

// ---------------------------------------------------------------------------
// Enum parity
// ---------------------------------------------------------------------------

describe("Autonomous Agent: Enum parity (JSON ↔ TypeScript)", () => {
  const enumPairs = [
    ["risk_level", "RiskLevelValues"],
    ["approval_level", "ApprovalLevelValues"],
    ["tool_category", "ToolCategoryValues"],
    ["payment_method", "PaymentMethodValues"],
    ["payment_status", "PaymentStatusValues"],
    ["invoice_status", "InvoiceStatusValues"],
    ["escalation_policy", "EscalationPolicyValues"],
    ["crm_contact_source", "CrmContactSourceValues"],
    ["crm_deal_stage", "CrmDealStageValues"],
    ["support_channel", "SupportChannelValues"],
    ["support_priority", "SupportPriorityValues"],
    ["support_ticket_status", "SupportTicketStatusValues"],
    ["approval_request_status", "ApprovalRequestStatusValues"],
    ["approval_decision_value", "ApprovalDecisionValueValues"],
  ];

  for (const [jsonDef, tsExport] of enumPairs) {
    it(`${jsonDef} enum matches ${tsExport}`, () => {
      const canonical = defs[jsonDef]?.enum;
      assert.ok(canonical, `Missing JSON Schema $defs/${jsonDef}`);

      const tsValues = contracts[tsExport];
      assert.ok(tsValues, `Missing TypeScript export ${tsExport}`);

      assert.deepStrictEqual([...tsValues], canonical);
    });
  }
});

// ---------------------------------------------------------------------------
// Object contract parity: required fields
// ---------------------------------------------------------------------------

describe("Autonomous Agent: Required field parity (JSON ↔ TypeScript)", () => {
  const objectPairs = [
    ["skill_candidate", "SkillCandidateSchema"],
    ["skill_draft_request", "SkillDraftRequestSchema"],
    ["skill_validation_result", "SkillValidationResultSchema"],
    ["trajectory_record", "TrajectoryRecordSchema"],
    ["learning_evaluation", "LearningEvaluationSchema"],
    ["governance_policy", "GovernancePolicySchema"],
    ["action_evaluation_request", "ActionEvaluationRequestSchema"],
    ["action_evaluation_result", "ActionEvaluationResultSchema"],
    ["tool_definition", "ToolDefinitionSchema"],
    ["tool_execution_request", "ToolExecutionRequestSchema"],
    ["tool_execution_result", "ToolExecutionResultSchema"],
    ["payment_intent", "PaymentIntentSchema"],
    ["invoice", "InvoiceSchema"],
    ["invoice_line_item", "InvoiceLineItemSchema"],
    ["heartbeat_report", "HeartbeatReportSchema"],
    ["eod_report", "EodReportSchema"],
    ["ooo_session_state", "OooSessionStateSchema"],
    ["crm_contact", "CrmContactSchema"],
    ["crm_deal", "CrmDealSchema"],
    ["support_ticket", "SupportTicketSchema"],
    ["approval_request", "ApprovalRequestSchema"],
    ["approval_decision", "ApprovalDecisionSchema"],
  ];

  for (const [jsonDef, tsExport] of objectPairs) {
    it(`${jsonDef} required fields are present in ${tsExport}`, () => {
      const required = jsonSchemaRequired(jsonDef);
      assert.ok(
        required.length > 0,
        `JSON Schema $defs/${jsonDef} has no required fields`
      );

      const zodSchema = contracts[tsExport];
      assert.ok(zodSchema, `Missing TypeScript export ${tsExport}`);

      const shapeKeys = zodShapeKeys(zodSchema);

      for (const field of required) {
        assert.ok(
          shapeKeys.includes(field),
          `Required field "${field}" from ${jsonDef} is missing in ${tsExport} (has: ${shapeKeys.join(", ")})`
        );
      }
    });

    it(`${jsonDef} property keys are a superset of ${tsExport} shape`, () => {
      const jsonKeys = jsonSchemaPropertyKeys(jsonDef);
      const zodSchema = contracts[tsExport];
      if (!zodSchema) return;

      const shapeKeys = zodShapeKeys(zodSchema);

      // Every Zod key should exist in the JSON Schema
      for (const key of shapeKeys) {
        assert.ok(
          jsonKeys.includes(key),
          `TypeScript key "${key}" from ${tsExport} is not in JSON Schema $defs/${jsonDef} (has: ${jsonKeys.join(", ")})`
        );
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Structural: oneOf entries match $defs keys
// ---------------------------------------------------------------------------

describe("Autonomous Agent: oneOf completeness", () => {
  it("every $defs object-type entry is referenced in oneOf", () => {
    const oneOfRefs = schema.oneOf.map(
      (ref) => ref.$ref.replace("#/$defs/", "")
    );

    const objectDefs = Object.entries(defs)
      .filter(([, v]) => v.type === "object")
      .map(([k]) => k);

    for (const def of objectDefs) {
      assert.ok(
        oneOfRefs.includes(def),
        `$defs/${def} is an object type but not listed in oneOf`
      );
    }
  });
});
