import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CancellationMetadataV1Schema,
  ExecutionContextWireV1Schema,
  ExecutorHeartbeatV1Schema,
  ExecutorLeaseAcquireRequestV1Schema,
  ExecutorLeaseAcquireResultV1Schema,
  ExecutorLeaseLossV1Schema,
  ExecutorLeaseRenewRequestV1Schema,
  ExecutorLeaseRenewResultV1Schema,
  ExecutorLeaseWireEnvelopeV1Schema,
  ExternalStructuredToolRequestV1Schema,
  ModelCapabilitiesV1Schema,
  ModelEventV1Schema,
  ModelGenerateRequestV1Schema,
  RuntimeCheckpointV1Schema,
  RuntimeContractVersion,
  RuntimeWireEnvelopeV1Schema,
  ToolCancelRequestV1Schema,
  ToolCancelResultV1Schema,
  ToolCapabilitiesV1Schema,
  ToolExecuteRequestV1Schema,
  ToolExecuteResultV1Schema,
  ToolReconcileRequestV1Schema,
  ToolReconcileResultV1Schema,
  bindExecutionSignalV1,
} from "../dist/index.js";

let positiveAssertions = 0;
let negativeAssertions = 0;

function accepts(schema, value, inspect = () => {}) {
  const parsed = schema.parse(value);
  inspect(parsed);
  positiveAssertions += 1;
  return parsed;
}

function rejects(schema, value) {
  assert.throws(() => schema.parse(value));
  negativeAssertions += 1;
}

function check(value) {
  assert.ok(value);
  positiveAssertions += 1;
}

const at = "2026-08-03T12:00:00.000Z";
const operationIdentity = {
  tenant_id: "tenant-1",
  work_order_id: "work-1",
  run_id: "run-1",
  run_step_id: "step-1",
  attempt: 1,
  operation_id: "operation-1",
  idempotency_key: "work-1:step-1:attempt-1",
  fence_token: "42",
};
const budget = {
  deadline_at: "2026-08-03T12:05:00.000Z",
  max_duration_ms: 300_000,
  max_model_calls: 8,
  max_tool_calls: 12,
  max_retries: 2,
  max_revision_count: 3,
  max_input_tokens: 20_000,
  max_output_tokens: 5_000,
  max_total_tokens: 25_000,
  max_cost: { currency: "GBP", minor_units: 500 },
  model_ceilings: [
    {
      provider: "provider-1",
      model: "model-1",
      max_calls: 8,
      max_input_tokens: 20_000,
      max_output_tokens: 5_000,
      max_total_tokens: 25_000,
      max_cost_minor_units: 500,
    },
  ],
};
const emptyBudgetCounters = {
  duration_ms: 0,
  model_calls: 0,
  tool_calls: 0,
  retries: 0,
  revisions: 0,
  input_tokens: 0,
  output_tokens: 0,
  total_tokens: 0,
  cost_minor_units: 0,
};
const remainingBudgetCounters = {
  duration_ms: 300_000,
  model_calls: 8,
  tool_calls: 12,
  retries: 2,
  revisions: 3,
  input_tokens: 20_000,
  output_tokens: 5_000,
  total_tokens: 25_000,
  cost_minor_units: 500,
};
const wireContext = {
  contract_version: "1.0",
  tenant_id: "tenant-1",
  work_order_id: "work-1",
  run_id: "run-1",
  run_step_id: "step-1",
  attempt: 1,
  idempotency_key: operationIdentity.idempotency_key,
  fence_token: operationIdentity.fence_token,
  checkpoint_cursor: "checkpoint-4",
  executor_id: "executor-1",
  lease_id: "lease-1",
  lease_epoch: 3,
  lease_expires_at: "2026-08-03T12:10:00.000Z",
  budget,
  budget_ledger: {
    currency: "GBP",
    consumed: emptyBudgetCounters,
    remaining: remainingBudgetCounters,
    model_consumption: [],
    updated_at: at,
  },
};

check(RuntimeContractVersion === "1.0");
accepts(ExecutionContextWireV1Schema, wireContext, (value) =>
  assert.equal(value.run_step_id, "step-1"),
);
const controller = new AbortController();
const localContext = bindExecutionSignalV1(wireContext, controller.signal);
check(localContext.signal === controller.signal);
check(Object.isFrozen(localContext));
check(Object.isFrozen(localContext.budget));
check(Object.isFrozen(localContext.budget.max_cost));
check(Object.isFrozen(localContext.budget_ledger.remaining));
assert.throws(() => {
  localContext.budget.max_model_calls = 99;
});
negativeAssertions += 1;

