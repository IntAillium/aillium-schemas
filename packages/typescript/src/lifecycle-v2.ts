import { z } from "zod";

export const LifecycleContractVersion = "2.0" as const;
const ContractVersionSchema = z.literal(LifecycleContractVersion);

export const RequestIntentValues = ["ANSWER", "ACT"] as const;
export const RequestIntentSchema = z.enum(RequestIntentValues);
export type RequestIntent = z.infer<typeof RequestIntentSchema>;

export const WorkOrderStatusValues = [
  "DECLARED",
  "QUEUED",
  "ACTIVE",
  "WAITING_APPROVAL",
  "PAUSE_REQUESTED",
  "PAUSED",
  "TAKEOVER_REQUESTED",
  "CANCEL_REQUESTED",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
] as const;
export const WorkOrderStatusSchema = z.enum(WorkOrderStatusValues);

export const CanonicalRunStatusValues = [
  "CREATED",
  "QUEUED",
  "RUNNING",
  "WAITING_APPROVAL",
  "PAUSE_REQUESTED",
  "PAUSED",
  "TAKEOVER_REQUESTED",
  "CANCEL_REQUESTED",
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
] as const;
export const CanonicalRunStatusSchema = z.enum(CanonicalRunStatusValues);

export const CanonicalRunStepStatusValues = [
  "PENDING",
  "QUEUED",
  "RUNNING",
  "BLOCKED",
  "WAITING_APPROVAL",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
] as const;
export const CanonicalRunStepStatusSchema = z.enum(
  CanonicalRunStepStatusValues,
);

export const RunCommandValues = [
  "PAUSE",
  "RESUME",
  "STEER",
  "CANCEL",
  "TAKEOVER",
] as const;
export const RunCommandSchema = z.enum(RunCommandValues);

export const ConversationV2Schema = z.object({
  contractVersion: ContractVersionSchema,
  id: z.string(),
  tenantId: z.string(),
  departmentId: z.string().nullable(),
  title: z.string().nullable(),
  status: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ConversationV2 = z.infer<typeof ConversationV2Schema>;

export const WorkOrderV2Schema = z.object({
  contractVersion: ContractVersionSchema,
  id: z.string(),
  tenantId: z.string(),
  departmentId: z.string().nullable(),
  conversationId: z.string().nullable(),
  sourceMessageId: z.string().nullable(),
  intent: z.literal("ACT"),
  objective: z.string().min(1),
  status: WorkOrderStatusSchema,
  riskLevel: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  createdByUserId: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
  compatibility: z.object({
    legacyTaskId: z.string().nullable(),
    legacyCoordinatorRunId: z.string().nullable(),
    legacyRuntimeSessionId: z.string().nullable(),
  }),
});
export type WorkOrderV2 = z.infer<typeof WorkOrderV2Schema>;

export const RunV2Schema = z.object({
  contractVersion: ContractVersionSchema,
  id: z.string(),
  workOrderId: z.string(),
  tenantId: z.string(),
  departmentId: z.string().nullable(),
  sequence: z.number().int().positive(),
  status: CanonicalRunStatusSchema,
  executorType: z.string().nullable(),
  commandVersion: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  startedAt: z.string().datetime().nullable(),
  completedAt: z.string().datetime().nullable(),
});
export type RunV2 = z.infer<typeof RunV2Schema>;

export const RunStepV2Schema = z.object({
  contractVersion: ContractVersionSchema,
  id: z.string(),
  runId: z.string(),
  parentStepId: z.string().nullable(),
  position: z.number().int().positive(),
  label: z.string().min(1),
  objective: z.string().nullable(),
  executorType: z.string().nullable(),
  executorRef: z.string().nullable(),
  status: CanonicalRunStepStatusSchema,
});
export type RunStepV2 = z.infer<typeof RunStepV2Schema>;

export const RunEventV2Schema = z.object({
  contractVersion: ContractVersionSchema,
  cursor: z.string().regex(/^\d+$/),
  id: z.string(),
  runId: z.string(),
  workOrderId: z.string(),
  type: z.string().min(1),
  visibility: z.enum(["USER", "AUDIT"]),
  summary: z.string(),
  payload: z.unknown(),
  occurredAt: z.string().datetime(),
});
export type RunEventV2 = z.infer<typeof RunEventV2Schema>;

export const ArtifactV2Schema = z.object({
  contractVersion: ContractVersionSchema,
  id: z.string(),
  workOrderId: z.string(),
  runId: z.string().nullable(),
  kind: z.string(),
  title: z.string(),
  uri: z.string().nullable(),
  summary: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type ArtifactV2 = z.infer<typeof ArtifactV2Schema>;

export const EvidenceV2Schema = z.object({
  contractVersion: ContractVersionSchema,
  id: z.string(),
  workOrderId: z.string(),
  runId: z.string().nullable(),
  kind: z.string(),
  uri: z.string().nullable(),
  summary: z.string(),
  createdAt: z.string().datetime(),
});
export type EvidenceV2 = z.infer<typeof EvidenceV2Schema>;

export const ApprovalV2Schema = z.object({
  contractVersion: ContractVersionSchema,
  id: z.string(),
  workOrderId: z.string(),
  runId: z.string().nullable(),
  kind: z.string(),
  status: z.enum(["PENDING", "APPROVED", "REJECTED", "CANCELLED"]),
  createdAt: z.string().datetime(),
  resolvedAt: z.string().datetime().nullable(),
});
export type ApprovalV2 = z.infer<typeof ApprovalV2Schema>;

export const VerificationVerdictV2Schema = z.object({
  contractVersion: ContractVersionSchema,
  id: z.string(),
  workOrderId: z.string(),
  runId: z.string().nullable(),
  status: z.enum(["PENDING", "ACCEPTED", "REJECTED", "NEEDS_REVIEW"]),
  verifierType: z.string(),
  summary: z.string(),
  evidenceIds: z.array(z.string()),
  createdAt: z.string().datetime(),
});
export type VerificationVerdictV2 = z.infer<
  typeof VerificationVerdictV2Schema
>;

export const RunCommandRequestV2Schema = z.object({
  command: RunCommandSchema,
  idempotency_key: z.string().min(1).max(255),
  payload: z.record(z.unknown()).optional(),
});
export type RunCommandRequestV2 = z.infer<typeof RunCommandRequestV2Schema>;

export const RunEventPageV2Schema = z.object({
  items: z.array(RunEventV2Schema),
  nextCursor: z.string().regex(/^\d+$/).nullable(),
});
export type RunEventPageV2 = z.infer<typeof RunEventPageV2Schema>;
