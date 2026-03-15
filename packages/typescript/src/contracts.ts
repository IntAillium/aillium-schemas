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

export const ExecutorTypeSchema = z.enum(["generic", "agent", "tool", "job"]);
export type ExecutorType = z.infer<typeof ExecutorTypeSchema>;

export const ArtifactRefSchema = z.object({
  uri: z.string().min(1),
  contentType: z.string().optional(),
  sha256: z.string().regex(/^[a-fA-F0-9]{64}$/).optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
});
export type ArtifactRef = z.infer<typeof ArtifactRefSchema>;

export const ExecutorMessageSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
});
export type ExecutorMessage = z.infer<typeof ExecutorMessageSchema>;

export const ExecutorErrorSchema = ExecutorMessageSchema.extend({
  retryable: z.boolean().optional(),
  details: z.record(z.unknown()).optional(),
});
export type ExecutorError = z.infer<typeof ExecutorErrorSchema>;

export const ExecutorRequestSchema = z.object({
  contractType: z.literal("executor.request"),
  schemaVersion: z.literal("1.0.0"),
  requestId: z.string().min(1),
  traceId: z.string().min(1),
  tenantId: z.string().min(1),
  executorType: ExecutorTypeSchema.optional(),
  createdAt: z.string().datetime(),
  deadlineAt: z.string().datetime().optional(),
  policy: z
    .object({
      policyRef: z.string().min(1),
      maxRuntimeMs: z.number().int().positive().optional(),
      maxCostUnits: z.number().nonnegative().optional(),
    })
    .optional(),
  input: z.object({
    taskType: z.string().min(1),
    payload: z.record(z.unknown()),
    attachments: z.array(ArtifactRefSchema).optional(),
    context: z.record(z.unknown()).optional(),
  }),
  meta: z.record(z.unknown()).optional(),
});
export type ExecutorRequest = z.infer<typeof ExecutorRequestSchema>;

export const ExecutorResponseSchema = z
  .object({
    contractType: z.literal("executor.response"),
    schemaVersion: z.literal("1.0.0"),
    requestId: z.string().min(1),
    responseId: z.string().min(1),
    traceId: z.string().min(1),
    executorType: ExecutorTypeSchema.optional(),
    completedAt: z.string().datetime(),
    status: z.enum(["succeeded", "failed", "cancelled", "timed_out"]),
    timing: z
      .object({
        queuedMs: z.number().int().nonnegative().optional(),
        runMs: z.number().int().nonnegative().optional(),
        totalMs: z.number().int().nonnegative().optional(),
      })
      .optional(),
    cost: z
      .object({
        units: z.number().nonnegative().optional(),
        currency: z.string().min(1).optional(),
      })
      .optional(),
    result: z.object({
      output: z.record(z.unknown()),
      artifacts: z.array(ArtifactRefSchema).optional(),
      warnings: z.array(ExecutorMessageSchema).optional(),
    }),
    error: ExecutorErrorSchema.optional(),
    meta: z.record(z.unknown()).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.status === "succeeded" && val.error) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "error must be omitted for succeeded responses",
        path: ["error"],
      });
    }
    if (val.status !== "succeeded" && !val.error) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "error is required unless status is succeeded",
        path: ["error"],
      });
    }
  });
export type ExecutorResponse = z.infer<typeof ExecutorResponseSchema>;

export const TaskClaimStateSchema = z.enum(["CLAIMED", "COMPLETED", "FAILED"]);
export type TaskClaimState = z.infer<typeof TaskClaimStateSchema>;

export const WorkerPollRequestSchema = z.object({
  task_type: z.literal("remote-handshake"),
});
export type WorkerPollRequest = z.infer<typeof WorkerPollRequestSchema>;

export const ClaimedTaskSchema = z.object({
  claim_id: z.string(),
  task_id: z.string(),
  state: TaskClaimStateSchema,
  claimed_at: z.string().datetime(),
  lease_expires_at: z.string().datetime(),
  request: ExecutorRequestSchema,
});
export type ClaimedTask = z.infer<typeof ClaimedTaskSchema>;

export const WorkerPollResponseSchema = z.object({
  poll_status: z.enum(["claimed", "empty"]),
  next_poll_after_ms: z.number().int().nonnegative(),
  task: ClaimedTaskSchema.optional(),
});
export type WorkerPollResponse = z.infer<typeof WorkerPollResponseSchema>;

export const WorkerTaskResultRequestSchema = z.object({
  tenant_id: z.string(),
  claim_id: z.string(),
  response: ExecutorResponseSchema,
  mock_mode: z.boolean().default(true),
});
export type WorkerTaskResultRequest = z.infer<typeof WorkerTaskResultRequestSchema>;

export const WorkerTaskResultResponseSchema = z.object({
  task_id: z.string(),
  state: TaskStateSchema,
  claim_state: TaskClaimStateSchema,
  processed_at: z.string().datetime(),
});
export type WorkerTaskResultResponse = z.infer<typeof WorkerTaskResultResponseSchema>;
