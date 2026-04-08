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
  task_id: z.string().min(1),
  worker_id: z.string().min(1),
  tenant_id: z.string().min(1),
  trace_id: z.string().min(1),
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
  task_id: z.string().min(1),
  worker_id: z.string().min(1),
  tenant_id: z.string().min(1),
  trace_id: z.string().min(1),
  completed_at: z.string().datetime(),
  status: RuntimeStatusSchema,
  result: z.object({
    output: z.record(z.unknown()),
    artifacts: z.array(z.object({
      uri: z.string(),
      content_type: z.string().optional(),
      sha256: z.string().optional(),
    })).optional(),
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

// OpenClaw session management contracts (protocol v3 extensions)
export const SessionCompactionReasonValues = [
  "manual",
  "auto-threshold",
  "overflow-retry",
  "timeout-retry",
] as const;
export type SessionCompactionReason = (typeof SessionCompactionReasonValues)[number];
export const SessionCompactionReasonSchema = z.enum(SessionCompactionReasonValues);

export const SessionCompactionCheckpointSchema = z.object({
  contract_type: z.literal("openclaw.session.compaction_checkpoint"),
  checkpoint_id: z.string(),
  session_key: z.string(),
  session_id: z.string(),
  created_at: z.number().int().min(0),
  reason: SessionCompactionReasonSchema,
  tokens_before: z.number().int().min(0).optional(),
  tokens_after: z.number().int().min(0).optional(),
  summary: z.string().optional(),
  first_kept_entry_id: z.string().min(1).optional(),
});
export type SessionCompactionCheckpoint = z.infer<typeof SessionCompactionCheckpointSchema>;

export const ExecHostValues = ["sandbox", "gateway", "node", "auto"] as const;
export type ExecHost = (typeof ExecHostValues)[number];
export const ExecHostSchema = z.enum(ExecHostValues);

export const RuntimeSessionPatchSchema = z.object({
  contract_type: z.literal("openclaw.session.patch"),
  key: z.string(),
  model: z.string().optional(),
  auth_profile_id: z.string().optional(),
  auth_profile_source: z.enum(["auto", "user"]).optional(),
  exec_host: ExecHostSchema.optional(),
});
export type RuntimeSessionPatch = z.infer<typeof RuntimeSessionPatchSchema>;

export const PluginApprovalRequestSchema = z.object({
  contract_type: z.literal("openclaw.plugin_approval.request"),
  plugin_id: z.string(),
  title: z.string(),
  description: z.string(),
  severity: z.string().optional(),
  tool_name: z.string().optional(),
  agent_id: z.string().optional(),
  session_key: z.string().optional(),
  timeout_ms: z.number().optional(),
});
export type PluginApprovalRequest = z.infer<typeof PluginApprovalRequestSchema>;

export const PluginApprovalDecisionValues = ["approved", "denied"] as const;
export type PluginApprovalDecision = (typeof PluginApprovalDecisionValues)[number];
export const PluginApprovalDecisionSchema = z.enum(PluginApprovalDecisionValues);

export const ToolsEffectiveEntrySchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional(),
  source: z.enum(["core", "plugin", "channel"]),
  plugin_id: z.string().optional(),
  channel_id: z.string().optional(),
});
export type ToolsEffectiveEntry = z.infer<typeof ToolsEffectiveEntrySchema>;

export const ToolsEffectiveGroupSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  source: z.string().min(1),
  tools: z.array(ToolsEffectiveEntrySchema),
});
export type ToolsEffectiveGroup = z.infer<typeof ToolsEffectiveGroupSchema>;

export const ToolsEffectiveResultSchema = z.object({
  agent_id: z.string().optional(),
  profile: z.string().optional(),
  groups: z.array(ToolsEffectiveGroupSchema),
});
export type ToolsEffectiveResult = z.infer<typeof ToolsEffectiveResultSchema>;

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

// ---------------------------------------------------------------------------
// Aillium 2.0 Autonomous Agent Contracts
// ---------------------------------------------------------------------------

// Enums
export const ToolCategoryValues = [
  "BROWSER_AUTOMATION",
  "GUI_AUTOMATION",
  "SEARCH",
  "COMMUNICATION",
  "FILE_OPERATION",
  "DATA_PROCESSING",
  "PAYMENT",
  "CALENDAR",
  "CODE_EXECUTION",
  "KNOWLEDGE",
  "CUSTOM",
] as const;
export type ToolCategory = (typeof ToolCategoryValues)[number];
export const ToolCategorySchema = z.enum(ToolCategoryValues);

