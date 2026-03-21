import type {
  DeprecatedWorkerPollRequest,
  DeprecatedWorkerPollResult,
  StepUpdate,
  Task,
  TaskCreate,
} from "./contracts.js";

export interface CreateTaskRequest {
  body: TaskCreate;
}

export interface CreateTaskResponse {
  status: 201;
  body: Task;
}

export interface GetTaskRequest {
  path: {
    task_id: string;
  };
}

export interface GetTaskResponse {
  status: 200;
  body: Task;
}

export interface ApproveTaskRequest {
  path: {
    task_id: string;
  };
}

export interface ApproveTaskResponse {
  status: 200;
  body: Task;
}

export interface CancelTaskRequest {
  path: {
    task_id: string;
  };
}

export interface CancelTaskResponse {
  status: 200;
  body: Task;
}

export interface ListTaskEventsRequest {
  path: {
    task_id: string;
  };
}

export interface ListTaskEventsResponse {
  status: 200;
  body: StepUpdate[];
}

/** @deprecated Use OpenClaw runtime contracts instead. */
export interface WorkerPollRequest {
  path: {
    worker_id: string;
  };
  body: DeprecatedWorkerPollRequest;
}

/** @deprecated Use OpenClaw runtime contracts instead. */
export interface WorkerPollResponse {
  status: 200;
  body: Task[];
}

/** @deprecated Use OpenClaw runtime contracts instead. */
export interface WorkerResultRequest {
  path: {
    worker_id: string;
  };
  body: DeprecatedWorkerPollResult;
}

/** @deprecated Use OpenClaw runtime contracts instead. */
export interface WorkerResultResponse {
  status: 202;
}

export type AilliumCoreApiClient = {
  createTask(request: CreateTaskRequest): Promise<CreateTaskResponse>;
  getTask(request: GetTaskRequest): Promise<GetTaskResponse>;
  approveTask(request: ApproveTaskRequest): Promise<ApproveTaskResponse>;
  cancelTask(request: CancelTaskRequest): Promise<CancelTaskResponse>;
  listTaskEvents(request: ListTaskEventsRequest): Promise<ListTaskEventsResponse>;
  /** @deprecated Use OpenClaw runtime contracts instead. */
  workerPoll(request: WorkerPollRequest): Promise<WorkerPollResponse>;
  /** @deprecated Use OpenClaw runtime contracts instead. */
  workerResult(request: WorkerResultRequest): Promise<WorkerResultResponse>;
};