rejects(ExecutionContextWireV1Schema, { ...wireContext, signal: controller.signal });
rejects(ExecutionContextWireV1Schema, { ...wireContext, tenantId: "camel" });
rejects(ExecutionContextWireV1Schema, { ...wireContext, fence_token: -1 });
rejects(ExecutionContextWireV1Schema, { ...wireContext, tenant_id: " tenant-1" });
rejects(ExecutionContextWireV1Schema, { ...wireContext, checkpoint_cursor: " 4" });
rejects(ExecutionContextWireV1Schema, {
  ...wireContext,
  lease_expires_at: "2026-08-03 12:10:00",
});
for (const impossibleOffset of ["+25:00", "+99:99"]) {
  rejects(ExecutionContextWireV1Schema, {
    ...wireContext,
    lease_expires_at: `2026-08-03T12:10:00${impossibleOffset}`,
  });
}
for (const mutate of [
  (context) => {
    context.budget.max_duration_ms = Number.MAX_SAFE_INTEGER;
  },
  (context) => {
    context.budget.max_model_calls = Number.MAX_SAFE_INTEGER;
  },
  (context) => {
    context.budget.max_cost.minor_units = Number.MAX_SAFE_INTEGER;
  },
  (context) => {
    context.budget_ledger.remaining.input_tokens = Number.MAX_SAFE_INTEGER;
  },
  (context) => {
    context.budget.model_ceilings[0].max_total_tokens = Number.MAX_SAFE_INTEGER;
  },
]) {
  const unsafeContext = structuredClone(wireContext);
  mutate(unsafeContext);
  rejects(ExecutionContextWireV1Schema, unsafeContext);
}
rejects(ExecutionContextWireV1Schema, {
  ...wireContext,
  budget: { ...budget, max_total_tokens: 1_000 },
});
rejects(ExecutionContextWireV1Schema, {
  ...wireContext,
  budget_ledger: {
    ...wireContext.budget_ledger,
    remaining: { ...remainingBudgetCounters, model_calls: 9 },
  },
});
rejects(ExecutionContextWireV1Schema, {
  ...wireContext,
  budget: { ...budget, max_total_tokens: 24_999 },
});
rejects(ExecutionContextWireV1Schema, {
  ...wireContext,
  budget: {
    ...budget,
    model_ceilings: [
      { ...budget.model_ceilings[0], max_total_tokens: 24_999 },
    ],
  },
});
rejects(ExecutionContextWireV1Schema, {
  ...wireContext,
  budget_ledger: {
    ...wireContext.budget_ledger,
    consumed: { ...emptyBudgetCounters, total_tokens: 1 },
    remaining: { ...remainingBudgetCounters, total_tokens: 24_999 },
  },
});
rejects(ExecutionContextWireV1Schema, {
  ...wireContext,
  budget_ledger: {
    ...wireContext.budget_ledger,
    consumed: { ...emptyBudgetCounters, model_calls: 2 },
    remaining: { ...remainingBudgetCounters, model_calls: 6 },
    model_consumption: [
      {
        provider: "provider-1",
        model: "model-1",
        calls: 1,
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0,
        cost_minor_units: 0,
      },
      {
        provider: "provider-1",
        model: "model-1",
        calls: 1,
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0,
        cost_minor_units: 0,
      },
    ],
  },
});
rejects(ExecutionContextWireV1Schema, {
  ...wireContext,
  budget_ledger: {
    ...wireContext.budget_ledger,
    model_consumption: [
      {
        provider: "undeclared-provider",
        model: "model-1",
        calls: 1,
        input_tokens: 1,
        output_tokens: 1,
        total_tokens: 2,
        cost_minor_units: 1,
      },
    ],
  },
});

accepts(ModelCapabilitiesV1Schema, {
  native_tool_calls: true,
  streaming: true,
  cancellation: "COOPERATIVE",
  structured_output: "JSON_SCHEMA",
  usage: {
    input_tokens: true,
    output_tokens: true,
    total_tokens: true,
    cost: false,
  },
});
const modelRequest = {
  ...operationIdentity,
  target: { provider: "provider-1", model: "model-1", fallback_index: 0 },
  messages: [{ role: "USER", content: "Search the web", tool_call_id: null }],
  tool_mode: "EXTERNAL_STRUCTURED",
  tools: [
    {
      name: "search.web",
      description: "Search approved public web sources.",
      input_schema: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
        additionalProperties: false,
      },
    },
  ],
  response_format: { kind: "TEXT" },
};
accepts(ModelGenerateRequestV1Schema, modelRequest);
const oversizedModelRequest = {
  ...modelRequest,
  messages: [
    { role: "USER", content: "x".repeat(700_000), tool_call_id: null },
    { role: "USER", content: "y".repeat(700_000), tool_call_id: null },
  ],
};
rejects(ModelGenerateRequestV1Schema, oversizedModelRequest);
rejects(ModelGenerateRequestV1Schema, {
  ...modelRequest,
  tool_mode: "NONE",
});