export const ApprovalLevelValues = [
  "NONE",
  "DEPARTMENT_MANAGER",
  "OWNER",
  "MULTI_PARTY",
] as const;
export type ApprovalLevel = (typeof ApprovalLevelValues)[number];
export const ApprovalLevelSchema = z.enum(ApprovalLevelValues);

export const PaymentMethodValues = [
  "STRIPE_CARD",
  "OPEN_BANKING",
  "DIRECT_DEBIT",
  "BANK_TRANSFER",
] as const;
export type PaymentMethod = (typeof PaymentMethodValues)[number];
export const PaymentMethodSchema = z.enum(PaymentMethodValues);

export const PaymentStatusValues = [
  "PENDING",
  "AWAITING_APPROVAL",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
  "REFUNDED",
] as const;
export type PaymentStatus = (typeof PaymentStatusValues)[number];
export const PaymentStatusSchema = z.enum(PaymentStatusValues);

export const InvoiceStatusValues = [
  "DRAFT",
  "SENT",
  "PAID",
  "OVERDUE",
  "CANCELLED",
  "VOID",
] as const;
export type InvoiceStatus = (typeof InvoiceStatusValues)[number];
export const InvoiceStatusSchema = z.enum(InvoiceStatusValues);

export const SkillPatternTypeValues = [
  "RECURRING_WORKFLOW",
  "FAILED_TASK_RECOVERY",
  "MANUAL_WORKAROUND",
  "MULTI_STEP_OPTIMIZATION",
] as const;
export type SkillPatternType = (typeof SkillPatternTypeValues)[number];
export const SkillPatternTypeSchema = z.enum(SkillPatternTypeValues);

// Self-Skill-Creation contracts
export const SkillCandidateSchema = z.object({
  contract_type: z.literal("skill_candidate"),
  tenant_id: z.string().min(1),
  department_id: z.string().optional(),
  suggested_name: z.string().min(1),
  suggested_description: z.string().min(1),
  suggested_category: z.string().optional(),
  source_task_ids: z.array(z.string()).min(1),
  pattern_type: SkillPatternTypeSchema.optional(),
  confidence: z.number().min(0).max(1),
  estimated_time_saved_minutes: z.number().min(0).optional(),
  task_count: z.number().int().min(1).optional(),
});
export type SkillCandidate = z.infer<typeof SkillCandidateSchema>;

export const SkillDraftRequestSchema = z.object({
  contract_type: z.literal('skill_draft_request'),
  tenant_id: z.string().min(1),
  candidate: SkillCandidateSchema,
  base_prompt: z.string().optional(),
  allowed_tools: z.array(z.string()).optional(),
  approval_rules: z.object({
    require_approval: z.boolean().optional(),
    approval_level: ApprovalLevelSchema.optional(),
    max_auto_approve_gbp: z.number().optional(),
  }).optional(),
  risk_level: RiskLevelSchema.optional(),
  requested_by: z.string().nullable().optional(),
  priority: z.number().min(0).max(1).optional(),
});
export type SkillDraftRequest = z.infer<typeof SkillDraftRequestSchema>;

export const SkillValidationResultSchema = z.object({
  contract_type: z.literal("skill_validation_result"),
  draft_id: z.string().min(1),
  valid: z.boolean(),
  tests_run: z.number().int().min(0),
  tests_passed: z.number().int().min(0),
  issues: z
    .array(
      z.object({
        severity: RiskLevelSchema,
        description: z.string(),
      }),
    )
    .optional(),
});
export type SkillValidationResult = z.infer<typeof SkillValidationResultSchema>;

// Trajectory & Learning Loop contracts
export const TrajectoryActionSchema = z.object({
  tool_name: z.string(),
  parameters: z.record(z.unknown()).optional(),
  result: z.record(z.unknown()).optional(),
  duration_ms: z.number().optional(),
  timestamp: z.string().datetime().optional(),
});

export const TrajectoryMetricsSchema = z.object({
  duration_ms: z.number(),
  token_count: z.number().int().optional(),
  cost_units: z.number().optional(),
  success: z.boolean(),
  retry_count: z.number().int().min(0).optional(),
  cost_gbp: z.number().optional(),
});

