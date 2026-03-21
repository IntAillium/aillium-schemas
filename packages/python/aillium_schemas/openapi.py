from __future__ import annotations

from typing import List

from pydantic import BaseModel, ConfigDict

from .contracts import DeprecatedWorkerPollRequest, DeprecatedWorkerPollResult, StepUpdate, Task, TaskCreate


class CreateTaskRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    body: TaskCreate


class CreateTaskResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: int = 201
    body: Task


class GetTaskRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    task_id: str


class GetTaskResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: int = 200
    body: Task


class ApproveTaskRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    task_id: str


class ApproveTaskResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: int = 200
    body: Task


class CancelTaskRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    task_id: str


class CancelTaskResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: int = 200
    body: Task


class ListTaskEventsRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    task_id: str


class ListTaskEventsResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: int = 200
    body: List[StepUpdate]


class WorkerPollRequest(BaseModel):
    """Deprecated: Use OpenClaw runtime contracts instead."""

    model_config = ConfigDict(extra="forbid")

    worker_id: str
    body: DeprecatedWorkerPollRequest


class WorkerPollResponse(BaseModel):
    """Deprecated: Use OpenClaw runtime contracts instead."""

    model_config = ConfigDict(extra="forbid")

    status: int = 200
    body: List[Task]


class WorkerResultRequest(BaseModel):
    """Deprecated: Use OpenClaw runtime contracts instead."""

    model_config = ConfigDict(extra="forbid")

    worker_id: str
    body: DeprecatedWorkerPollResult


class WorkerResultResponse(BaseModel):
    """Deprecated: Use OpenClaw runtime contracts instead."""

    model_config = ConfigDict(extra="forbid")

    status: int = 202
