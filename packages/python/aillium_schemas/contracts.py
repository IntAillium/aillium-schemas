from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Annotated, Literal, Union

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