export const TrajectoryRecordSchema = z.object({
  contract_type: z.literal("trajectory_record"),
  tenant_id: z.string().min(1),
  task_id: z.string().min(1),
  agent_id: z.string().optional(),
  department_id: z.string().optional(),
  skill_id: z.string().optional(),
  inputs: z.record(z.unknown()),
  actions: z.array(TrajectoryActionSchema),
  outputs: z.record(z.unknown()),
  metrics: TrajectoryMetricsSchema,
});
export type TrajectoryRecord = z.infer<typeof TrajectoryRecordSchema>;

export const GradientUpdateSchema = z.object({
  target_type: z.enum(["PROMPT", "TOOL_SELECTION", "APPROVAL_RULE"]),
  target_id: z.string(),
  current_value: z.string(),
  suggested_value: z.string(),
  reason: z.string(),
  confidence: z.number().min(0).max(1),
});
export type GradientUpdate = z.infer<typeof GradientUpdateSchema>;

export const LearningEvaluationSchema = z.object({
  contract_type: z.literal("learning_evaluation"),
  tenant_id: z.string().min(1),
  evaluation_id: z.string().min(1),
  department_id: z.string().optional(),
  period_start: z.string().datetime(),
  period_end: z.string().datetime(),
  metrics: z.object({
    total_trajectories: z.number().int(),
    success_rate: z.number().min(0).max(1),
    avg_duration_ms: z.number(),
    avg_cost_gbp: z.number().optional(),
    retry_rate: z.number().min(0).max(1),
  }),
  underperforming_skills: z
    .array(
      z.object({
        skill_id: z.string(),
        success_rate: z.number(),
        gradient_notes: z.string(),
        suggested_changes: z.string(),
      }),
    )
    .optional(),
  gradient_updates: z.array(GradientUpdateSchema).optional(),
});
export type LearningEvaluation = z.infer<typeof LearningEvaluationSchema>;

// Governance contracts
export const GovernancePolicySchema = z.object({
  contract_type: z.literal("governance_policy"),
  id: z.string().optional(),
  tenant_id: z.string().optional(),
  department_id: z.string().optional(),
  name: z.string().min(1),
  description: z.string().optional(),
  action_pattern: z.string().min(1),
  max_amount_gbp: z.number().min(0).optional(),
  risk_threshold: RiskLevelSchema,
  requires_approval: z.boolean(),
  approval_level: ApprovalLevelSchema,
  blocked_domains: z.array(z.string()).optional(),
  allowed_tools: z.array(z.string()).optional(),
  enabled: z.boolean(),
});
export type GovernancePolicy = z.infer<typeof GovernancePolicySchema>;

export const ActionEvaluationRequestSchema = z.object({
  contract_type: z.literal("action_evaluation_request"),
  tenant_id: z.string().min(1),
  agent_id: z.string().min(1),
  department_id: z.string().optional(),
  action_type: z.string().min(1),
  action_payload: z.record(z.unknown()).optional(),
  risk_level: RiskLevelSchema,
  estimated_cost_gbp: z.number().min(0).optional(),
});
export type ActionEvaluationRequest = z.infer<typeof ActionEvaluationRequestSchema>;

export const ActionEvaluationResultSchema = z.object({
  contract_type: z.literal("action_evaluation_result"),
  permitted: z.boolean(),
  requires_approval: z.boolean(),
  approval_level: ApprovalLevelSchema,
  reason: z.string(),
  matched_policies: z.array(z.string()).optional(),
  conditions: z.array(z.string()).optional(),
});
export type ActionEvaluationResult = z.infer<typeof ActionEvaluationResultSchema>;

// Tool Library contracts
export const ToolDefinitionSchema = z.object({
  contract_type: z.literal("tool_definition"),
  name: z.string().min(1),
  description: z.string().min(1),
  category: ToolCategorySchema,
  risk_level: RiskLevelSchema,
  input_schema: z.record(z.unknown()),
  output_schema: z.record(z.unknown()).optional(),
  requires_approval: z.boolean(),
  requires_capsule: z.boolean(),
  enabled: z.boolean(),
});
export type ToolDefinition = z.infer<typeof ToolDefinitionSchema>;

export const ToolExecutionRequestSchema = z.object({
  contract_type: z.literal("tool_execution_request"),
  tenant_id: z.string().min(1),
  agent_id: z.string().min(1),
  tool_name: z.string().min(1),
  parameters: z.record(z.unknown()),
  capsule_id: z.string().optional(),
  trace_id: z.string().min(1),
});
export type ToolExecutionRequest = z.infer<typeof ToolExecutionRequestSchema>;

