from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


# ---------------------------------------------------------------------------
# Remote Assist Cloud Contracts
# ---------------------------------------------------------------------------


class EndpointLifecycleState(str, Enum):
    PENDING_ENROLLMENT = "pending_enrollment"
    ENROLLED = "enrolled"
    ACTIVE = "active"
    MAINTENANCE = "maintenance"
    SUSPENDED = "suspended"
    QUARANTINED = "quarantined"
    RETIRED = "retired"
    ARCHIVED = "archived"
    DELETED = "deleted"


class EndpointHealthStatus(str, Enum):
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    CRITICAL = "critical"
    UNKNOWN = "unknown"


class AssistanceRequestCategory(str, Enum):
    DEVICE_IS_SLOW = "device_is_slow"
    CANNOT_SIGN_IN = "cannot_sign_in"
    VPN_OR_NETWORK_ISSUE = "vpn_or_network_issue"
    APP_NOT_WORKING = "app_not_working"
    EMAIL_OR_CALENDAR_ISSUE = "email_or_calendar_issue"
    PRINTER_OR_PERIPHERAL_ISSUE = "printer_or_peripheral_issue"
    SOFTWARE_INSTALL_OR_UPDATE = "software_install_or_update"
    SECURITY_CONCERN = "security_concern"
    SOMETHING_ELSE = "something_else"