accepts(ToolCapabilitiesV1Schema, {
  side_effect_class: "READ_ONLY",
  approval: "NEVER",
  cancellation: "COOPERATIVE",
  reconciliation: false,
  idempotency: "SUPPORTED",
});
accepts(ToolCapabilitiesV1Schema, {
  side_effect_class: "REVERSIBLE_EXTERNAL_WRITE",
  approval: "POLICY",
  cancellation: "COOPERATIVE",
  reconciliation: true,
  idempotency: "REQUIRED",
});
rejects(ToolCapabilitiesV1Schema, {
  side_effect_class: "REVERSIBLE_EXTERNAL_WRITE",
  approval: "POLICY",
  cancellation: "COOPERATIVE",
  reconciliation: false,
  idempotency: "REQUIRED",
});
rejects(ToolCapabilitiesV1Schema, {
  side_effect_class: "REVERSIBLE_EXTERNAL_WRITE",
  approval: "POLICY",
  cancellation: "COOPERATIVE",
  reconciliation: true,
  idempotency: "SUPPORTED",
});
rejects(ToolCapabilitiesV1Schema, {
  side_effect_class: "DESTRUCTIVE",
  approval: "NEVER",
  cancellation: "FORCED",
  reconciliation: true,
  idempotency: "REQUIRED",
});

const nativeToolEvent = {
  ...operationIdentity,
  type: "TOOL_REQUEST",
  sequence: 4,
  call_id: "call-1",
  source: "NATIVE",
  tool_name: "calendar.create_event",
  arguments: { title: "Planning meeting", attendees: ["one@example.test"] },
};
accepts(ModelEventV1Schema, nativeToolEvent);
accepts(ModelEventV1Schema, {
  ...operationIdentity,
  type: "TEXT_DELTA",
  sequence: 5,
  text: "   ",
});
accepts(
  ModelEventV1Schema,
  {
    ...operationIdentity,
    type: "FAILED",
    sequence: 6,
    code: "provider_error",
    message: "  upstream failed  ",
    retryable: false,
  },
  (value) => assert.equal(value.message, "upstream failed"),
);
accepts(ModelEventV1Schema, {
  ...operationIdentity,
  type: "USAGE",
  sequence: 5,
  usage: {
    input_tokens: 100,
    output_tokens: 25,
    total_tokens: 125,
    cost: { currency: "GBP", minor_units: 2 },
  },
});
rejects(ModelEventV1Schema, {
  ...operationIdentity,
  type: "USAGE",
  sequence: 6,
  usage: {
    input_tokens: 100,
    output_tokens: 25,
    total_tokens: 124,
    cost: null,
  },
});
rejects(ModelEventV1Schema, { ...nativeToolEvent, source: "INVENTED_SOURCE" });

const externalToolRequest = {
  protocol: "aillium.external-tool-request",
  contract_version: "1.0",
  type: "TOOL_REQUEST",
  call_id: "external-call-1",
  tool_name: "search.web",
  arguments: { query: "AilliumOS" },
};
accepts(ExternalStructuredToolRequestV1Schema, externalToolRequest);
rejects(ExternalStructuredToolRequestV1Schema, {
  ...externalToolRequest,
  commentary: "please trust me",
});
rejects(ExternalStructuredToolRequestV1Schema, {
  ...externalToolRequest,
  tool_name: "../../shell",
});
rejects(ExternalStructuredToolRequestV1Schema, {
  ...externalToolRequest,
  arguments: { value: "x".repeat(70_000) },
});
rejects(ExternalStructuredToolRequestV1Schema, {
  ...externalToolRequest,
  arguments: { value: "x".repeat(65_430) },
});
let nested = "leaf";
for (let index = 0; index < 14; index += 1) nested = { nested };
rejects(ExternalStructuredToolRequestV1Schema, {
  ...externalToolRequest,
  arguments: nested,
});
rejects(ToolExecuteRequestV1Schema, {
  ...operationIdentity,
  tool_name: "search.web",
  input: { value: "x".repeat(1_100_000) },
  approval_id: null,
  deadline_at: budget.deadline_at,
});
let deepRuntimeInput = "leaf";
for (let index = 0; index < 34; index += 1) deepRuntimeInput = { nested: deepRuntimeInput };
rejects(ToolExecuteRequestV1Schema, {
  ...operationIdentity,
  tool_name: "search.web",
  input: deepRuntimeInput,
  approval_id: null,
  deadline_at: budget.deadline_at,
});

