from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Annotated, Any, Literal, Union

from pydantic import BaseModel, ConfigDict, Field


class Role(str, Enum):
    SUPER_ADMIN = "SUPER_ADMIN"
    ADMIN = "ADMIN"
    USER = "USER"


class Plan(str, Enum):
    STARTER = "STARTER"
    GROWTH = "GROWTH"
    OPERATOR = "OPERATOR"
    ENTERPRISE = "ENTERPRISE"


# Aillium Core boundary contracts
class TaskState(str, Enum):
    PENDING = "PENDING"
    NEEDS_APPROVAL = "NEEDS_APPROVAL"
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


class RiskLevel(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class BudgetCaps(BaseModel):
    model_config = ConfigDict(extra="forbid")

    max_usd: float
    max_tokens: float | None
    enforcement: Literal["HARD", "SOFT"]


class TaskCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    tenant_id: str
    device_id: str
    budget_caps: BudgetCaps
    allowed_tools: list[str]
    risk_level: RiskLevel
    trace_id: str | None = None


class Task(TaskCreate):
    model_config = ConfigDict(extra="forbid")

    task_id: str
    state: TaskState


class StepUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    task_id: str
    trace_id: str | None = None
    step_index: int
    description: str
    timestamp: datetime
    status: Literal["INFO", "WARNING", "ERROR"]


# OpenClaw runtime boundary contracts
class RuntimeStatus(str, Enum):
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    CANCELLED = "cancelled"
    TIMED_OUT = "timed_out"


class RuntimeDispatchInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    task_type: str
    payload: dict[str, Any]
    context: dict[str, Any] | None = None


class RuntimeDispatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    contract_type: Literal["openclaw.runtime.dispatch"]
    schema_version: Literal["1.0.0"]
    task_id: str
    worker_id: str
    tenant_id: str
    trace_id: str
    created_at: datetime
    deadline_at: datetime | None = None
    input: RuntimeDispatchInput


class RuntimeError(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str
    message: str
    retryable: bool | None = None


class RuntimeResultBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    output: dict[str, Any]


class RuntimeResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    contract_type: Literal["openclaw.runtime.result"]
    schema_version: Literal["1.0.0"]
    task_id: str
    worker_id: str
    tenant_id: str
    trace_id: str
    completed_at: datetime
    status: RuntimeStatus
    result: RuntimeResultBody
    error: RuntimeError | None = None


# MeshCentral remote-support boundary contracts
class MeshSessionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    tenant_id: str
    task_id: str
    trace_id: str
    device_id: str
    operator_id: str
    requested_at: datetime | None = None


class MeshSessionState(BaseModel):
    model_config = ConfigDict(extra="forbid")

    tenant_id: str
    task_id: str
    trace_id: str
    device_id: str
    session_id: str
    status: Literal["requested", "establishing", "active", "ended", "failed"]
    ended_at: datetime | None = None


class DeprecatedWorkerPollRequest(BaseModel):
    """Deprecated: Use RuntimeDispatch."""

    model_config = ConfigDict(extra="forbid")

    worker_id: str
    tenant_id: str
    trace_id: str
    max_items: int | None = None


class DeprecatedWorkerPollResult(BaseModel):
    """Deprecated: Use RuntimeResult."""

    model_config = ConfigDict(extra="forbid")

    task_id: str
    worker_id: str
    tenant_id: str
    trace_id: str
    status: RuntimeStatus
    output: dict[str, Any] | None = None
    error: RuntimeError | None = None


class EvidencePointer(BaseModel):
    model_config = ConfigDict(extra="forbid")

    storage_provider: Literal["s3", "r2"]
    bucket: str
    object_key: str
    mime_type: str
    sha256: str


class TokenUsageEvent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    event_type: Literal["token_usage"]
    tenant_id: str
    source: Literal["openclaw", "litellm"]
    model: str
    input_tokens: float
    output_tokens: float
    timestamp: datetime
    idempotency_key: str


class WorkflowExecutionEvent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    event_type: Literal["workflow_execution"]
    tenant_id: str
    workflow_name: str
    duration_ms: float
    timestamp: datetime
    idempotency_key: str


class ActiveDeviceEvent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    event_type: Literal["active_device"]
    tenant_id: str
    device_id: str
    timestamp: datetime
    idempotency_key: str


OpenMeterEvent = Annotated[
    Union[TokenUsageEvent, WorkflowExecutionEvent, ActiveDeviceEvent],
    Field(discriminator="event_type"),
]


# ---------------------------------------------------------------------------
# Aillium 2.0 Autonomous Agent Contracts
# ---------------------------------------------------------------------------


class ToolCategory(str, Enum):
    BROWSER_AUTOMATION = "BROWSER_AUTOMATION"
    GUI_AUTOMATION = "GUI_AUTOMATION"
    SEARCH = "SEARCH"
    COMMUNICATION = "COMMUNICATION"
    FILE_OPERATION = "FILE_OPERATION"
    DATA_PROCESSING = "DATA_PROCESSING"
    PAYMENT = "PAYMENT"
    CALENDAR = "CALENDAR"
    CODE_EXECUTION = "CODE_EXECUTION"
    KNOWLEDGE = "KNOWLEDGE"
    CUSTOM = "CUSTOM"


class ApprovalLevel(str, Enum):
    NONE = "NONE"
    DEPARTMENT_MANAGER = "DEPARTMENT_MANAGER"
    OWNER = "OWNER"
    MULTI_PARTY = "MULTI_PARTY"


class PaymentMethod(str, Enum):
    STRIPE_CARD = "STRIPE_CARD"
    OPEN_BANKING = "OPEN_BANKING"
    DIRECT_DEBIT = "DIRECT_DEBIT"
    BANK_TRANSFER = "BANK_TRANSFER"


class PaymentStatus(str, Enum):
    PENDING = "PENDING"
    AWAITING_APPROVAL = "AWAITING_APPROVAL"
    PROCESSING = "PROCESSING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"
    REFUNDED = "REFUNDED"


class InvoiceStatus(str, Enum):
    DRAFT = "DRAFT"
    SENT = "SENT"
    PAID = "PAID"
    OVERDUE = "OVERDUE"
    CANCELLED = "CANCELLED"
    VOID = "VOID"


class SkillPatternType(str, Enum):
    RECURRING_WORKFLOW = "RECURRING_WORKFLOW"
    FAILED_TASK_RECOVERY = "FAILED_TASK_RECOVERY"
    MANUAL_WORKAROUND = "MANUAL_WORKAROUND"
    MULTI_STEP_OPTIMIZATION = "MULTI_STEP_OPTIMIZATION"


# Self-Skill-Creation contracts


class SkillCandidate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    contract_type: Literal["skill_candidate"]
    tenant_id: str
    department_id: str | None = None
    suggested_name: str
    suggested_description: str
    suggested_category: str | None = None
    source_task_ids: list[str]
    pattern_type: SkillPatternType | None = None
    confidence: float = Field(ge=0, le=1)
    estimated_time_saved_minutes: float | None = None
    task_count: int | None = None


class SkillValidationResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    contract_type: Literal["skill_validation_result"]
    draft_id: str
    valid: bool
    tests_run: int
    tests_passed: int
    issues: list[dict[str, Any]] | None = None


# Trajectory & Learning Loop contracts


class TrajectoryAction(BaseModel):
    model_config = ConfigDict(extra="forbid")

    tool_name: str
    parameters: dict[str, Any] | None = None
    result: dict[str, Any] | None = None
    duration_ms: float | None = None
    timestamp: datetime | None = None


class TrajectoryMetrics(BaseModel):
    model_config = ConfigDict(extra="forbid")

    duration_ms: float
    token_count: int | None = None
    cost_units: float | None = None
    success: bool
    retry_count: int | None = None
    cost_gbp: float | None = None


class TrajectoryRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")

    contract_type: Literal["trajectory_record"]
    tenant_id: str
    task_id: str
    agent_id: str | None = None
    department_id: str | None = None
    skill_id: str | None = None
    inputs: dict[str, Any]
    actions: list[TrajectoryAction]
    outputs: dict[str, Any]
    metrics: TrajectoryMetrics


class GradientUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    target_type: Literal["PROMPT", "TOOL_SELECTION", "APPROVAL_RULE"]
    target_id: str
    current_value: str
    suggested_value: str
    reason: str
    confidence: float = Field(ge=0, le=1)


class LearningEvaluationMetrics(BaseModel):
    model_config = ConfigDict(extra="forbid")

    total_trajectories: int
    success_rate: float = Field(ge=0, le=1)
    avg_duration_ms: float
    avg_cost_gbp: float | None = None
    retry_rate: float = Field(ge=0, le=1)


class LearningEvaluation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    contract_type: Literal["learning_evaluation"]
    tenant_id: str
    evaluation_id: str
    department_id: str | None = None
    period_start: datetime
    period_end: datetime
    metrics: LearningEvaluationMetrics
    underperforming_skills: list[dict[str, Any]] | None = None
    gradient_updates: list[GradientUpdate] | None = None


# Governance contracts


class GovernancePolicy(BaseModel):
    model_config = ConfigDict(extra="forbid")

    contract_type: Literal["governance_policy"]
    id: str | None = None
    tenant_id: str | None = None
    department_id: str | None = None
    name: str
    description: str | None = None
    action_pattern: str
    max_amount_gbp: float | None = None
    risk_threshold: RiskLevel
    requires_approval: bool
    approval_level: ApprovalLevel
    blocked_domains: list[str] | None = None
    allowed_tools: list[str] | None = None
    enabled: bool


class ActionEvaluationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    contract_type: Literal["action_evaluation_request"]
    tenant_id: str
    agent_id: str
    department_id: str | None = None
    action_type: str
    action_payload: dict[str, Any] | None = None
    risk_level: RiskLevel
    estimated_cost_gbp: float | None = None


class ActionEvaluationResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    contract_type: Literal["action_evaluation_result"]
    permitted: bool
    requires_approval: bool
    approval_level: ApprovalLevel
    reason: str
    matched_policies: list[str] | None = None
    conditions: list[str] | None = None


# Tool Library contracts


class ToolDefinition(BaseModel):
    model_config = ConfigDict(extra="forbid")

    contract_type: Literal["tool_definition"]
    name: str
    description: str
    category: ToolCategory
    risk_level: RiskLevel
    input_schema: dict[str, Any]
    output_schema: dict[str, Any] | None = None
    requires_approval: bool
    requires_capsule: bool
    enabled: bool


class ToolExecutionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    contract_type: Literal["tool_execution_request"]
    tenant_id: str
    agent_id: str
    tool_name: str
    parameters: dict[str, Any]
    capsule_id: str | None = None
    trace_id: str


class ToolExecutionResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    contract_type: Literal["tool_execution_result"]
    success: bool
    output: Any | None = None
    artifacts: list[dict[str, str]] | None = None
    duration_ms: float
    token_cost: int | None = None
    error: str | None = None


# UK/GBP Payment contracts


class InvoiceLineItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    description: str
    quantity: float
    unit_price_gbp: float
    vat_rate: float = 0.2


class PaymentIntent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    contract_type: Literal["payment_intent"]
    tenant_id: str
    agent_id: str
    department_id: str | None = None
    recipient_name: str
    recipient_email: str | None = None
    amount_gbp: float
    currency: Literal["GBP"]
    description: str
    reference: str | None = None
    payment_method: PaymentMethod
    include_vat: bool
    vat_rate: float = 0.2
    status: PaymentStatus | None = None
    metadata: dict[str, Any] | None = None


class Invoice(BaseModel):
    model_config = ConfigDict(extra="forbid")

    contract_type: Literal["invoice"]
    tenant_id: str
    agent_id: str
    customer_name: str
    customer_email: str
    line_items: list[InvoiceLineItem]
    due_date: str
    reference: str | None = None
    status: InvoiceStatus | None = None
    subtotal_gbp: float | None = None
    vat_gbp: float | None = None
    total_gbp: float | None = None


# Heartbeat contracts


class HeartbeatMetrics(BaseModel):
    model_config = ConfigDict(extra="forbid")

    jobs_pending: int | None = None
    jobs_claimed: int | None = None
    jobs_completed: int | None = None
    jobs_failed: int | None = None
    cycle_duration_ms: float | None = None
    urgent_notifications: int | None = None
    active_capsules: int | None = None
    memory_entries: int | None = None
    skills_count: int | None = None
    success_rate: float | None = None
    avg_task_duration_ms: float | None = None


class HeartbeatReport(BaseModel):
    model_config = ConfigDict(extra="forbid")

    contract_type: Literal["heartbeat_report"]
    tenant_id: str
    agent_id: str | None = None
    timestamp: datetime
    metrics: HeartbeatMetrics
