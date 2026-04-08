import { z } from "zod";

// ---------------------------------------------------------------------------
// Remote Assist Cloud Contracts
// ---------------------------------------------------------------------------

// Enums

export const EndpointLifecycleStateValues = [
  "pending_enrollment",
  "enrolled",
  "active",
  "maintenance",
  "suspended",
  "quarantined",
  "retired",
  "archived",
  "deleted",
] as const;
export type EndpointLifecycleState = (typeof EndpointLifecycleStateValues)[number];
export const EndpointLifecycleStateSchema = z.enum(EndpointLifecycleStateValues);

export const EndpointHealthStatusValues = ["healthy", "degraded", "critical", "unknown"] as const;
export type EndpointHealthStatus = (typeof EndpointHealthStatusValues)[number];
export const EndpointHealthStatusSchema = z.enum(EndpointHealthStatusValues);

export const AssistanceRequestCategoryValues = [
  "device_is_slow",
  "cannot_sign_in",
  "vpn_or_network_issue",
  "app_not_working",
  "email_or_calendar_issue",
  "printer_or_peripheral_issue",
  "software_install_or_update",
  "security_concern",
  "something_else",
] as const;
export type AssistanceRequestCategory = (typeof AssistanceRequestCategoryValues)[number];
export const AssistanceRequestCategorySchema = z.enum(AssistanceRequestCategoryValues);

export const AssistanceRequestPriorityValues = ["low", "medium", "high", "urgent"] as const;
export type AssistanceRequestPriority = (typeof AssistanceRequestPriorityValues)[number];
export const AssistanceRequestPrioritySchema = z.enum(AssistanceRequestPriorityValues);

export const AssistanceRequestStatusValues = [
  "submitted",
  "triaged",
  "awaiting_approval",
  "scheduled",
  "in_progress",
  "resolved",
  "escalated",
  "rejected",
] as const;
export type AssistanceRequestStatus = (typeof AssistanceRequestStatusValues)[number];
export const AssistanceRequestStatusSchema = z.enum(AssistanceRequestStatusValues);

export const SupportModeValues = [
  "diagnostics_only",
  "live_help",
  "allow_unattended_fix",
  "approval_required_before_any_action",
] as const;
export type SupportMode = (typeof SupportModeValues)[number];
export const SupportModeSchema = z.enum(SupportModeValues);

export const SessionTypeValues = ["remote_desktop", "terminal", "diagnostics", "ai_assisted"] as const;
export type SessionType = (typeof SessionTypeValues)[number];
export const SessionTypeSchema = z.enum(SessionTypeValues);

export const SessionStatusValues = ["pending", "active", "paused", "ended", "failed"] as const;
export type SessionStatus = (typeof SessionStatusValues)[number];
export const SessionStatusSchema = z.enum(SessionStatusValues);

export const SessionApprovalStateValues = ["not_required", "pending", "approved", "denied"] as const;
export type SessionApprovalState = (typeof SessionApprovalStateValues)[number];
export const SessionApprovalStateSchema = z.enum(SessionApprovalStateValues);

export const ActionRiskLevelValues = ["read_only", "low_risk_write", "high_risk_write", "restricted"] as const;
export type ActionRiskLevel = (typeof ActionRiskLevelValues)[number];
export const ActionRiskLevelSchema = z.enum(ActionRiskLevelValues);

export const EvidenceTypeValues = [
  "screenshot",
  "log_capture",
  "command_output",
  "screen_recording_metadata",
  "config_snapshot",
] as const;
export type EvidenceType = (typeof EvidenceTypeValues)[number];
export const EvidenceTypeSchema = z.enum(EvidenceTypeValues);

export const ReportResultStatusValues = ["resolved", "partially_resolved", "unresolved", "escalated"] as const;
export type ReportResultStatus = (typeof ReportResultStatusValues)[number];
export const ReportResultStatusSchema = z.enum(ReportResultStatusValues);

export const AuditResultValues = ["success", "failure", "denied", "error"] as const;
export type AuditResult = (typeof AuditResultValues)[number];
export const AuditResultSchema = z.enum(AuditResultValues);