const executeRequest = {
  ...operationIdentity,
  tool_name: "calendar.create_event",
  input: { title: "Planning meeting" },
  approval_id: "approval-1",
  deadline_at: wireContext.budget.deadline_at,
};
accepts(ToolExecuteRequestV1Schema, executeRequest);
const successfulToolResult = {
  ...operationIdentity,
  status: "SUCCEEDED",
  output: { event_id: "event-1" },
  error: null,
  side_effect: { state: "APPLIED", external_reference: "event-1" },
  reconciliation_required: false,
  evidence_ids: ["evidence-1"],
  replayed: false,
  started_at: at,
  completed_at: "2026-08-03T12:00:01.000Z",
};
accepts(ToolExecuteResultV1Schema, successfulToolResult);
rejects(ToolExecuteResultV1Schema, {
  ...successfulToolResult,
  status: "FAILED",
  error: null,
  side_effect: { state: "UNKNOWN", external_reference: null },
  reconciliation_required: true,
});
rejects(ToolExecuteResultV1Schema, {
  ...successfulToolResult,
  started_at: "2026-08-03T12:00:02.000Z",
  completed_at: at,
});
rejects(ToolExecuteResultV1Schema, {
  ...successfulToolResult,
  status: "UNKNOWN",
  output: null,
  side_effect: { state: "UNKNOWN", external_reference: null },
  reconciliation_required: false,
});
accepts(ToolExecuteResultV1Schema, {
  ...successfulToolResult,
  status: "UNKNOWN",
  output: null,
  side_effect: { state: "UNKNOWN", external_reference: null },
  reconciliation_required: true,
});

const cancelRequest = {
  ...operationIdentity,
  cancellation_id: "cancel-1",
  reason: "User pressed stop",
  requested_at: at,
  acknowledge_by: "2026-08-03T12:00:02.000Z",
  force_by: "2026-08-03T12:00:05.000Z",
};
accepts(ToolCancelRequestV1Schema, cancelRequest);
rejects(ToolCancelRequestV1Schema, {
  ...cancelRequest,
  acknowledge_by: "2026-08-03T12:00:02.001Z",
});
rejects(ToolCancelRequestV1Schema, {
  ...cancelRequest,
  force_by: "2026-08-03T12:00:05.001Z",
});
rejects(ToolCancelRequestV1Schema, {
  ...cancelRequest,
  requested_at: "2026-08-03T12:00:03.000Z",
});

const cancellation = {
  cancellation_id: "cancel-1",
  state: "ACKNOWLEDGED",
  requested_at: at,
  acknowledge_by: "2026-08-03T12:00:02.000Z",
  force_by: "2026-08-03T12:00:05.000Z",
  acknowledged_at: "2026-08-03T12:00:01.000Z",
  acknowledgement_latency_ms: 1_000,
  forced_stop: {
    required: false,
    deadline_at: "2026-08-03T12:00:05.000Z",
    enforced_at: null,
    mechanism: null,
    outcome: "NOT_REQUIRED",
  },
};
accepts(CancellationMetadataV1Schema, cancellation);
accepts(ToolCancelResultV1Schema, { ...operationIdentity, cancellation });
accepts(CancellationMetadataV1Schema, {
  ...cancellation,
  forced_stop: {
    required: true,
    deadline_at: cancellation.force_by,
    enforced_at: "2026-08-03T12:00:04.500Z",
    mechanism: "process_tree_kill",
    outcome: "SUCCEEDED",
  },
});
rejects(CancellationMetadataV1Schema, {
  ...cancellation,
  acknowledgement_latency_ms: 999,
});
rejects(CancellationMetadataV1Schema, {
  ...cancellation,
  acknowledged_at: "2026-08-03T12:00:02.001Z",
  acknowledgement_latency_ms: 2_001,
});
rejects(CancellationMetadataV1Schema, {
  ...cancellation,
  forced_stop: { ...cancellation.forced_stop, deadline_at: "2026-08-03T12:00:04.000Z" },
});
rejects(CancellationMetadataV1Schema, {
  ...cancellation,
  forced_stop: {
    required: true,
    deadline_at: cancellation.force_by,
    enforced_at: "2026-08-03T12:00:05.001Z",
    mechanism: "process_tree_kill",
    outcome: "SUCCEEDED",
  },
});
rejects(CancellationMetadataV1Schema, {
  ...cancellation,
  state: "UNSUPPORTED",
});
rejects(CancellationMetadataV1Schema, {
  ...cancellation,
  forced_stop: {
    required: false,
    deadline_at: cancellation.force_by,
    enforced_at: "2026-08-03T12:00:04.000Z",
    mechanism: "unexpected",
    outcome: "NOT_REQUIRED",
  },
});