class AssistanceRequestPriority(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    URGENT = "urgent"


class AssistanceRequestStatus(str, Enum):
    SUBMITTED = "submitted"
    TRIAGED = "triaged"
    AWAITING_APPROVAL = "awaiting_approval"
    SCHEDULED = "scheduled"
    IN_PROGRESS = "in_progress"
    RESOLVED = "resolved"
    ESCALATED = "escalated"
    REJECTED = "rejected"


class SupportMode(str, Enum):
    DIAGNOSTICS_ONLY = "diagnostics_only"
    LIVE_HELP = "live_help"
    ALLOW_UNATTENDED_FIX = "allow_unattended_fix"
    APPROVAL_REQUIRED_BEFORE_ANY_ACTION = "approval_required_before_any_action"


class SessionType(str, Enum):
    REMOTE_DESKTOP = "remote_desktop"
    TERMINAL = "terminal"
    DIAGNOSTICS = "diagnostics"
    AI_ASSISTED = "ai_assisted"


class SessionStatus(str, Enum):
    PENDING = "pending"
    ACTIVE = "active"
    PAUSED = "paused"
    ENDED = "ended"
    FAILED = "failed"


class SessionApprovalState(str, Enum):
    NOT_REQUIRED = "not_required"
    PENDING = "pending"
    APPROVED = "approved"
    DENIED = "denied"


class ActionRiskLevel(str, Enum):
    READ_ONLY = "read_only"
    LOW_RISK_WRITE = "low_risk_write"
    HIGH_RISK_WRITE = "high_risk_write"
    RESTRICTED = "restricted"


class RAEvidenceType(str, Enum):
    SCREENSHOT = "screenshot"
    LOG_CAPTURE = "log_capture"
    COMMAND_OUTPUT = "command_output"
    SCREEN_RECORDING_METADATA = "screen_recording_metadata"
    CONFIG_SNAPSHOT = "config_snapshot"


class ReportResultStatus(str, Enum):
    RESOLVED = "resolved"
    PARTIALLY_RESOLVED = "partially_resolved"
    UNRESOLVED = "unresolved"
    ESCALATED = "escalated"


class AuditResult(str, Enum):
    SUCCESS = "success"
    FAILURE = "failure"
    DENIED = "denied"
    ERROR = "error"


class RAPolicyType(str, Enum):
    UNATTENDED_ACCESS = "unattended_access"
    COMMAND_ALLOWLIST = "command_allowlist"
    COMMAND_BLOCKLIST = "command_blocklist"
    FILE_TRANSFER_RULES = "file_transfer_rules"
    AI_ASSIST_PERMISSIONS = "ai_assist_permissions"
    UI_AUTOMATION_RULES = "ui_automation_rules"
    APPROVAL_REQUIREMENTS = "approval_requirements"
    SESSION_RETENTION = "session_retention"
    EVIDENCE_RETENTION = "evidence_retention"
    REDACTION_RULES = "redaction_rules"


class RAPolicyStatus(str, Enum):
    ACTIVE = "active"
    DRAFT = "draft"
    DISABLED = "disabled"
    ARCHIVED = "archived"


# Entity models


class RAEndpoint(BaseModel):
    model_config = ConfigDict(extra="forbid")

    contract_type: Literal["remote_assist.endpoint"]
    id: str
    tenant_id: str
    workspace_id: str | None = None
    hostname: str = Field(min_length=1)
    serial_number: str | None = None
    manufacturer: str | None = None
    model: str | None = None
    os_name: str | None = None
    os_version: str | None = None
    agent_version: str | None = None
    assigned_user_id: str | None = None
    lifecycle_state: EndpointLifecycleState
    health_status: EndpointHealthStatus
    last_seen_at: datetime | None = None
    tags: list[str] = Field(default_factory=list)
    site: str | None = None
    mesh_device_id: str | None = None
    created_at: datetime
    updated_at: datetime


class RAEndpointLifecycleEvent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    contract_type: Literal["remote_assist.endpoint_lifecycle_event"]
    id: str
    tenant_id: str
    endpoint_id: str
    from_state: EndpointLifecycleState
    to_state: EndpointLifecycleState
    changed_by: str = Field(min_length=1)
    reason: str | None = None
    created_at: datetime


class RAEndpointHealthSnapshot(BaseModel):
    model_config = ConfigDict(extra="forbid")

    contract_type: Literal["remote_assist.endpoint_health_snapshot"]
    id: str
    tenant_id: str
    endpoint_id: str
    cpu_usage: float | None = None
    memory_usage: float | None = None
    disk_usage: float | None = None
    network_status: str | None = None
    agent_status: str | None = None
    captured_at: datetime


class RAAssistanceRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    contract_type: Literal["remote_assist.assistance_request"]
    id: str
    tenant_id: str
    workspace_id: str | None = None
    requester_user_id: str
    endpoint_id: str | None = None
    category: AssistanceRequestCategory
    priority: AssistanceRequestPriority
    description: str = Field(min_length=1)
    support_mode: SupportMode
    consent_mode: str | None = None
    status: AssistanceRequestStatus
    assigned_technician_id: str | None = None
    submitted_at: datetime
    updated_at: datetime
    resolved_at: datetime | None = None


class RARequestAttachment(BaseModel):
    model_config = ConfigDict(extra="forbid")

    contract_type: Literal["remote_assist.request_attachment"]
    id: str
    tenant_id: str
    request_id: str
    file_name: str = Field(min_length=1)
    file_type: str = Field(min_length=1)
    storage_uri: str = Field(min_length=1)
    created_at: datetime


class RARequestConsent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    contract_type: Literal["remote_assist.request_consent"]
    id: str
    tenant_id: str
    request_id: str
    consent_type: str = Field(min_length=1)
    granted: bool
    granted_by: str = Field(min_length=1)
    granted_at: datetime


class RASupportSession(BaseModel):
    model_config = ConfigDict(extra="forbid")

    contract_type: Literal["remote_assist.support_session"]
    id: str
    tenant_id: str
    endpoint_id: str
    request_id: str | None = None
    session_type: SessionType
    technician_id: str
    status: SessionStatus
    approval_state: SessionApprovalState
    started_at: datetime
    ended_at: datetime | None = None
    duration_seconds: int | None = None


class RASessionAction(BaseModel):
    model_config = ConfigDict(extra="forbid")

    contract_type: Literal["remote_assist.session_action"]
    id: str
    tenant_id: str
    session_id: str
    action_type: str = Field(min_length=1)
    tool_used: str | None = None
    actor_id: str = Field(min_length=1)
    command_or_action_summary: str | None = None
    risk_level: ActionRiskLevel
    approval_reference: str | None = None
    result: str | None = None
    created_at: datetime


class RASessionEvidence(BaseModel):
    model_config = ConfigDict(extra="forbid")

    contract_type: Literal["remote_assist.session_evidence"]
    id: str
    tenant_id: str
    session_id: str
    evidence_type: RAEvidenceType
    storage_uri: str = Field(min_length=1)
    hash: str | None = None
    created_at: datetime


class RASessionReport(BaseModel):
    model_config = ConfigDict(extra="forbid")

    contract_type: Literal["remote_assist.session_report"]
    id: str
    tenant_id: str
    session_id: str
    request_id: str | None = None
    summary: str = Field(min_length=1)
    actions_taken: Any | None = None
    validation_result: str | None = None
    result_status: ReportResultStatus
    technician_notes: str | None = None
    ai_summary: str | None = None
    created_at: datetime


class RAAuditEvent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    contract_type: Literal["remote_assist.audit_event"]
    id: str
    tenant_id: str
    actor_id: str = Field(min_length=1)
    actor_role: str = Field(min_length=1)
    target_type: str = Field(min_length=1)
    target_id: str | None = None
    event_type: str = Field(min_length=1)
    event_summary: str = Field(min_length=1)
    result: AuditResult
    risk_level: str | None = None
    ip_address: str | None = None
    metadata_json: Any | None = None
    created_at: datetime


class RAPolicy(BaseModel):
    model_config = ConfigDict(extra="forbid")

    contract_type: Literal["remote_assist.policy"]
    id: str
    tenant_id: str
    name: str = Field(min_length=1)
    policy_type: RAPolicyType
    policy_json: Any
    status: RAPolicyStatus
    created_by: str = Field(min_length=1)
    created_at: datetime
    updated_at: datetime


class RATenantEntitlement(BaseModel):
    model_config = ConfigDict(extra="forbid")

    contract_type: Literal["remote_assist.tenant_entitlement"]
    id: str
    tenant_id: str
    feature_key: str = Field(min_length=1)
    enabled: bool
    limit_value: int | None = None
    current_usage: int = 0
    billing_source: str | None = None
    created_at: datetime
    updated_at: datetime


class RABillingUsageRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")

    contract_type: Literal["remote_assist.billing_usage_record"]
    id: str
    tenant_id: str
    feature_key: str = Field(min_length=1)
    usage_unit: str = Field(min_length=1)
    usage_value: float
    period_start: datetime
    period_end: datetime
    source_reference: str | None = None
    created_at: datetime
