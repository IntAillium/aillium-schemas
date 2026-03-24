import { z } from "zod";

export const RoleValues = ["SUPER_ADMIN", "ADMIN", "USER"] as const;
export type Role = (typeof RoleValues)[number];
export const RoleSchema = z.enum(RoleValues);

export const PlanValues = ["STARTER", "GROWTH", "OPERATOR", "ENTERPRISE"] as const;
export type Plan = (typeof PlanValues)[number];
export const PlanSchema = z.enum(PlanValues);

// Aillium Core boundary contracts
export const TaskStateValues = [
  "PENDING",
  "NEEDS_APPROVAL",
  "RUNNING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
] as const;
export type TaskState = (typeof TaskStateValues)[number];
export const TaskStateSchema = z.enum(TaskStateValues);

export const RiskLevelValues = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type RiskLevel = (typeof RiskLevelValues)[number];
export const RiskLevelSchema = z.enum(RiskLevelValues);

export const BudgetCapsSchema = z.object({
  max_usd: z.number(),
  max_tokens: z.number().nullable(),
  enforcement: z.enum(["HARD", "SOFT"]),
});
export type BudgetCaps = z.infer<typeof BudgetCapsSchema>;

export const TaskCreateSchema = z.object({
  tenant_id: z.string(),
  device_id: z.string(),
  budget_caps: BudgetCapsSchema,
  allowed_tools: z.array(z.string()),
  risk_level: RiskLevelSchema,
  trace_id: z.string().optional(),
});
export type TaskCreate = z.infer<typeof TaskCreateSchema>;

export const TaskSchema = TaskCreateSchema.extend({
  task_id: z.string(),
  state: TaskStateSchema,
});
export type Task = z.infer<typeof TaskSchema>;

export const StepUpdateSchema = z.object({
  task_id: z.string(),
  trace_id: z.string().optional(),
  step_index: z.number().int().nonnegative(),
  description: z.string(),
  timestamp: z.string().datetime(),
  status: z.enum(["INFO", "WARNING", "ERROR"]),
});
export type StepUpdate = z.infer<typeof StepUpdateSchema>;

// OpenClaw runtime boundary contracts
export const RuntimeStatusSchema = z.enum(["succeeded", "failed", "cancelled", "timed_out"]);
export type RuntimeStatus = z.infer<typeof RuntimeStatusSchema>;

export const RuntimeDispatchSchema = z.object({
  contract_type: z.literal("openclaw.runtime.dispatch"),
  schema_version: z.literal("1.0.0"),
  task_id: z.string(),
  worker_id: z.string(),
  tenant_id: z.string(),
  trace_id: z.string(),
  created_at: z.string().datetime(),
  deadline_at: z.string().datetime().optional(),
  input: z.object({
    task_type: z.string(),
    payload: z.record(z.unknown()),
    context: z.record(z.unknown()).optional(),
  }),
});
export type RuntimeDispatch = z.infer<typeof RuntimeDispatchSchema>;

export const RuntimeResultSchema = z.object({
  contract_type: z.literal("openclaw.runtime.result"),
  schema_version: z.literal("1.0.0"),
  task_id: z.string(),
  worker_id: z.string(),
  tenant_id: z.string(),
  trace_id: z.string(),
  completed_at: z.string().datetime(),
  status: RuntimeStatusSchema,
  result: z.object({
    output: z.record(z.unknown()),
  }),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
      retryable: z.boolean().optional(),
    })
    .optional(),
});
export type RuntimeResult = z.infer<typeof RuntimeResultSchema>;

// MeshCentral remote-support boundary contracts
export const MeshSessionRequestSchema = z.object({
  tenant_id: z.string(),
  task_id: z.string(),
  trace_id: z.string(),
  device_id: z.string(),
  operator_id: z.string(),
  requested_at: z.string().datetime().optional(),
});
export type MeshSessionRequest = z.infer<typeof MeshSessionRequestSchema>;

export const MeshSessionStateSchema = z.object({
  tenant_id: z.string(),
  task_id: z.string(),
  trace_id: z.string(),
  device_id: z.string(),
  session_id: z.string(),
  status: z.enum(["requested", "establishing", "active", "ended", "failed"]),
  ended_at: z.string().datetime().optional(),
});
export type MeshSessionState = z.infer<typeof MeshSessionStateSchema>;

/** @deprecated Use RuntimeDispatchSchema instead. */
export const DeprecatedWorkerPollRequestSchema = z.object({
  worker_id: z.string(),
  tenant_id: z.string(),
  trace_id: z.string(),
  max_items: z.number().int().positive().optional(),
});
export type DeprecatedWorkerPollRequest = z.infer<typeof DeprecatedWorkerPollRequestSchema>;

/** @deprecated Use RuntimeResultSchema instead. */
export const DeprecatedWorkerPollResultSchema = z.object({
  task_id: z.string(),
  worker_id: z.string(),
  tenant_id: z.string(),
  trace_id: z.string(),
  status: RuntimeStatusSchema,
  output: z.record(z.unknown()).optional(),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
    })
    .optional(),
});
export type DeprecatedWorkerPollResult = z.infer<typeof DeprecatedWorkerPollResultSchema>;

export const EvidencePointerSchema = z.object({
  storage_provider: z.enum(["s3", "r2"]),
  bucket: z.string(),
  object_key: z.string(),
  mime_type: z.string(),
  sha256: z.string(),
});
export type EvidencePointer = z.infer<typeof EvidencePointerSchema>;

export const TokenUsageEventSchema = z.object({
  event_type: z.literal("token_usage"),
  tenant_id: z.string(),
  source: z.enum(["openclaw", "litellm"]),
  model: z.string(),
  input_tokens: z.number(),
  output_tokens: z.number(),
  timestamp: z.string().datetime(),
  idempotency_key: z.string(),
});
export type TokenUsageEvent = z.infer<typeof TokenUsageEventSchema>;

export const WorkflowExecutionEventSchema = z.object({
  event_type: z.literal("workflow_execution"),
  tenant_id: z.string(),
  workflow_name: z.string(),
  duration_ms: z.number(),
  timestamp: z.string().datetime(),
  idempotency_key: z.string(),
});
export type WorkflowExecutionEvent = z.infer<typeof WorkflowExecutionEventSchema>;

export const ActiveDeviceEventSchema = z.object({
  event_type: z.literal("active_device"),
  tenant_id: z.string(),
  device_id: z.string(),
  timestamp: z.string().datetime(),
  idempotency_key: z.string(),
});
export type ActiveDeviceEvent = z.infer<typeof ActiveDeviceEventSchema>;

export const OpenMeterEventSchema = z.discriminatedUnion("event_type", [
  TokenUsageEventSchema,
  WorkflowExecutionEventSchema,
  ActiveDeviceEventSchema,
]);
export type OpenMeterEvent = z.infer<typeof OpenMeterEventSchema>;