accepts(ToolReconcileRequestV1Schema, {
  ...operationIdentity,
  reason: "PROCESS_RECOVERY",
  requested_at: at,
});
accepts(ToolReconcileResultV1Schema, {
  ...operationIdentity,
  state: "APPLIED",
  output: { event_id: "event-1" },
  external_reference: "event-1",
  requested_at: at,
  reconciled_at: "2026-08-03T12:00:01.000Z",
  safe_to_replay: false,
});
accepts(ToolReconcileResultV1Schema, {
  ...operationIdentity,
  state: "NOT_APPLIED",
  output: null,
  external_reference: null,
  requested_at: at,
  reconciled_at: "2026-08-03T12:00:01.000Z",
  safe_to_replay: true,
});
accepts(ToolReconcileResultV1Schema, {
  ...operationIdentity,
  state: "UNKNOWN",
  output: null,
  external_reference: null,
  requested_at: at,
  reconciled_at: "2026-08-03T12:00:01.000Z",
  safe_to_replay: false,
});
rejects(ToolReconcileResultV1Schema, {
  ...operationIdentity,
  state: "UNKNOWN",
  output: null,
  external_reference: null,
  requested_at: at,
  reconciled_at: "2026-08-03T12:00:01.000Z",
  safe_to_replay: true,
});
rejects(ToolReconcileResultV1Schema, {
  ...operationIdentity,
  state: "APPLIED",
  output: { event_id: "event-1" },
  external_reference: "event-1",
  requested_at: "2026-08-03T12:00:02.000Z",
  reconciled_at: at,
  safe_to_replay: false,
});

const beforeCheckpoint = {
  contract_version: "1.0",
  checkpoint_id: "checkpoint-5",
  cursor: "5",
  tenant_id: wireContext.tenant_id,
  work_order_id: wireContext.work_order_id,
  run_id: wireContext.run_id,
  run_step_id: wireContext.run_step_id,
  attempt: wireContext.attempt,
  idempotency_key: wireContext.idempotency_key,
  fence_token: wireContext.fence_token,
  executor_id: wireContext.executor_id,
  lease_id: wireContext.lease_id,
  lease_epoch: wireContext.lease_epoch,
  boundary: "TOOL",
  phase: "BEFORE",
  operation_id: operationIdentity.operation_id,
  state: "READY",
  side_effect_state: "NOT_APPLIED",
  reconciliation_required: false,
  snapshot: { input_digest: "sha256:abc" },
  created_at: at,
};
accepts(RuntimeCheckpointV1Schema, beforeCheckpoint);
accepts(RuntimeCheckpointV1Schema, {
  ...beforeCheckpoint,
  checkpoint_id: "checkpoint-6",
  cursor: "6",
  phase: "AFTER",
  state: "SUCCEEDED",
  side_effect_state: "APPLIED",
});
accepts(RuntimeCheckpointV1Schema, {
  ...beforeCheckpoint,
  checkpoint_id: "checkpoint-6",
  cursor: "6",
  phase: "AFTER",
  state: "UNKNOWN",
  side_effect_state: "UNKNOWN",
  reconciliation_required: true,
});
rejects(RuntimeCheckpointV1Schema, { ...beforeCheckpoint, phase: "AFTER", state: "READY" });
rejects(RuntimeCheckpointV1Schema, {
  ...beforeCheckpoint,
  boundary: "MODEL",
  side_effect_state: "APPLIED",
});
rejects(RuntimeCheckpointV1Schema, {
  ...beforeCheckpoint,
  phase: "AFTER",
  state: "UNKNOWN",
  side_effect_state: "UNKNOWN",
  reconciliation_required: false,
});
rejects(RuntimeCheckpointV1Schema, {
  ...beforeCheckpoint,
  phase: "AFTER",
  state: "FAILED",
  side_effect_state: "UNKNOWN",
  reconciliation_required: true,
});

