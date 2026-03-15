import type {
  StepUpdate,
  Task,
  TaskCreate,
  WorkerPollRequest,
  WorkerPollResponse,
  WorkerTaskResultRequest,
  WorkerTaskResultResponse,
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

export interface PollWorkerTaskRequest {
  query: WorkerPollRequest;
}

export interface PollWorkerTaskResponse {
  status: 200;
  body: WorkerPollResponse;
}

export interface SubmitWorkerTaskResultRequest {
  path: {
    task_id: string;
  };
  body: WorkerTaskResultRequest;
}

export interface SubmitWorkerTaskResultResponse {
  status: 200;
  body: WorkerTaskResultResponse;
}

export type AilliumCoreApiClient = {
  createTask(request: CreateTaskRequest): Promise<CreateTaskResponse>;
  getTask(request: GetTaskRequest): Promise<GetTaskResponse>;
  approveTask(request: ApproveTaskRequest): Promise<ApproveTaskResponse>;
  cancelTask(request: CancelTaskRequest): Promise<CancelTaskResponse>;
  listTaskEvents(request: ListTaskEventsRequest): Promise<ListTaskEventsResponse>;
  pollWorkerTask(request: PollWorkerTaskRequest): Promise<PollWorkerTaskResponse>;
  submitWorkerTaskResult(
    request: SubmitWorkerTaskResultRequest,
  ): Promise<SubmitWorkerTaskResultResponse>;
};
