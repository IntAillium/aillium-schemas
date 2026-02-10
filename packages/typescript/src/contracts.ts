import { z } from "zod";

export const RoleValues = ["SUPER_ADMIN", "ADMIN", "CUSTOMER"] as const;
export type Role = (typeof RoleValues)[number];
export const RoleSchema = z.enum(RoleValues);

export const PlanValues = ["STARTER", "GROWTH", "OPERATOR", "ENTERPRISE"] as const;
export type Plan = (typeof PlanValues)[number];
export const PlanSchema = z.enum(PlanValues);

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

export const RiskLevelValues = ["LOW", "HIGH", "CRITICAL"] as const;
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
});
export type TaskCreate = z.infer<typeof TaskCreateSchema>;

export const TaskSchema = TaskCreateSchema.extend({
  task_id: z.string(),
  state: TaskStateSchema,
});
export type Task = z.infer<typeof TaskSchema>;

export const StepUpdateSchema = z.object({
  task_id: z.string(),
  step_index: z.number().int().nonnegative(),
  description: z.string(),
  timestamp: z.string().datetime(),
  status: z.enum(["INFO", "WARNING", "ERROR"]),
});
export type StepUpdate = z.infer<typeof StepUpdateSchema>;

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
