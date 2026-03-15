from __future__ import annotations

from typing import List

from pydantic import BaseModel, ConfigDict

from .contracts import (
    StepUpdate,
    Task,
    TaskCreate,
    WorkerPollRequest,
    WorkerPollResponse,
    WorkerTaskResultRequest,
    WorkerTaskResultResponse,
)


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


class PollWorkerTaskRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    query: WorkerPollRequest


class PollWorkerTaskResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: int = 200
    body: WorkerPollResponse


class SubmitWorkerTaskResultRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    task_id: str
    body: WorkerTaskResultRequest


class SubmitWorkerTaskResultResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: int = 200
    body: WorkerTaskResultResponse
