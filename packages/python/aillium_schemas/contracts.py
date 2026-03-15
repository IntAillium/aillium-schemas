from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Annotated, Any, Literal, Union

from pydantic import BaseModel, ConfigDict, Field


class Role(str, Enum):
    SUPER_ADMIN = "SUPER_ADMIN"
    ADMIN = "ADMIN"
    CUSTOMER = "CUSTOMER"


class Plan(str, Enum):
    STARTER = "STARTER"
    GROWTH = "GROWTH"
    OPERATOR = "OPERATOR"
    ENTERPRISE = "ENTERPRISE"


class TaskState(str, Enum):
    PENDING = "PENDING"
    NEEDS_APPROVAL = "NEEDS_APPROVAL"
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


class RiskLevel(str, Enum):
    LOW = "LOW"
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


class Task(TaskCreate):
    model_config = ConfigDict(extra="forbid")

    task_id: str
    state: TaskState


class StepUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    task_id: str
    step_index: int
    description: str
    timestamp: datetime
    status: Literal["INFO", "WARNING", "ERROR"]


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


class ExecutorType(str, Enum):
    GENERIC = "generic"
    AGENT = "agent"
    TOOL = "tool"
    JOB = "job"


class ArtifactRef(BaseModel):
    model_config = ConfigDict(extra="forbid")

    uri: str
    contentType: str | None = None
    sha256: str | None = Field(default=None, pattern=r"^[a-fA-F0-9]{64}$")
    sizeBytes: int | None = Field(default=None, ge=0)


class ExecutorMessage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str
    message: str


class ExecutorError(ExecutorMessage):
    model_config = ConfigDict(extra="forbid")

    retryable: bool | None = None
    details: dict[str, Any] | None = None


class ExecutorPolicy(BaseModel):
    model_config = ConfigDict(extra="forbid")

    policyRef: str
    maxRuntimeMs: int | None = Field(default=None, gt=0)
    maxCostUnits: float | None = Field(default=None, ge=0)


class ExecutorInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    taskType: str
    payload: dict[str, Any]
    attachments: list[ArtifactRef] | None = None
    context: dict[str, Any] | None = None


class ExecutorRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    contractType: Literal["executor.request"]
    schemaVersion: Literal["1.0.0"]
    requestId: str
    traceId: str
    tenantId: str
    executorType: ExecutorType | None = None
    createdAt: datetime
    deadlineAt: datetime | None = None
    policy: ExecutorPolicy | None = None
    input: ExecutorInput
    meta: dict[str, Any] | None = None


class ExecutorTiming(BaseModel):
    model_config = ConfigDict(extra="forbid")

    queuedMs: int | None = Field(default=None, ge=0)
    runMs: int | None = Field(default=None, ge=0)
    totalMs: int | None = Field(default=None, ge=0)


class ExecutorCost(BaseModel):
    model_config = ConfigDict(extra="forbid")

    units: float | None = Field(default=None, ge=0)
    currency: str | None = None


class ExecutorResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    output: dict[str, Any]
    artifacts: list[ArtifactRef] | None = None
    warnings: list[ExecutorMessage] | None = None


class ExecutorStatus(str, Enum):
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    CANCELLED = "cancelled"
    TIMED_OUT = "timed_out"


class ExecutorResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    contractType: Literal["executor.response"]
    schemaVersion: Literal["1.0.0"]
    requestId: str
    responseId: str
    traceId: str
    executorType: ExecutorType | None = None
    completedAt: datetime
    status: ExecutorStatus
    timing: ExecutorTiming | None = None
    cost: ExecutorCost | None = None
    result: ExecutorResult
    error: ExecutorError | None = None
    meta: dict[str, Any] | None = None


class TaskClaimState(str, Enum):
    CLAIMED = "CLAIMED"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class WorkerPollRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    task_type: Literal["remote-handshake"]


class ClaimedTask(BaseModel):
    model_config = ConfigDict(extra="forbid")

    claim_id: str
    task_id: str
    state: TaskClaimState
    claimed_at: datetime
    lease_expires_at: datetime
    request: ExecutorRequest


class WorkerPollStatus(str, Enum):
    CLAIMED = "claimed"
    EMPTY = "empty"


class WorkerPollResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    poll_status: WorkerPollStatus
    next_poll_after_ms: int = Field(ge=0)
    task: ClaimedTask | None = None


class WorkerTaskResultRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    tenant_id: str
    claim_id: str
    response: ExecutorResponse
    mock_mode: bool = True


class WorkerTaskResultResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    task_id: str
    state: TaskState
    claim_state: TaskClaimState
    processed_at: datetime