export const ToolExecutionResultSchema = z.object({
  contract_type: z.literal("tool_execution_result"),
  success: z.boolean(),
  output: z.unknown().optional(),
  artifacts: z
    .array(
      z.object({
        uri: z.string(),
        content_type: z.string(),
      }),
    )
    .optional(),
  duration_ms: z.number().min(0),
  token_cost: z.number().int().min(0).optional(),
  error: z.string().optional(),
});
export type ToolExecutionResult = z.infer<typeof ToolExecutionResultSchema>;

// UK/GBP Payment contracts
export const PaymentIntentSchema = z.object({
  contract_type: z.literal("payment_intent"),
  tenant_id: z.string().min(1),
  agent_id: z.string().min(1),
  department_id: z.string().optional(),
  recipient_name: z.string().min(1),
  recipient_email: z.string().email().optional(),
  amount_gbp: z.number().positive(),
  currency: z.literal("GBP"),
  description: z.string().min(1),
  reference: z.string().optional(),
  payment_method: PaymentMethodSchema,
  include_vat: z.boolean(),
  vat_rate: z.number().min(0).max(1).default(0.2),
  status: PaymentStatusSchema.optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type PaymentIntent = z.infer<typeof PaymentIntentSchema>;

export const InvoiceLineItemSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().positive(),
  unit_price_gbp: z.number().min(0),
  vat_rate: z.number().min(0).max(1).default(0.2),
});

export const InvoiceSchema = z.object({
  contract_type: z.literal("invoice"),
  tenant_id: z.string().min(1),
  agent_id: z.string().min(1),
  customer_name: z.string().min(1),
  customer_email: z.string().email(),
  line_items: z.array(InvoiceLineItemSchema).min(1),
  due_date: z.string().date(),
  reference: z.string().optional(),
  status: InvoiceStatusSchema.optional(),
  subtotal_gbp: z.number().optional(),
  vat_gbp: z.number().optional(),
  total_gbp: z.number().optional(),
});
export type Invoice = z.infer<typeof InvoiceSchema>;

// Heartbeat contracts
export const HeartbeatReportSchema = z.object({
  contract_type: z.literal("heartbeat_report"),
  tenant_id: z.string().min(1),
  agent_id: z.string().optional(),
  timestamp: z.string().datetime(),
  metrics: z.object({
    jobs_pending: z.number().int().min(0).optional(),
    jobs_claimed: z.number().int().min(0).optional(),
    jobs_completed: z.number().int().min(0).optional(),
    jobs_failed: z.number().int().min(0).optional(),
    cycle_duration_ms: z.number().min(0).optional(),
    urgent_notifications: z.number().int().min(0).optional(),
    active_capsules: z.number().int().min(0).optional(),
    memory_entries: z.number().int().min(0).optional(),
    skills_count: z.number().int().min(0).optional(),
    success_rate: z.number().min(0).max(1).optional(),
    avg_task_duration_ms: z.number().min(0).optional(),
  }),
});
export type HeartbeatReport = z.infer<typeof HeartbeatReportSchema>;

// EOD Report contracts
export const EodReportSchema = z.object({
  contract_type: z.literal("eod_report"),
  tenant_id: z.string().min(1),
  report_date: z.string().datetime(),
  tasks_completed: z.number().int(),
  tasks_failed: z.number().int(),
  tasks_in_progress: z.number().int(),
  approvals_processed: z.number().int(),
  approvals_pending: z.number().int(),
  payments_processed_gbp: z.number(),
  invoices_created_gbp: z.number(),
  total_cost_gbp: z.number(),
  alerts_raised: z.number().int(),
  department_breakdown: z.record(z.unknown()).nullable(),
  key_decisions: z
    .array(z.record(z.unknown()))
    .nullable(),
  summary: z.string().nullable(),
});
export type EodReport = z.infer<typeof EodReportSchema>;

// OOO Session State contracts
export const EscalationPolicyValues = [
  "QUEUE_ALL",
  "DELEGATE_LOW_RISK",
  "DELEGATE_ALL",
  "EMERGENCY_ONLY",
] as const;
export type EscalationPolicy = (typeof EscalationPolicyValues)[number];
export const EscalationPolicySchema = z.enum(EscalationPolicyValues);