const leaseScope = {
  tenant_id: wireContext.tenant_id,
  work_order_id: wireContext.work_order_id,
  run_id: wireContext.run_id,
  run_step_id: wireContext.run_step_id,
  attempt: wireContext.attempt,
  executor_id: wireContext.executor_id,
  idempotency_key: wireContext.idempotency_key,
};
const acquireRequest = {
  lease_request_id: "lease-request-1",
  scope: leaseScope,
  requested_at: at,
  requested_duration_ms: 60_000,
};
accepts(ExecutorLeaseAcquireRequestV1Schema, acquireRequest);
accepts(ExecutorLeaseAcquireResultV1Schema, {
  lease_request_id: "lease-request-1",
  status: "ACQUIRED",
  lease_id: "lease-1",
  lease_epoch: 3,
  fence_token: "42",
  lease_expires_at: "2026-08-03T12:01:00.000Z",
  requested_at: at,
  decided_at: at,
  rejection_reason: null,
});
rejects(ExecutorLeaseAcquireResultV1Schema, {
  lease_request_id: "lease-request-1",
  status: "ACQUIRED",
  lease_id: null,
  lease_epoch: null,
  fence_token: null,
  lease_expires_at: null,
  requested_at: at,
  decided_at: at,
  rejection_reason: null,
});
rejects(ExecutorLeaseAcquireResultV1Schema, {
  lease_request_id: "lease-request-1",
  status: "ACQUIRED",
  lease_id: "lease-1",
  lease_epoch: 3,
  fence_token: "42",
  lease_expires_at: at,
  requested_at: at,
  decided_at: at,
  rejection_reason: null,
});
const renewRequest = {
  lease_request_id: "lease-request-2",
  scope: leaseScope,
  lease_id: "lease-1",
  lease_epoch: 3,
  fence_token: "42",
  lease_expires_at: "2026-08-03T12:01:00.000Z",
  requested_at: "2026-08-03T12:00:30.000Z",
  requested_duration_ms: 60_000,
  checkpoint_cursor: "5",
};
accepts(ExecutorLeaseRenewRequestV1Schema, renewRequest);
accepts(ExecutorLeaseRenewResultV1Schema, {
  lease_request_id: "lease-request-2",
  status: "RENEWED",
  lease_id: "lease-1",
  lease_epoch: 3,
  fence_token: "42",
  previous_expires_at: "2026-08-03T12:01:00.000Z",
  lease_expires_at: "2026-08-03T12:02:00.000Z",
  requested_at: "2026-08-03T12:00:30.000Z",
  decided_at: "2026-08-03T12:00:30.000Z",
  reason: null,
});
rejects(ExecutorLeaseRenewResultV1Schema, {
  lease_request_id: "lease-request-2",
  status: "RENEWED",
  lease_id: "lease-1",
  lease_epoch: 3,
  fence_token: "42",
  previous_expires_at: "2026-08-03T12:01:00.000Z",
  lease_expires_at: "2026-08-03T12:00:59.000Z",
  requested_at: "2026-08-03T12:00:30.000Z",
  decided_at: "2026-08-03T12:00:30.000Z",
  reason: null,
});
rejects(ExecutorLeaseRenewResultV1Schema, {
  lease_request_id: "lease-request-expired",
  status: "RENEWED",
  lease_id: "lease-1",
  lease_epoch: 3,
  fence_token: "42",
  previous_expires_at: "2026-08-03T12:01:00.000Z",
  lease_expires_at: "2026-08-03T12:02:00.000Z",
  requested_at: "2026-08-03T12:00:30.000Z",
  decided_at: "2026-08-03T12:01:00.001Z",
  reason: null,
});
const heartbeat = {
  scope: leaseScope,
  lease_id: "lease-1",
  lease_epoch: 3,
  fence_token: "42",
  lease_expires_at: "2026-08-03T12:01:00.000Z",
  emitted_at: "2026-08-03T12:00:30.000Z",
  last_activity_at: "2026-08-03T12:00:29.000Z",
  checkpoint_cursor: "5",
  health: "HEALTHY",
};
accepts(ExecutorHeartbeatV1Schema, heartbeat);
rejects(ExecutorHeartbeatV1Schema, {
  ...heartbeat,
  emitted_at: "2026-08-03T12:01:01.000Z",
});
accepts(ExecutorLeaseLossV1Schema, {
  scope: leaseScope,
  lease_id: "lease-1",
  lease_epoch: 3,
  fence_token: "42",
  lease_expires_at: "2026-08-03T12:01:00.000Z",
  detected_at: "2026-08-03T12:00:31.000Z",
  reason: "FENCED",
  replacement_fence_token: "43",
});
rejects(ExecutorLeaseLossV1Schema, {
  scope: leaseScope,
  lease_id: "lease-1",
  lease_epoch: 3,
  fence_token: "42",
  lease_expires_at: "2026-08-03T12:01:00.000Z",
  detected_at: "2026-08-03T12:00:31.000Z",
  reason: "FENCED",
  replacement_fence_token: null,
});
rejects(ExecutorLeaseLossV1Schema, {
  scope: leaseScope,
  lease_id: "lease-1",
  lease_epoch: 3,
  fence_token: "42",
  lease_expires_at: "2026-08-03T12:01:00.000Z",
  detected_at: "2026-08-03T12:00:31.000Z",
  reason: "FENCED",
  replacement_fence_token: "42",
});
accepts(ExecutorLeaseWireEnvelopeV1Schema, {
  contract_version: "1.0",
  envelope_id: "lease-envelope-1",
  message_type: "LEASE_ACQUIRE_REQUEST",
  emitted_at: at,
  payload: acquireRequest,
});
rejects(ExecutorLeaseWireEnvelopeV1Schema, {
  contract_version: "1.0",
  envelope_id: "lease-envelope-renew-late",
  message_type: "LEASE_RENEW_REQUEST",
  emitted_at: "2026-08-03T12:01:00.001Z",
  payload: renewRequest,
});
rejects(ExecutorLeaseWireEnvelopeV1Schema, {
  contract_version: "1.0",
  envelope_id: "lease-envelope-loss-future",
  message_type: "LEASE_LOSS",
  emitted_at: "2026-08-03T12:00:30.000Z",
  payload: {
    scope: leaseScope,
    lease_id: "lease-1",
    lease_epoch: 3,
    fence_token: "42",
    lease_expires_at: "2026-08-03T12:01:00.000Z",
    detected_at: "2026-08-03T12:00:31.000Z",
    reason: "FENCED",
    replacement_fence_token: "43",
  },
});

