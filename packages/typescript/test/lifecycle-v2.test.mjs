import assert from "node:assert/strict";
import {
  LifecycleContractVersion,
  RunCommandRequestV2Schema,
  RunEventV2Schema,
  WorkOrderV2Schema,
} from "../dist/index.js";

assert.equal(LifecycleContractVersion, "2.0");

assert.equal(
  WorkOrderV2Schema.parse({
    contractVersion: "2.0",
    id: "work-1",
    tenantId: "tenant-1",
    departmentId: null,
    conversationId: "conversation-1",
    sourceMessageId: "message-1",
    intent: "ACT",
    objective: "Send the report",
    status: "QUEUED",
    riskLevel: "LOW",
    createdByUserId: "user-1",
    createdAt: "2026-07-28T12:00:00.000Z",
    updatedAt: "2026-07-28T12:00:00.000Z",
    completedAt: null,
    compatibility: {
      legacyTaskId: "task-1",
      legacyCoordinatorRunId: null,
      legacyRuntimeSessionId: null,
    },
  }).contractVersion,
  "2.0",
);

assert.equal(
  RunEventV2Schema.parse({
    contractVersion: "2.0",
    cursor: "42",
    id: "event-42",
    runId: "run-1",
    workOrderId: "work-1",
    type: "TOOL_ACTIVITY",
    visibility: "USER",
    summary: "Searching approved sources.",
    payload: { tool: "browser" },
    occurredAt: "2026-07-28T12:00:00.000Z",
  }).cursor,
  "42",
);

assert.equal(
  RunCommandRequestV2Schema.parse({
    command: "CANCEL",
    idempotency_key: "cancel-1",
  }).command,
  "CANCEL",
);

assert.throws(() =>
  RunCommandRequestV2Schema.parse({
    command: "STOP_WITHOUT_ACK",
    idempotency_key: "invalid-1",
  }),
);

console.log("Lifecycle v2 contract examples passed.");