export const OooSessionStateSchema = z.object({
  contract_type: z.literal("ooo_session_state"),
  tenant_id: z.string().min(1),
  user_id: z.string().min(1),
  is_active: z.boolean(),
  escalation_policy: EscalationPolicySchema,
  delegate_agent_id: z.string().nullable(),
  auto_response_message: z.string().nullable(),
  expected_return_at: z.string().datetime().nullable(),
  total_queued: z.number().int(),
  total_auto_approved: z.number().int(),
  total_delegated: z.number().int(),
});
export type OooSessionState = z.infer<typeof OooSessionStateSchema>;

// CRM contracts
export const CrmContactSourceValues = [
  "MANUAL",
  "EMAIL",
  "FORM",
  "IMPORT",
  "AGENT_DISCOVERED",
] as const;
export type CrmContactSource = (typeof CrmContactSourceValues)[number];
export const CrmContactSourceSchema = z.enum(CrmContactSourceValues);

export const CrmContactSchema = z.object({
  contract_type: z.literal("crm_contact"),
  tenant_id: z.string().min(1),
  name: z.string().min(1),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  company: z.string().nullable(),
  role: z.string().nullable(),
  source: CrmContactSourceSchema,
  tags: z.array(z.string()).nullable(),
});
export type CrmContact = z.infer<typeof CrmContactSchema>;

export const CrmDealStageValues = [
  "LEAD",
  "QUALIFIED",
  "PROPOSAL",
  "NEGOTIATION",
  "WON",
  "LOST",
] as const;
export type CrmDealStage = (typeof CrmDealStageValues)[number];
export const CrmDealStageSchema = z.enum(CrmDealStageValues);

export const CrmDealSchema = z.object({
  contract_type: z.literal("crm_deal"),
  tenant_id: z.string().min(1),
  contact_id: z.string().min(1),
  title: z.string().min(1),
  value_gbp: z.number(),
  stage: CrmDealStageSchema,
  pipeline: z.string().min(1),
  expected_close_date: z.string().nullable(),
  assigned_agent_id: z.string().nullable(),
});
export type CrmDeal = z.infer<typeof CrmDealSchema>;

// Customer Support contracts
export const SupportChannelValues = [
  "EMAIL",
  "CHAT",
  "FORM",
  "PHONE",
  "SOCIAL",
] as const;
export type SupportChannel = (typeof SupportChannelValues)[number];
export const SupportChannelSchema = z.enum(SupportChannelValues);

export const SupportPriorityValues = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
export type SupportPriority = (typeof SupportPriorityValues)[number];
export const SupportPrioritySchema = z.enum(SupportPriorityValues);

export const SupportTicketStatusValues = [
  "OPEN",
  "IN_PROGRESS",
  "WAITING_CUSTOMER",
  "RESOLVED",
  "CLOSED",
] as const;
export type SupportTicketStatus = (typeof SupportTicketStatusValues)[number];
export const SupportTicketStatusSchema = z.enum(SupportTicketStatusValues);

export const SupportTicketSchema = z.object({
  contract_type: z.literal("support_ticket"),
  tenant_id: z.string().min(1),
  channel: SupportChannelSchema,
  customer_email: z.string().nullable(),
  customer_name: z.string().nullable(),
  subject: z.string().nullable(),
  body: z.string().min(1),
  priority: SupportPrioritySchema,
  status: SupportTicketStatusSchema,
});
export type SupportTicket = z.infer<typeof SupportTicketSchema>;

// Approval Queue contracts
export const ApprovalRequestStatusValues = [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "ESCALATED",
  "EXPIRED",
] as const;
export type ApprovalRequestStatus = (typeof ApprovalRequestStatusValues)[number];
export const ApprovalRequestStatusSchema = z.enum(ApprovalRequestStatusValues);

export const ApprovalRequestSchema = z.object({
  contract_type: z.literal("approval_request"),
  tenant_id: z.string().min(1),
  agent_id: z.string().min(1),
  department_id: z.string().nullable(),
  action_type: z.string().min(1),
  risk_level: RiskLevelSchema,
  estimated_cost_gbp: z.number().nullable(),
  reason: z.string().min(1),
  required_approval_level: ApprovalLevelSchema,
  status: ApprovalRequestStatusSchema,
});
export type ApprovalRequest = z.infer<typeof ApprovalRequestSchema>;

