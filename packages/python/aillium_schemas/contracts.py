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