export const PolicyTypeValues = [
  "unattended_access",
  "command_allowlist",
  "command_blocklist",
  "file_transfer_rules",
  "ai_assist_permissions",
  "ui_automation_rules",
  "approval_requirements",
  "session_retention",
  "evidence_retention",
  "redaction_rules",
] as const;
export type PolicyType = (typeof PolicyTypeValues)[number];
export const PolicyTypeSchema = z.enum(PolicyTypeValues);

export const PolicyStatusValues = ["active", "draft", "disabled", "archived"] as const;
export type PolicyStatus = (typeof PolicyStatusValues)[number];
export const PolicyStatusSchema = z.enum(PolicyStatusValues);

// Entity schemas

export const RAEndpointSchema = z.object({
  contract_type: z.literal("remote_assist.endpoint"),
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  workspace_id: z.string().uuid().nullable().optional(),
  hostname: z.string().min(1),
  serial_number: z.string().nullable().optional(),
  manufacturer: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  os_name: z.string().nullable().optional(),
  os_version: z.string().nullable().optional(),
  agent_version: z.string().nullable().optional(),
  assigned_user_id: z.string().uuid().nullable().optional(),
  lifecycle_state: EndpointLifecycleStateSchema,
  health_status: EndpointHealthStatusSchema,
  last_seen_at: z.string().datetime().nullable().optional(),
  tags: z.array(z.string()).default([]),
  site: z.string().nullable().optional(),
  mesh_device_id: z.string().nullable().optional(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});
export type RAEndpoint = z.infer<typeof RAEndpointSchema>;

export const RAEndpointLifecycleEventSchema = z.object({
  contract_type: z.literal("remote_assist.endpoint_lifecycle_event"),
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  endpoint_id: z.string().uuid(),
  from_state: EndpointLifecycleStateSchema,
  to_state: EndpointLifecycleStateSchema,
  changed_by: z.string().min(1),
  reason: z.string().nullable().optional(),
  created_at: z.string().datetime(),
});
export type RAEndpointLifecycleEvent = z.infer<typeof RAEndpointLifecycleEventSchema>;

export const RAEndpointHealthSnapshotSchema = z.object({
  contract_type: z.literal("remote_assist.endpoint_health_snapshot"),
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  endpoint_id: z.string().uuid(),
  cpu_usage: z.number().nullable().optional(),
  memory_usage: z.number().nullable().optional(),
  disk_usage: z.number().nullable().optional(),
  network_status: z.string().nullable().optional(),
  agent_status: z.string().nullable().optional(),
  captured_at: z.string().datetime(),
});
export type RAEndpointHealthSnapshot = z.infer<typeof RAEndpointHealthSnapshotSchema>;

export const RAAssistanceRequestSchema = z.object({
  contract_type: z.literal("remote_assist.assistance_request"),
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  workspace_id: z.string().uuid().nullable().optional(),
  requester_user_id: z.string().uuid(),
  endpoint_id: z.string().uuid().nullable().optional(),
  category: AssistanceRequestCategorySchema,
  priority: AssistanceRequestPrioritySchema,
  description: z.string().min(1),
  support_mode: SupportModeSchema,
  consent_mode: z.string().nullable().optional(),
  status: AssistanceRequestStatusSchema,
  assigned_technician_id: z.string().uuid().nullable().optional(),
  submitted_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  resolved_at: z.string().datetime().nullable().optional(),
});
export type RAAssistanceRequest = z.infer<typeof RAAssistanceRequestSchema>;

export const RARequestAttachmentSchema = z.object({
  contract_type: z.literal("remote_assist.request_attachment"),
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  request_id: z.string().uuid(),
  file_name: z.string().min(1),
  file_type: z.string().min(1),
  storage_uri: z.string().min(1),
  created_at: z.string().datetime(),
});
export type RARequestAttachment = z.infer<typeof RARequestAttachmentSchema>;

export const RARequestConsentSchema = z.object({
  contract_type: z.literal("remote_assist.request_consent"),
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  request_id: z.string().uuid(),
  consent_type: z.string().min(1),
  granted: z.boolean(),
  granted_by: z.string().min(1),
  granted_at: z.string().datetime(),
});
export type RARequestConsent = z.infer<typeof RARequestConsentSchema>;

export const RASupportSessionSchema = z.object({
  contract_type: z.literal("remote_assist.support_session"),
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  endpoint_id: z.string().uuid(),
  request_id: z.string().uuid().nullable().optional(),
  session_type: SessionTypeSchema,
  technician_id: z.string().uuid(),
  status: SessionStatusSchema,
  approval_state: SessionApprovalStateSchema,
  started_at: z.string().datetime(),
  ended_at: z.string().datetime().nullable().optional(),
  duration_seconds: z.number().int().nullable().optional(),
});
export type RASupportSession = z.infer<typeof RASupportSessionSchema>;

export const RASessionActionSchema = z.object({
  contract_type: z.literal("remote_assist.session_action"),
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  session_id: z.string().uuid(),
  action_type: z.string().min(1),
  tool_used: z.string().nullable().optional(),
  actor_id: z.string().min(1),
  command_or_action_summary: z.string().nullable().optional(),
  risk_level: ActionRiskLevelSchema,
  approval_reference: z.string().nullable().optional(),
  result: z.string().nullable().optional(),
  created_at: z.string().datetime(),
});
export type RASessionAction = z.infer<typeof RASessionActionSchema>;

export const RASessionEvidenceSchema = z.object({
  contract_type: z.literal("remote_assist.session_evidence"),
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  session_id: z.string().uuid(),
  evidence_type: EvidenceTypeSchema,
  storage_uri: z.string().min(1),
  hash: z.string().nullable().optional(),
  created_at: z.string().datetime(),
});
export type RASessionEvidence = z.infer<typeof RASessionEvidenceSchema>;

export const RASessionReportSchema = z.object({
  contract_type: z.literal("remote_assist.session_report"),
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  session_id: z.string().uuid(),
  request_id: z.string().uuid().nullable().optional(),
  summary: z.string().min(1),
  actions_taken: z.unknown().optional(),
  validation_result: z.string().nullable().optional(),
  result_status: ReportResultStatusSchema,
  technician_notes: z.string().nullable().optional(),
  ai_summary: z.string().nullable().optional(),
  created_at: z.string().datetime(),
});
export type RASessionReport = z.infer<typeof RASessionReportSchema>;

export const RAAuditEventSchema = z.object({
  contract_type: z.literal("remote_assist.audit_event"),
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  actor_id: z.string().min(1),
  actor_role: z.string().min(1),
  target_type: z.string().min(1),
  target_id: z.string().nullable().optional(),
  event_type: z.string().min(1),
  event_summary: z.string().min(1),
  result: AuditResultSchema,
  risk_level: z.string().nullable().optional(),
  ip_address: z.string().nullable().optional(),
  metadata_json: z.unknown().optional(),
  created_at: z.string().datetime(),
});
export type RAAuditEvent = z.infer<typeof RAAuditEventSchema>;

export const RAPolicySchema = z.object({
  contract_type: z.literal("remote_assist.policy"),
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  name: z.string().min(1),
  policy_type: PolicyTypeSchema,
  policy_json: z.unknown(),
  status: PolicyStatusSchema,
  created_by: z.string().min(1),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});
export type RAPolicy = z.infer<typeof RAPolicySchema>;

export const RATenantEntitlementSchema = z.object({
  contract_type: z.literal("remote_assist.tenant_entitlement"),
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  feature_key: z.string().min(1),
  enabled: z.boolean(),
  limit_value: z.number().int().nullable().optional(),
  current_usage: z.number().int().default(0),
  billing_source: z.string().nullable().optional(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});
export type RATenantEntitlement = z.infer<typeof RATenantEntitlementSchema>;

export const RABillingUsageRecordSchema = z.object({
  contract_type: z.literal("remote_assist.billing_usage_record"),
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  feature_key: z.string().min(1),
  usage_unit: z.string().min(1),
  usage_value: z.number(),
  period_start: z.string().datetime(),
  period_end: z.string().datetime(),
  source_reference: z.string().nullable().optional(),
  created_at: z.string().datetime(),
});
export type RABillingUsageRecord = z.infer<typeof RABillingUsageRecordSchema>;