const wireEnvelope = {
  contract_version: "1.0",
  envelope_id: "envelope-1",
  message_type: "TOOL_EXECUTE_REQUEST",
  emitted_at: at,
  context: wireContext,
  payload: executeRequest,
};
const parsedEnvelope = accepts(RuntimeWireEnvelopeV1Schema, wireEnvelope);
check(!JSON.stringify(parsedEnvelope).includes("signal"));
rejects(RuntimeWireEnvelopeV1Schema, {
  ...wireEnvelope,
  envelope_id: "cancel-pending-after-force",
  message_type: "TOOL_CANCEL_RESULT",
  emitted_at: cancellation.force_by,
  payload: {
    ...operationIdentity,
    cancellation: {
      ...cancellation,
      forced_stop: {
        required: true,
        deadline_at: cancellation.force_by,
        enforced_at: null,
        mechanism: null,
        outcome: "PENDING",
      },
    },
  },
});
rejects(RuntimeWireEnvelopeV1Schema, {
  ...wireEnvelope,
  context: { ...wireContext, signal: controller.signal },
});
rejects(RuntimeWireEnvelopeV1Schema, { ...wireEnvelope, message_type: "MODEL_EVENT" });
rejects(RuntimeWireEnvelopeV1Schema, {
  ...wireEnvelope,
  payload: { ...executeRequest, idempotency_key: "wrong" },
});
rejects(RuntimeWireEnvelopeV1Schema, {
  ...wireEnvelope,
  payload: { ...executeRequest, fence_token: "43" },
});
rejects(RuntimeWireEnvelopeV1Schema, {
  ...wireEnvelope,
  payload: { ...executeRequest, tenant_id: "tenant-2" },
});
rejects(RuntimeWireEnvelopeV1Schema, {
  ...wireEnvelope,
  payload: { ...executeRequest, attempt: 2 },
});
rejects(RuntimeWireEnvelopeV1Schema, {
  ...wireEnvelope,
  payload: { ...executeRequest, deadline_at: "2026-08-03T12:05:00.001Z" },
});
rejects(RuntimeWireEnvelopeV1Schema, {
  ...wireEnvelope,
  emitted_at: "2026-08-03T12:10:00.001Z",
});
accepts(RuntimeWireEnvelopeV1Schema, {
  ...wireEnvelope,
  envelope_id: "model-envelope-1",
  message_type: "MODEL_GENERATE_REQUEST",
  payload: modelRequest,
});
rejects(RuntimeWireEnvelopeV1Schema, {
  ...wireEnvelope,
  envelope_id: "model-envelope-2",
  message_type: "MODEL_GENERATE_REQUEST",
  payload: {
    ...modelRequest,
    target: { provider: "provider-2", model: "model-2", fallback_index: 1 },
  },
});
rejects(RuntimeWireEnvelopeV1Schema, {
  ...wireEnvelope,
  envelope_id: "model-envelope-oversized",
  message_type: "MODEL_GENERATE_REQUEST",
  payload: oversizedModelRequest,
});
rejects(RuntimeWireEnvelopeV1Schema, {
  ...wireEnvelope,
  envelope_id: "model-envelope-3",
  message_type: "MODEL_GENERATE_REQUEST",
  payload: {
    ...modelRequest,
    target: { provider: "provider-1", model: "model-1", fallback_index: 1 },
  },
});
accepts(RuntimeWireEnvelopeV1Schema, {
  ...wireEnvelope,
  envelope_id: "checkpoint-envelope-1",
  message_type: "CHECKPOINT",
  payload: beforeCheckpoint,
});
rejects(RuntimeWireEnvelopeV1Schema, {
  ...wireEnvelope,
  envelope_id: "checkpoint-future-created-at",
  message_type: "CHECKPOINT",
  payload: { ...beforeCheckpoint, created_at: "2026-08-03T12:00:00.001Z" },
});
for (const mismatch of [
  { tenant_id: "tenant-2" },
  { attempt: 2 },
  { idempotency_key: "wrong" },
  { fence_token: "43" },
  { executor_id: "executor-2" },
  { lease_id: "lease-2" },
  { lease_epoch: 4 },
]) {
  rejects(RuntimeWireEnvelopeV1Schema, {
    ...wireEnvelope,
    envelope_id: `checkpoint-mismatch-${Object.keys(mismatch)[0]}`,
    message_type: "CHECKPOINT",
    payload: { ...beforeCheckpoint, ...mismatch },
  });
}
accepts(RuntimeWireEnvelopeV1Schema, {
  ...wireEnvelope,
  envelope_id: "model-event-envelope-1",
  message_type: "MODEL_EVENT",
  payload: nativeToolEvent,
});
rejects(RuntimeWireEnvelopeV1Schema, {
  ...wireEnvelope,
  envelope_id: "model-event-envelope-2",
  message_type: "MODEL_EVENT",
  payload: { ...nativeToolEvent, fence_token: "43" },
});