export const ApprovalDecisionValueValues = ["APPROVED", "REJECTED"] as const;
export type ApprovalDecisionValue = (typeof ApprovalDecisionValueValues)[number];
export const ApprovalDecisionValueSchema = z.enum(ApprovalDecisionValueValues);

export const ApprovalDecisionSchema = z.object({
  contract_type: z.literal("approval_decision"),
  approval_id: z.string().min(1),
  approver_id: z.string().min(1),
  decision: ApprovalDecisionValueSchema,
  comment: z.string().nullable(),
});
export type ApprovalDecision = z.infer<typeof ApprovalDecisionSchema>;

// ---------------------------------------------------------------------------
// Lark (Larksuite) Connection Contracts
// ---------------------------------------------------------------------------

export const LarkDomainValues = ["lark", "feishu", "custom"] as const;
export type LarkDomain = (typeof LarkDomainValues)[number];
export const LarkDomainSchema = z.enum(LarkDomainValues);

export const LarkConnectionModeValues = ["websocket", "webhook"] as const;
export type LarkConnectionMode = (typeof LarkConnectionModeValues)[number];
export const LarkConnectionModeSchema = z.enum(LarkConnectionModeValues);

export const LarkConnectionConfigSchema = z.object({
  contract_type: z.literal("lark_connection_config"),
  tenant_id: z.string().min(1),
  app_id: z.string().min(1),
  app_secret: z.string().min(1),
  domain: LarkDomainSchema.optional().default("lark"),
  custom_domain: z.string().url().optional(),
  connection_mode: LarkConnectionModeSchema.optional().default("websocket"),
  encrypt_key: z.string().optional(),
  verification_token: z.string().optional(),
  webhook_path: z.string().optional().default("/lark/events"),
  enabled: z.boolean().optional().default(true),
});
export type LarkConnectionConfig = z.infer<typeof LarkConnectionConfigSchema>;

export const LarkMsgTypeValues = [
  "text",
  "post",
  "image",
  "interactive",
  "share_chat",
  "share_user",
  "audio",
  "media",
  "file",
  "sticker",
] as const;
export type LarkMsgType = (typeof LarkMsgTypeValues)[number];
export const LarkMsgTypeSchema = z.enum(LarkMsgTypeValues);

export const LarkReceiveIdTypeValues = [
  "open_id",
  "user_id",
  "union_id",
  "email",
  "chat_id",
] as const;
export type LarkReceiveIdType = (typeof LarkReceiveIdTypeValues)[number];
export const LarkReceiveIdTypeSchema = z.enum(LarkReceiveIdTypeValues);

export const LarkSenderIdSchema = z.object({
  open_id: z.string().optional(),
  user_id: z.string().optional(),
  union_id: z.string().optional(),
});

export const LarkWebhookEventSenderSchema = z.object({
  sender_id: LarkSenderIdSchema.optional(),
  sender_type: z.string().optional(),
  tenant_key: z.string().optional(),
});

export const LarkWebhookEventMentionSchema = z.object({
  key: z.string().optional(),
  id: z.string().optional(),
  name: z.string().optional(),
});

export const LarkWebhookEventMessageSchema = z.object({
  message_id: z.string().optional(),
  chat_id: z.string().optional(),
  chat_type: z.enum(["p2p", "group"]).optional(),
  content: z.string().optional(),
  msg_type: z.string().optional(),
  mentions: z.array(LarkWebhookEventMentionSchema).optional(),
});

export const LarkWebhookEventSchema = z.object({
  contract_type: z.literal("lark_webhook_event"),
  tenant_id: z.string().min(1),
  trace_id: z.string().optional(),
  event_type: z.string().min(1),
  event_id: z.string().optional(),
  timestamp: z.string(),
  app_id: z.string().optional(),
  sender: LarkWebhookEventSenderSchema.optional(),
  message: LarkWebhookEventMessageSchema.optional(),
});
export type LarkWebhookEvent = z.infer<typeof LarkWebhookEventSchema>;

export const LarkSendMessageRequestSchema = z.object({
  contract_type: z.literal("lark_send_message_request"),
  tenant_id: z.string().min(1),
  trace_id: z.string().optional(),
  receive_id: z.string().min(1),
  receive_id_type: LarkReceiveIdTypeSchema.optional().default("chat_id"),
  msg_type: LarkMsgTypeSchema,
  content: z.string().min(1),
});
export type LarkSendMessageRequest = z.infer<typeof LarkSendMessageRequestSchema>;