const validFixture = JSON.parse(
  readFileSync(
    new URL("../../../fixtures/runtime-v1/valid-tool-execute-envelope.json", import.meta.url),
    "utf8",
  ),
);
const invalidCamelFixture = JSON.parse(
  readFileSync(
    new URL("../../../fixtures/runtime-v1/invalid-camel-context.json", import.meta.url),
    "utf8",
  ),
);
accepts(RuntimeWireEnvelopeV1Schema, validFixture);
rejects(RuntimeWireEnvelopeV1Schema, invalidCamelFixture);
const canonicalJsonSchema = JSON.parse(
  readFileSync(
    new URL(
      "../../../schemas/runtime/provider-neutral-runtime-v1.schema.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const generatedExecutionContext =
  canonicalJsonSchema.oneOf[0].oneOf[0].properties.context;
check(
  JSON.stringify(
    [...generatedExecutionContext.required].sort(),
  ) === JSON.stringify(Object.keys(wireContext).sort()),
);
check(
  generatedExecutionContext.required.every(
    (field) => field === field.toLowerCase() && !/[A-Z]/.test(field),
  ),
);
const generatedIntegerSchemasMissingSafeMaximum = [];
const generatedSchemaStack = [["$", canonicalJsonSchema]];
while (generatedSchemaStack.length > 0) {
  const [path, value] = generatedSchemaStack.pop();
  if (value === null || typeof value !== "object") continue;
  if (value.type === "integer" && !Number.isSafeInteger(value.maximum)) {
    generatedIntegerSchemasMissingSafeMaximum.push(path);
  }
  for (const [key, child] of Object.entries(value)) {
    generatedSchemaStack.push([`${path}.${key}`, child]);
  }
}
check(generatedIntegerSchemasMissingSafeMaximum.length === 0);

console.log(
  `Runtime v1 contracts passed: ${positiveAssertions} positive assertions, ${negativeAssertions} negative assertions.`,
);
