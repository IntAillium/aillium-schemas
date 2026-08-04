import { z } from "zod";

/**
 * Provider-neutral runtime boundary owned by Aillium Core.
 *
 * Values validated by the wire schemas are JSON serializable. Process-local
 * cancellation is deliberately added only after decoding through
 * `bindExecutionSignalV1`; AbortSignal must never cross a transport boundary.
 */
export const RuntimeContractVersion = "1.0" as const;
const RuntimeContractVersionSchema = z.literal(RuntimeContractVersion);

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

const RawJsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.number().finite(),
    z.string(),
    z.array(RawJsonValueSchema),
    z.record(RawJsonValueSchema),
  ]),
);

export const RuntimeJsonLimits = Object.freeze({
  max_bytes: 1_048_576,
  max_depth: 32,
  max_nodes: 100_000,
  external_tool_max_bytes: 65_536,
  external_tool_max_depth: 12,
} as const);

/** Domain limits keep every arithmetic operand and aggregate exactly representable. */
export const RuntimeNumericLimits = Object.freeze({
  duration_ms: 2_678_400_000,
  operation_count: 1_000_000,
  input_or_output_tokens: 1_000_000_000,
  total_tokens: 2_000_000_000,
  cost_minor_units: 1_000_000_000_000,
  ordinal: 1_000_000_000_000,
  attempt: 1_000_000,
} as const);

function measureJson(value: JsonValue): {
  bytes: number;
  depth: number;
  nodes: number;
} {
  const serialized = JSON.stringify(value);
  const bytes = new TextEncoder().encode(serialized).byteLength;
  let depth = 0;
  let nodes = 0;
  const stack: Array<{ value: JsonValue; depth: number }> = [
    { value, depth: 1 },
  ];
  while (stack.length > 0) {
    const current = stack.pop()!;
    nodes += 1;
    depth = Math.max(depth, current.depth);
    if (Array.isArray(current.value)) {
      for (const child of current.value) {
        stack.push({ value: child, depth: current.depth + 1 });
      }
    } else if (current.value !== null && typeof current.value === "object") {
      for (const child of Object.values(current.value)) {
        stack.push({ value: child, depth: current.depth + 1 });
      }
    }
  }
  return { bytes, depth, nodes };
}

function addJsonLimitIssues(
  value: JsonValue,
  ctx: z.RefinementCtx,
  limits: { max_bytes: number; max_depth: number; max_nodes: number },
): void {
  const measured = measureJson(value);
  for (const [key, maximum] of Object.entries(limits)) {
    const metric = key.replace("max_", "") as keyof typeof measured;
    if (measured[metric] > maximum) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `JSON ${metric} exceeds ${maximum}`,
      });
    }
  }
}

export const JsonValueSchema: z.ZodType<JsonValue> = RawJsonValueSchema.superRefine(
  (value, ctx) =>
    addJsonLimitIssues(value, ctx, {
      max_bytes: RuntimeJsonLimits.max_bytes,
      max_depth: RuntimeJsonLimits.max_depth,
      max_nodes: RuntimeJsonLimits.max_nodes,
    }),
);
export const JsonObjectSchema: z.ZodType<JsonObject> = z
  .record(RawJsonValueSchema)
  .superRefine((value, ctx) =>
    addJsonLimitIssues(value, ctx, {
      max_bytes: RuntimeJsonLimits.max_bytes,
      max_depth: RuntimeJsonLimits.max_depth,
      max_nodes: RuntimeJsonLimits.max_nodes,
    }),
  );

const IdSchema = z
  .string()
  .min(1)
  .max(255)
  .regex(/^\S(?:[\s\S]*\S)?$/, "ID cannot contain surrounding whitespace");
const IdempotencyKeySchema = z
  .string()
  .min(1)
  .max(512)
  .regex(
    /^\S(?:[\s\S]*\S)?$/,
    "idempotency key cannot contain surrounding whitespace",
  );
const CheckpointCursorSchema = z
  .string()
  .min(1)
  .max(512)
  .regex(
    /^\S(?:[\s\S]*\S)?$/,
    "checkpoint cursor cannot contain surrounding whitespace",
  );
const FenceTokenSchema = z.string().regex(/^(0|[1-9]\d*)$/);
const Rfc3339TimestampParts =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|([+-])(\d{2}):(\d{2}))$/;

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function isValidRfc3339Timestamp(value: string): boolean {
  const match = Rfc3339TimestampParts.exec(value);
  if (!match) return false;
  const [
    ,
    yearText,
    monthText,
    dayText,
    hourText,
    minuteText,
    secondText,
    ,
    offsetHourText,
    offsetMinuteText,
  ] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const monthDays = [
    31,
    isLeapYear(year) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > monthDays[month - 1] ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    return false;
  }
  if (
    offsetHourText !== undefined &&
    (Number(offsetHourText) > 23 || Number(offsetMinuteText) > 59)
  ) {
    return false;
  }
  return Number.isFinite(Date.parse(value));
}

const TimestampSchema = z
  .string()
  .datetime({ offset: true })
  .refine(isValidRfc3339Timestamp, "timestamp must be a valid RFC3339 instant");
const PositiveDurationSchema = z
  .number()
  .int()
  .positive()
  .max(RuntimeNumericLimits.duration_ms);
const NonnegativeDurationSchema = z
  .number()
  .int()
  .nonnegative()
  .max(RuntimeNumericLimits.duration_ms);
const PositiveCountSchema = z
  .number()
  .int()
  .positive()
  .max(RuntimeNumericLimits.operation_count);
const NonnegativeCountSchema = z
  .number()
  .int()
  .nonnegative()
  .max(RuntimeNumericLimits.operation_count);
const PositiveTokenPartSchema = z
  .number()
  .int()
  .positive()
  .max(RuntimeNumericLimits.input_or_output_tokens);
const NonnegativeTokenPartSchema = z
  .number()
  .int()
  .nonnegative()
  .max(RuntimeNumericLimits.input_or_output_tokens);
const PositiveTotalTokenSchema = z
  .number()
  .int()
  .positive()
  .max(RuntimeNumericLimits.total_tokens);
const NonnegativeTotalTokenSchema = z
  .number()
  .int()
  .nonnegative()
  .max(RuntimeNumericLimits.total_tokens);
const NonnegativeCostSchema = z
  .number()
  .int()
  .nonnegative()
  .max(RuntimeNumericLimits.cost_minor_units);
const PositiveOrdinalSchema = z
  .number()
  .int()
  .positive()
  .max(RuntimeNumericLimits.ordinal);
const NonnegativeOrdinalSchema = z
  .number()
  .int()
  .nonnegative()
  .max(RuntimeNumericLimits.ordinal);
const AttemptSchema = PositiveCountSchema;
const ExecutionReferenceV1Shape = {
  tenant_id: IdSchema,
  work_order_id: IdSchema,
  run_id: IdSchema,
  run_step_id: IdSchema,
  attempt: AttemptSchema,
};

export const RuntimeBudgetV1Schema = z
  .object({
    deadline_at: TimestampSchema,
    max_duration_ms: PositiveDurationSchema,
    max_model_calls: PositiveCountSchema,
    max_tool_calls: NonnegativeCountSchema,
    max_retries: NonnegativeCountSchema,
    max_revision_count: NonnegativeCountSchema,
    max_input_tokens: PositiveTokenPartSchema,
    max_output_tokens: PositiveTokenPartSchema,
    max_total_tokens: PositiveTotalTokenSchema,
    max_cost: z
      .object({
        currency: z.string().regex(/^[A-Z]{3}$/),
        minor_units: NonnegativeCostSchema,
      })
      .strict(),
    model_ceilings: z
      .array(
        z
          .object({
            provider: IdSchema,
            model: IdSchema,
            max_calls: PositiveCountSchema,
            max_input_tokens: PositiveTokenPartSchema,
            max_output_tokens: PositiveTokenPartSchema,
            max_total_tokens: PositiveTotalTokenSchema,
            max_cost_minor_units: NonnegativeCostSchema,
          })
          .strict(),
      )
      .min(1)
      .max(64),
  })
  .strict()
  .superRefine((budget, ctx) => {
    if (budget.max_total_tokens !== budget.max_input_tokens + budget.max_output_tokens) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["max_total_tokens"],
        message: "max_total_tokens must equal input plus output token limits",
      });
    }
    const modelKeys = budget.model_ceilings.map(
      (ceiling) => `${ceiling.provider}\u0000${ceiling.model}`,
    );
    if (new Set(modelKeys).size !== modelKeys.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["model_ceilings"],
        message: "model ceilings must be unique by provider and model",
      });
    }
    budget.model_ceilings.forEach((ceiling, index) => {
      if (
        ceiling.max_total_tokens !==
          ceiling.max_input_tokens + ceiling.max_output_tokens ||
        ceiling.max_calls > budget.max_model_calls ||
        ceiling.max_input_tokens > budget.max_input_tokens ||
        ceiling.max_output_tokens > budget.max_output_tokens ||
        ceiling.max_total_tokens > budget.max_total_tokens ||
        ceiling.max_cost_minor_units > budget.max_cost.minor_units
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["model_ceilings", index],
          message: "model ceiling must fit within the global budget",
        });
      }
    });
  });
export type RuntimeBudgetV1 = z.infer<typeof RuntimeBudgetV1Schema>;

export const RuntimeBudgetCounterV1Schema = z
  .object({
    duration_ms: NonnegativeDurationSchema,
    model_calls: NonnegativeCountSchema,
    tool_calls: NonnegativeCountSchema,
    retries: NonnegativeCountSchema,
    revisions: NonnegativeCountSchema,
    input_tokens: NonnegativeTokenPartSchema,
    output_tokens: NonnegativeTokenPartSchema,
    total_tokens: NonnegativeTotalTokenSchema,
    cost_minor_units: NonnegativeCostSchema,
  })
  .strict()
  .superRefine((counter, ctx) => {
    if (counter.total_tokens !== counter.input_tokens + counter.output_tokens) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["total_tokens"],
        message: "total_tokens must equal input_tokens plus output_tokens",
      });
    }
  });
export type RuntimeBudgetCounterV1 = z.infer<
  typeof RuntimeBudgetCounterV1Schema
>;

export const RuntimeBudgetLedgerV1Schema = z
  .object({
    currency: z.string().regex(/^[A-Z]{3}$/),
    consumed: RuntimeBudgetCounterV1Schema,
    remaining: RuntimeBudgetCounterV1Schema,
    model_consumption: z
      .array(
        z
          .object({
            provider: IdSchema,
            model: IdSchema,
            calls: NonnegativeCountSchema,
            input_tokens: NonnegativeTokenPartSchema,
            output_tokens: NonnegativeTokenPartSchema,
            total_tokens: NonnegativeTotalTokenSchema,
            cost_minor_units: NonnegativeCostSchema,
          })
          .strict()
          .superRefine((use, ctx) => {
            if (use.total_tokens !== use.input_tokens + use.output_tokens) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["total_tokens"],
                message: "model total_tokens must equal input plus output",
              });
            }
          }),
      )
      .max(64),
    updated_at: TimestampSchema,
  })
  .strict();
export type RuntimeBudgetLedgerV1 = z.infer<
  typeof RuntimeBudgetLedgerV1Schema
>;

/** Serializable identity and limits. This schema intentionally rejects signal. */
export const ExecutionContextWireV1Schema = z
  .object({
    contract_version: RuntimeContractVersionSchema,
    tenant_id: IdSchema,
    work_order_id: IdSchema,
    run_id: IdSchema,
    run_step_id: IdSchema,
    attempt: AttemptSchema,
    idempotency_key: IdempotencyKeySchema,
    fence_token: FenceTokenSchema,
    checkpoint_cursor: CheckpointCursorSchema.nullable(),
    executor_id: IdSchema,
    lease_id: IdSchema,
    lease_epoch: PositiveOrdinalSchema,
    lease_expires_at: TimestampSchema,
    budget: RuntimeBudgetV1Schema,
    budget_ledger: RuntimeBudgetLedgerV1Schema,
  })
  .strict()
  .superRefine((context, ctx) => {
    const limits = context.budget;
    const consumed = context.budget_ledger.consumed;
    const remaining = context.budget_ledger.remaining;
    const pairs: Array<[keyof typeof consumed, number]> = [
      ["duration_ms", limits.max_duration_ms],
      ["model_calls", limits.max_model_calls],
      ["tool_calls", limits.max_tool_calls],
      ["retries", limits.max_retries],
      ["revisions", limits.max_revision_count],
      ["input_tokens", limits.max_input_tokens],
      ["output_tokens", limits.max_output_tokens],
      ["total_tokens", limits.max_total_tokens],
      ["cost_minor_units", limits.max_cost.minor_units],
    ];
    for (const [name, maximum] of pairs) {
      if (consumed[name] + remaining[name] !== maximum) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["budget_ledger", "remaining", name],
          message: `${name} consumed plus remaining must equal its limit`,
        });
      }
    }
    if (context.budget_ledger.currency !== limits.max_cost.currency) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["budget_ledger", "currency"],
        message: "budget ledger currency must match the budget",
      });
    }
    const ceilings = new Map(
      limits.model_ceilings.map((ceiling) => [
        `${ceiling.provider}\u0000${ceiling.model}`,
        ceiling,
      ]),
    );
    const consumptionKeys = context.budget_ledger.model_consumption.map(
      (use) => `${use.provider}\u0000${use.model}`,
    );
    if (new Set(consumptionKeys).size !== consumptionKeys.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["budget_ledger", "model_consumption"],
        message: "model consumption must have one entry per provider/model",
      });
    }
    for (const [index, use] of context.budget_ledger.model_consumption.entries()) {
      const ceiling = ceilings.get(`${use.provider}\u0000${use.model}`);
      if (
        !ceiling ||
        use.calls > ceiling.max_calls ||
        use.input_tokens > ceiling.max_input_tokens ||
        use.output_tokens > ceiling.max_output_tokens ||
        use.total_tokens > ceiling.max_total_tokens ||
        use.cost_minor_units > ceiling.max_cost_minor_units
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["budget_ledger", "model_consumption", index],
          message: "model consumption must fit a declared model ceiling",
        });
      }
    }
    const modelTotals = context.budget_ledger.model_consumption.reduce(
      (total, use) => ({
        model_calls: total.model_calls + use.calls,
        input_tokens: total.input_tokens + use.input_tokens,
        output_tokens: total.output_tokens + use.output_tokens,
        total_tokens: total.total_tokens + use.total_tokens,
        cost_minor_units: total.cost_minor_units + use.cost_minor_units,
      }),
      {
        model_calls: 0,
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0,
        cost_minor_units: 0,
      },
    );
    for (const [name, value] of Object.entries(modelTotals)) {
      if (value !== consumed[name as keyof typeof modelTotals]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["budget_ledger", "model_consumption"],
          message: `${name} must equal the consumed model ledger total`,
        });
      }
    }
  });
export type ExecutionContextWireV1 = z.infer<
  typeof ExecutionContextWireV1Schema
>;

/** Process-local context. The AbortSignal is never part of the wire schema. */
export type ExecutionContextV1 = Readonly<
  ExecutionContextWireV1 & { signal: AbortSignal }
>;

export function bindExecutionSignalV1(
  wire: ExecutionContextWireV1,
  signal: AbortSignal,
): ExecutionContextV1 {
  const parsed = ExecutionContextWireV1Schema.parse(wire);
  const freeze = (value: unknown): void => {
    if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
      return;
    }
    for (const child of Object.values(value)) {
      freeze(child);
    }
    Object.freeze(value);
  };
  freeze(parsed);
  return Object.freeze({ ...parsed, signal });
}

export const ExecutorLeaseScopeV1Schema = z
  .object({
    tenant_id: IdSchema,
    work_order_id: IdSchema,
    run_id: IdSchema,
    run_step_id: IdSchema,
    attempt: AttemptSchema,
    executor_id: IdSchema,
    idempotency_key: IdempotencyKeySchema,
  })
  .strict();
export type ExecutorLeaseScopeV1 = z.infer<typeof ExecutorLeaseScopeV1Schema>;

export const ExecutorLeaseAcquireRequestV1Schema = z
  .object({
    lease_request_id: IdSchema,
    scope: ExecutorLeaseScopeV1Schema,
    requested_at: TimestampSchema,
    requested_duration_ms: PositiveDurationSchema.max(300_000),
  })
  .strict();
export type ExecutorLeaseAcquireRequestV1 = z.infer<
  typeof ExecutorLeaseAcquireRequestV1Schema
>;

export const ExecutorLeaseAcquireResultV1Schema = z
  .object({
    lease_request_id: IdSchema,
    status: z.enum(["ACQUIRED", "REJECTED"]),
    lease_id: IdSchema.nullable(),
    lease_epoch: PositiveOrdinalSchema.nullable(),
    fence_token: FenceTokenSchema.nullable(),
    lease_expires_at: TimestampSchema.nullable(),
    requested_at: TimestampSchema,
    decided_at: TimestampSchema,
    rejection_reason: z.string().trim().min(1).max(1_000).nullable(),
  })
  .strict()
  .superRefine((result, ctx) => {
    if (Date.parse(result.decided_at) < Date.parse(result.requested_at)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["decided_at"],
        message: "lease decision cannot precede its request",
      });
    }
    const leaseFields = [
      result.lease_id,
      result.lease_epoch,
      result.fence_token,
      result.lease_expires_at,
    ];
    if (
      result.status === "ACQUIRED" &&
      (leaseFields.some((value) => value === null) ||
        result.rejection_reason !== null)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "an acquired lease requires all lease fields and no rejection",
      });
    }
    if (
      result.status === "ACQUIRED" &&
      result.lease_expires_at !== null &&
      Date.parse(result.lease_expires_at) <= Date.parse(result.decided_at)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["lease_expires_at"],
        message: "an acquired lease must expire after its decision",
      });
    }
    if (
      result.status === "REJECTED" &&
      (leaseFields.some((value) => value !== null) ||
        result.rejection_reason === null)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "a rejected lease requires a reason and no lease fields",
      });
    }
  });
export type ExecutorLeaseAcquireResultV1 = z.infer<
  typeof ExecutorLeaseAcquireResultV1Schema
>;

const ActiveLeaseIdentityV1Schema = z
  .object({
    scope: ExecutorLeaseScopeV1Schema,
    lease_id: IdSchema,
    lease_epoch: PositiveOrdinalSchema,
    fence_token: FenceTokenSchema,
    lease_expires_at: TimestampSchema,
  })
  .strict();

export const ExecutorLeaseRenewRequestV1Schema = ActiveLeaseIdentityV1Schema.extend({
  lease_request_id: IdSchema,
  requested_at: TimestampSchema,
  requested_duration_ms: PositiveDurationSchema.max(300_000),
  checkpoint_cursor: CheckpointCursorSchema.nullable(),
}).strict();
export type ExecutorLeaseRenewRequestV1 = z.infer<
  typeof ExecutorLeaseRenewRequestV1Schema
>;

export const ExecutorLeaseRenewResultV1Schema = z
  .object({
    lease_request_id: IdSchema,
    status: z.enum(["RENEWED", "LOST", "REJECTED"]),
    lease_id: IdSchema,
    lease_epoch: PositiveOrdinalSchema,
    fence_token: FenceTokenSchema,
    previous_expires_at: TimestampSchema,
    lease_expires_at: TimestampSchema.nullable(),
    requested_at: TimestampSchema,
    decided_at: TimestampSchema,
    reason: z.string().trim().min(1).max(1_000).nullable(),
  })
  .strict()
  .superRefine((result, ctx) => {
    if (Date.parse(result.decided_at) < Date.parse(result.requested_at)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["decided_at"],
        message: "renewal decision cannot precede its request",
      });
    }
    if (
      result.status === "RENEWED" &&
      (result.lease_expires_at === null || result.reason !== null)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "renewed leases require a new expiry and no failure reason",
      });
    }
    if (
      result.status === "RENEWED" &&
      Date.parse(result.decided_at) > Date.parse(result.previous_expires_at)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["decided_at"],
        message: "an expired lease cannot be renewed",
      });
    }
    if (
      result.status !== "RENEWED" &&
      (result.lease_expires_at !== null || result.reason === null)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "lost or rejected renewals require a reason and no new expiry",
      });
    }
    if (
      result.lease_expires_at !== null &&
      Date.parse(result.lease_expires_at) <= Date.parse(result.previous_expires_at)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["lease_expires_at"],
        message: "a renewed lease expiry must advance",
      });
    }
  });
export type ExecutorLeaseRenewResultV1 = z.infer<
  typeof ExecutorLeaseRenewResultV1Schema
>;

export const ExecutorHeartbeatV1Schema = ActiveLeaseIdentityV1Schema.extend({
  emitted_at: TimestampSchema,
  last_activity_at: TimestampSchema,
  checkpoint_cursor: CheckpointCursorSchema.nullable(),
  health: z.enum(["HEALTHY", "DEGRADED", "STOPPING"]),
}).strict().superRefine((heartbeat, ctx) => {
  const emitted = Date.parse(heartbeat.emitted_at);
  if (
    Date.parse(heartbeat.last_activity_at) > emitted ||
    emitted > Date.parse(heartbeat.lease_expires_at)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["emitted_at"],
      message: "heartbeat chronology must remain inside the active lease",
    });
  }
});
export type ExecutorHeartbeatV1 = z.infer<typeof ExecutorHeartbeatV1Schema>;

export const ExecutorLeaseLossV1Schema = ActiveLeaseIdentityV1Schema.extend({
  detected_at: TimestampSchema,
  reason: z.enum([
    "EXPIRED",
    "FENCED",
    "CANCELLED",
    "REVOKED",
    "HEARTBEAT_REJECTED",
  ]),
  replacement_fence_token: FenceTokenSchema.nullable(),
}).strict().superRefine((loss, ctx) => {
  if (
    loss.reason === "EXPIRED" &&
    Date.parse(loss.detected_at) < Date.parse(loss.lease_expires_at)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["detected_at"],
      message: "expired lease loss cannot be detected before lease expiry",
    });
  }
  if (loss.reason === "FENCED" && loss.replacement_fence_token === null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["replacement_fence_token"],
      message: "fenced lease loss requires the replacement fence token",
    });
  }
  if (
    loss.reason === "FENCED" &&
    loss.replacement_fence_token !== null &&
    BigInt(loss.replacement_fence_token) <= BigInt(loss.fence_token)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["replacement_fence_token"],
      message: "replacement fence token must strictly advance",
    });
  }
  if (loss.reason !== "FENCED" && loss.replacement_fence_token !== null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["replacement_fence_token"],
      message: "replacement fence token is only valid for fenced lease loss",
    });
  }
});
export type ExecutorLeaseLossV1 = z.infer<typeof ExecutorLeaseLossV1Schema>;

export const ExecutorLeaseWireEnvelopeV1Schema = z.discriminatedUnion(
  "message_type",
  [
    z.object({
      contract_version: RuntimeContractVersionSchema,
      envelope_id: IdSchema,
      message_type: z.literal("LEASE_ACQUIRE_REQUEST"),
      emitted_at: TimestampSchema,
      payload: ExecutorLeaseAcquireRequestV1Schema,
    }).strict(),
    z.object({
      contract_version: RuntimeContractVersionSchema,
      envelope_id: IdSchema,
      message_type: z.literal("LEASE_ACQUIRE_RESULT"),
      emitted_at: TimestampSchema,
      payload: ExecutorLeaseAcquireResultV1Schema,
    }).strict(),
    z.object({
      contract_version: RuntimeContractVersionSchema,
      envelope_id: IdSchema,
      message_type: z.literal("LEASE_RENEW_REQUEST"),
      emitted_at: TimestampSchema,
      payload: ExecutorLeaseRenewRequestV1Schema,
    }).strict(),
    z.object({
      contract_version: RuntimeContractVersionSchema,
      envelope_id: IdSchema,
      message_type: z.literal("LEASE_RENEW_RESULT"),
      emitted_at: TimestampSchema,
      payload: ExecutorLeaseRenewResultV1Schema,
    }).strict(),
    z.object({
      contract_version: RuntimeContractVersionSchema,
      envelope_id: IdSchema,
      message_type: z.literal("EXECUTOR_HEARTBEAT"),
      emitted_at: TimestampSchema,
      payload: ExecutorHeartbeatV1Schema,
    }).strict(),
    z.object({
      contract_version: RuntimeContractVersionSchema,
      envelope_id: IdSchema,
      message_type: z.literal("LEASE_LOSS"),
      emitted_at: TimestampSchema,
      payload: ExecutorLeaseLossV1Schema,
    }).strict(),
  ],
).superRefine((envelope, ctx) => {
  const emitted = Date.parse(envelope.emitted_at);
  if (
    (envelope.message_type === "LEASE_ACQUIRE_REQUEST" ||
      envelope.message_type === "LEASE_RENEW_REQUEST") &&
    Date.parse(envelope.payload.requested_at) > emitted
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["payload", "requested_at"],
      message: "lease request cannot follow envelope emission",
    });
  }
  if (
    envelope.message_type === "LEASE_RENEW_REQUEST" &&
    (Date.parse(envelope.payload.requested_at) >=
      Date.parse(envelope.payload.lease_expires_at) ||
      emitted > Date.parse(envelope.payload.lease_expires_at))
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["payload", "lease_expires_at"],
      message: "renewal request and envelope must remain inside the active lease",
    });
  }
  if (
    (envelope.message_type === "LEASE_ACQUIRE_RESULT" ||
      envelope.message_type === "LEASE_RENEW_RESULT") &&
    Date.parse(envelope.payload.decided_at) > emitted
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["payload", "decided_at"],
      message: "lease decision cannot follow envelope emission",
    });
  }
  if (
    envelope.message_type === "EXECUTOR_HEARTBEAT" &&
    Date.parse(envelope.payload.emitted_at) > emitted
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["payload", "emitted_at"],
      message: "heartbeat cannot follow envelope emission",
    });
  }
  if (
    envelope.message_type === "LEASE_LOSS" &&
    Date.parse(envelope.payload.detected_at) > emitted
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["payload", "detected_at"],
      message: "lease loss detection cannot follow envelope emission",
    });
  }
});
export type ExecutorLeaseWireEnvelopeV1 = z.infer<
  typeof ExecutorLeaseWireEnvelopeV1Schema
>;

export const ModelCancellationCapabilityValues = [
  "NONE",
  "COOPERATIVE",
  "FORCED",
] as const;
export const StructuredOutputCapabilityValues = [
  "NONE",
  "JSON_OBJECT",
  "JSON_SCHEMA",
] as const;

export const ModelCapabilitiesV1Schema = z
  .object({
    native_tool_calls: z.boolean(),
    streaming: z.boolean(),
    cancellation: z.enum(ModelCancellationCapabilityValues),
    structured_output: z.enum(StructuredOutputCapabilityValues),
    usage: z
      .object({
        input_tokens: z.boolean(),
        output_tokens: z.boolean(),
        total_tokens: z.boolean(),
        cost: z.boolean(),
      })
      .strict(),
  })
  .strict();
export type ModelCapabilitiesV1 = z.infer<typeof ModelCapabilitiesV1Schema>;

export const ModelDescriptorV1Schema = z
  .object({
    adapter_id: IdSchema,
    provider: IdSchema,
    model: IdSchema,
    capabilities: ModelCapabilitiesV1Schema,
  })
  .strict();
export type ModelDescriptorV1 = z.infer<typeof ModelDescriptorV1Schema>;

export const ToolSideEffectClassValues = [
  "READ_ONLY",
  "INTERNAL_WRITE",
  "REVERSIBLE_EXTERNAL_WRITE",
  "IRREVERSIBLE_EXTERNAL_WRITE",
  "DESTRUCTIVE",
] as const;
export const ToolApprovalRequirementValues = [
  "NEVER",
  "POLICY",
  "ALWAYS",
] as const;
export const ToolCancellationCapabilityValues = [
  "NONE",
  "COOPERATIVE",
  "FORCED",
] as const;
export const ToolIdempotencyCapabilityValues = [
  "NONE",
  "SUPPORTED",
  "REQUIRED",
] as const;

export const ToolCapabilitiesV1Schema = z
  .object({
    side_effect_class: z.enum(ToolSideEffectClassValues),
    approval: z.enum(ToolApprovalRequirementValues),
    cancellation: z.enum(ToolCancellationCapabilityValues),
    reconciliation: z.boolean(),
    idempotency: z.enum(ToolIdempotencyCapabilityValues),
  })
  .strict()
  .superRefine((capabilities, ctx) => {
    if (
      capabilities.side_effect_class !== "READ_ONLY" &&
      capabilities.idempotency === "NONE"
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["idempotency"],
        message: "write tools must support idempotency",
      });
    }
    if (
      [
        "REVERSIBLE_EXTERNAL_WRITE",
        "IRREVERSIBLE_EXTERNAL_WRITE",
        "DESTRUCTIVE",
      ].includes(capabilities.side_effect_class) &&
      (!capabilities.reconciliation || capabilities.idempotency !== "REQUIRED")
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["reconciliation"],
        message:
          "external-write tools require reconciliation and required idempotency",
      });
    }
    if (
      (capabilities.side_effect_class === "IRREVERSIBLE_EXTERNAL_WRITE" ||
        capabilities.side_effect_class === "DESTRUCTIVE") &&
      capabilities.approval === "NEVER"
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["approval"],
        message: "irreversible and destructive tools require approval policy",
      });
    }
  });
export type ToolCapabilitiesV1 = z.infer<typeof ToolCapabilitiesV1Schema>;

export const ToolDescriptorV1Schema = z
  .object({
    adapter_id: IdSchema,
    name: z.string().regex(/^[a-z][a-z0-9_.-]{0,127}$/),
    description: z.string().trim().min(1).max(2_000),
    capabilities: ToolCapabilitiesV1Schema,
    input_schema: JsonObjectSchema,
    output_schema: JsonObjectSchema.nullable(),
  })
  .strict();
export type ToolDescriptorV1 = z.infer<typeof ToolDescriptorV1Schema>;

export const RuntimeMessageV1Schema = z
  .object({
    role: z.enum(["SYSTEM", "USER", "ASSISTANT", "TOOL"]),
    content: z.string().max(1_000_000),
    tool_call_id: IdSchema.nullable(),
  })
  .strict();
export type RuntimeMessageV1 = z.infer<typeof RuntimeMessageV1Schema>;

export const ModelToolDefinitionV1Schema = z
  .object({
    name: z.string().regex(/^[a-z][a-z0-9_.-]{0,127}$/),
    description: z.string().trim().min(1).max(2_000),
    input_schema: JsonObjectSchema,
  })
  .strict();
export type ModelToolDefinitionV1 = z.infer<
  typeof ModelToolDefinitionV1Schema
>;

export const ModelGenerateRequestV1Schema = z
  .object({
    ...ExecutionReferenceV1Shape,
    operation_id: IdSchema,
    idempotency_key: IdempotencyKeySchema,
    fence_token: FenceTokenSchema,
    target: z
      .object({
        provider: IdSchema,
        model: IdSchema,
        fallback_index: NonnegativeOrdinalSchema.max(63),
      })
      .strict(),
    messages: z.array(RuntimeMessageV1Schema).min(1).max(10_000),
    tool_mode: z.enum(["NONE", "NATIVE", "EXTERNAL_STRUCTURED"]),
    tools: z.array(ModelToolDefinitionV1Schema).max(256),
    response_format: z
      .discriminatedUnion("kind", [
        z.object({ kind: z.literal("TEXT") }).strict(),
        z.object({ kind: z.literal("JSON_OBJECT") }).strict(),
        z
          .object({
            kind: z.literal("JSON_SCHEMA"),
            name: IdSchema,
            schema: JsonObjectSchema,
          })
          .strict(),
      ]),
  })
  .strict()
  .superRefine((request, ctx) => {
    addJsonLimitIssues(request as JsonValue, ctx, {
      max_bytes: RuntimeJsonLimits.max_bytes,
      max_depth: RuntimeJsonLimits.max_depth,
      max_nodes: RuntimeJsonLimits.max_nodes,
    });
    if (request.tool_mode === "NONE" && request.tools.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["tools"],
        message: "tool definitions require a native or external tool mode",
      });
    }
    const names = request.tools.map((tool) => tool.name);
    if (new Set(names).size !== names.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["tools"],
        message: "tool definitions must have unique names",
      });
    }
  });
export type ModelGenerateRequestV1 = z.infer<
  typeof ModelGenerateRequestV1Schema
>;

export const ModelUsageV1Schema = z
  .object({
    input_tokens: NonnegativeTokenPartSchema.nullable(),
    output_tokens: NonnegativeTokenPartSchema.nullable(),
    total_tokens: NonnegativeTotalTokenSchema.nullable(),
    cost: z
      .object({
        currency: z.string().regex(/^[A-Z]{3}$/),
        minor_units: NonnegativeCostSchema,
      })
      .strict()
      .nullable(),
  })
  .strict()
  .superRefine((usage, ctx) => {
    if (
      usage.input_tokens !== null &&
      usage.output_tokens !== null &&
      usage.total_tokens !== usage.input_tokens + usage.output_tokens
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["total_tokens"],
        message: "usage total_tokens must equal input plus output",
      });
    }
  });
export type ModelUsageV1 = z.infer<typeof ModelUsageV1Schema>;

const ModelToolRequestV1Schema = z
  .object({
    ...ExecutionReferenceV1Shape,
    type: z.literal("TOOL_REQUEST"),
      sequence: NonnegativeOrdinalSchema,
      operation_id: IdSchema,
      idempotency_key: IdempotencyKeySchema,
      fence_token: FenceTokenSchema,
    call_id: IdSchema,
    source: z.enum(["NATIVE", "EXTERNAL_STRUCTURED"]),
    tool_name: z.string().regex(/^[a-z][a-z0-9_.-]{0,127}$/),
    arguments: JsonObjectSchema,
  })
  .strict();

export const ModelEventV1Schema = z.discriminatedUnion("type", [
  z
    .object({
      ...ExecutionReferenceV1Shape,
      type: z.literal("TEXT_DELTA"),
      sequence: NonnegativeOrdinalSchema,
      operation_id: IdSchema,
      idempotency_key: IdempotencyKeySchema,
      fence_token: FenceTokenSchema,
      text: z.string().min(1),
    })
    .strict(),
  ModelToolRequestV1Schema,
  z
    .object({
      ...ExecutionReferenceV1Shape,
      type: z.literal("USAGE"),
      sequence: NonnegativeOrdinalSchema,
      operation_id: IdSchema,
      idempotency_key: IdempotencyKeySchema,
      fence_token: FenceTokenSchema,
      usage: ModelUsageV1Schema,
    })
    .strict(),
  z
    .object({
      ...ExecutionReferenceV1Shape,
      type: z.literal("COMPLETED"),
      sequence: NonnegativeOrdinalSchema,
      operation_id: IdSchema,
      idempotency_key: IdempotencyKeySchema,
      fence_token: FenceTokenSchema,
      finish_reason: z.enum([
        "STOP",
        "TOOL_REQUEST",
        "LENGTH",
        "CONTENT_FILTER",
      ]),
      output: z.string(),
      usage: ModelUsageV1Schema.nullable(),
    })
    .strict(),
  z
    .object({
      ...ExecutionReferenceV1Shape,
      type: z.literal("FAILED"),
      sequence: NonnegativeOrdinalSchema,
      operation_id: IdSchema,
      idempotency_key: IdempotencyKeySchema,
      fence_token: FenceTokenSchema,
      code: IdSchema,
      message: z.string().trim().min(1).max(4_000),
      retryable: z.boolean(),
    })
    .strict(),
  z
    .object({
      ...ExecutionReferenceV1Shape,
      type: z.literal("CANCELLED"),
      sequence: NonnegativeOrdinalSchema,
      operation_id: IdSchema,
      idempotency_key: IdempotencyKeySchema,
      fence_token: FenceTokenSchema,
      acknowledged_at: TimestampSchema,
    })
    .strict(),
]);
export type ModelEventV1 = z.infer<typeof ModelEventV1Schema>;

export const ExternalStructuredToolRequestV1Schema = z
  .object({
    protocol: z.literal("aillium.external-tool-request"),
    contract_version: RuntimeContractVersionSchema,
    type: z.literal("TOOL_REQUEST"),
    call_id: IdSchema,
    tool_name: z.string().regex(/^[a-z][a-z0-9_.-]{0,127}$/),
    arguments: JsonObjectSchema,
  })
  .strict()
  .superRefine((request, ctx) => {
    addJsonLimitIssues(request as JsonValue, ctx, {
      max_bytes: RuntimeJsonLimits.external_tool_max_bytes,
      max_depth: RuntimeJsonLimits.external_tool_max_depth,
      max_nodes: 10_000,
    });
  });
export type ExternalStructuredToolRequestV1 = z.infer<
  typeof ExternalStructuredToolRequestV1Schema
>;

const OperationIdentityV1Schema = z
  .object({
    ...ExecutionReferenceV1Shape,
    operation_id: IdSchema,
    idempotency_key: IdempotencyKeySchema,
    fence_token: FenceTokenSchema,
  })
  .strict();

export const ToolExecuteRequestV1Schema = OperationIdentityV1Schema.extend({
  tool_name: z.string().regex(/^[a-z][a-z0-9_.-]{0,127}$/),
  input: JsonObjectSchema,
  approval_id: IdSchema.nullable(),
  deadline_at: TimestampSchema,
}).strict();
export type ToolExecuteRequestV1 = z.infer<typeof ToolExecuteRequestV1Schema>;

const RuntimeErrorV1Schema = z
  .object({
    code: IdSchema,
    message: z.string().trim().min(1).max(4_000),
    retryable: z.boolean(),
  })
  .strict();

export const ToolExecuteResultV1Schema = OperationIdentityV1Schema.extend({
  status: z.enum(["SUCCEEDED", "FAILED", "CANCELLED", "UNKNOWN"]),
  output: JsonValueSchema,
  error: RuntimeErrorV1Schema.nullable(),
  side_effect: z
    .object({
      state: z.enum(["NONE", "APPLIED", "NOT_APPLIED", "UNKNOWN"]),
      external_reference: z.string().max(2_000).nullable(),
    })
    .strict(),
  reconciliation_required: z.boolean(),
  evidence_ids: z.array(IdSchema).max(1_000),
  replayed: z.boolean(),
  started_at: TimestampSchema,
  completed_at: TimestampSchema,
})
  .strict()
  .superRefine((result, ctx) => {
    const started = Date.parse(result.started_at);
    const completed = Date.parse(result.completed_at);
    if (started > completed) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["completed_at"],
        message: "completed_at must not precede started_at",
      });
    }
    if (result.status === "FAILED" && result.error === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["error"],
        message: "failed tool results require an error",
      });
    }
    if (result.status === "SUCCEEDED" && result.error !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["error"],
        message: "successful tool results cannot include an error",
      });
    }
    const allowedSideEffects: Record<typeof result.status, string[]> = {
      SUCCEEDED: ["NONE", "APPLIED"],
      FAILED: ["NOT_APPLIED", "UNKNOWN"],
      CANCELLED: ["NOT_APPLIED", "UNKNOWN"],
      UNKNOWN: ["UNKNOWN"],
    };
    if (!allowedSideEffects[result.status].includes(result.side_effect.state)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["side_effect", "state"],
        message: "side-effect state is inconsistent with tool result status",
      });
    }
    if (
      result.side_effect.state === "UNKNOWN" &&
      !result.reconciliation_required
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["reconciliation_required"],
        message: "unknown side effects require reconciliation before replay",
      });
    }
    if (
      result.side_effect.state !== "UNKNOWN" &&
      result.reconciliation_required
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["reconciliation_required"],
        message: "reconciliation is reserved for an unknown side effect",
      });
    }
  });
export type ToolExecuteResultV1 = z.infer<typeof ToolExecuteResultV1Schema>;

export const ToolCancelRequestV1Schema = OperationIdentityV1Schema.extend({
  cancellation_id: IdSchema,
  reason: z.string().trim().min(1).max(1_000),
  requested_at: TimestampSchema,
  acknowledge_by: TimestampSchema,
  force_by: TimestampSchema,
}).strict().superRefine((request, ctx) => {
  const requested = Date.parse(request.requested_at);
  const acknowledge = Date.parse(request.acknowledge_by);
  const force = Date.parse(request.force_by);
  if (acknowledge < requested || acknowledge - requested > 2_000) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["acknowledge_by"],
      message: "acknowledgement deadline must be within two seconds",
    });
  }
  if (force < acknowledge || force - requested > 5_000) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["force_by"],
      message: "forced-stop deadline must follow acknowledgement and be within five seconds",
    });
  }
});
export type ToolCancelRequestV1 = z.infer<typeof ToolCancelRequestV1Schema>;

export const CancellationMetadataV1Schema = z
  .object({
    cancellation_id: IdSchema,
    state: z.enum([
      "ACKNOWLEDGED",
      "ALREADY_TERMINAL",
      "UNSUPPORTED",
      "FAILED",
    ]),
    requested_at: TimestampSchema,
    acknowledge_by: TimestampSchema,
    force_by: TimestampSchema,
    acknowledged_at: TimestampSchema,
    acknowledgement_latency_ms: NonnegativeDurationSchema.max(5_000),
    forced_stop: z
      .object({
        required: z.boolean(),
        deadline_at: TimestampSchema,
        enforced_at: TimestampSchema.nullable(),
        mechanism: z.string().trim().min(1).max(255).nullable(),
        outcome: z
          .enum(["NOT_REQUIRED", "PENDING", "SUCCEEDED", "FAILED"]),
      })
      .strict(),
  })
  .strict()
  .superRefine((metadata, ctx) => {
    const requested = Date.parse(metadata.requested_at);
    const acknowledgeBy = Date.parse(metadata.acknowledge_by);
    const forceBy = Date.parse(metadata.force_by);
    const acknowledged = Date.parse(metadata.acknowledged_at);
    const enforced = metadata.forced_stop.enforced_at
      ? Date.parse(metadata.forced_stop.enforced_at)
      : null;
    if (
      acknowledgeBy < requested ||
      acknowledgeBy - requested > 2_000 ||
      acknowledged < requested ||
      acknowledged > acknowledgeBy ||
      metadata.acknowledgement_latency_ms !== acknowledged - requested
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["acknowledged_at"],
        message: "cancellation acknowledgement must correlate and complete within two seconds",
      });
    }
    if (
      forceBy < acknowledgeBy ||
      forceBy - requested > 5_000 ||
      metadata.forced_stop.deadline_at !== metadata.force_by
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["force_by"],
        message: "forced-stop metadata must correlate and remain within five seconds",
      });
    }
    if (!metadata.forced_stop.required && metadata.forced_stop.outcome !== "NOT_REQUIRED") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["forced_stop", "outcome"],
        message: "a non-required forced stop must use NOT_REQUIRED",
      });
    }
    if (
      !metadata.forced_stop.required &&
      (metadata.forced_stop.enforced_at !== null ||
        metadata.forced_stop.mechanism !== null)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["forced_stop"],
        message: "a non-required forced stop cannot include enforcement metadata",
      });
    }
    if (metadata.forced_stop.required && metadata.forced_stop.outcome === "NOT_REQUIRED") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["forced_stop", "outcome"],
        message: "a required forced stop must report pending, success, or failure",
      });
    }
    if (
      ["SUCCEEDED", "FAILED"].includes(metadata.forced_stop.outcome) &&
      (metadata.forced_stop.enforced_at === null ||
        metadata.forced_stop.mechanism === null)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["forced_stop"],
        message: "a completed forced stop requires enforced_at and mechanism",
      });
    }
    if (
      metadata.forced_stop.outcome === "PENDING" &&
      metadata.forced_stop.enforced_at !== null
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["forced_stop", "enforced_at"],
        message: "a pending forced stop cannot already be enforced",
      });
    }
    if (
      ["UNSUPPORTED", "FAILED"].includes(metadata.state) &&
      !metadata.forced_stop.required
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["forced_stop", "required"],
        message: "unsupported or failed cooperative cancellation requires forced stop",
      });
    }
    if (
      enforced !== null &&
      (enforced < requested || enforced > forceBy)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["forced_stop", "enforced_at"],
        message: "forced stop must be enforced no later than force_by",
      });
    }
  });
export type CancellationMetadataV1 = z.infer<
  typeof CancellationMetadataV1Schema
>;

export const ToolCancelResultV1Schema = OperationIdentityV1Schema.extend({
  cancellation: CancellationMetadataV1Schema,
}).strict();
export type ToolCancelResultV1 = z.infer<typeof ToolCancelResultV1Schema>;

/** Model and tool cancellation use the same timing and forced-stop contract. */
export const ModelCancelRequestV1Schema = ToolCancelRequestV1Schema;
export type ModelCancelRequestV1 = ToolCancelRequestV1;
export const ModelCancelResultV1Schema = ToolCancelResultV1Schema;
export type ModelCancelResultV1 = ToolCancelResultV1;

export const ToolReconcileRequestV1Schema = OperationIdentityV1Schema.extend({
  reason: z.enum([
    "RETRY_AFTER_TIMEOUT",
    "PROCESS_RECOVERY",
    "CANCELLATION",
    "OPERATOR_REQUEST",
  ]),
  requested_at: TimestampSchema,
}).strict();
export type ToolReconcileRequestV1 = z.infer<
  typeof ToolReconcileRequestV1Schema
>;

export const ToolReconcileResultV1Schema = OperationIdentityV1Schema.extend({
  state: z.enum([
    "NOT_FOUND",
    "IN_PROGRESS",
    "APPLIED",
    "NOT_APPLIED",
    "CANCELLED",
    "UNKNOWN",
  ]),
  output: JsonValueSchema,
  external_reference: z.string().max(2_000).nullable(),
  requested_at: TimestampSchema,
  reconciled_at: TimestampSchema,
  safe_to_replay: z.boolean(),
})
  .strict()
  .superRefine((result, ctx) => {
    if (Date.parse(result.requested_at) > Date.parse(result.reconciled_at)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["reconciled_at"],
        message: "reconciled_at must not precede requested_at",
      });
    }
    const replayable = ["NOT_FOUND", "NOT_APPLIED"].includes(result.state);
    if (result.safe_to_replay !== replayable) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["safe_to_replay"],
        message: "only NOT_FOUND or NOT_APPLIED outcomes are safe to replay",
      });
    }
    if (
      ["NOT_FOUND", "NOT_APPLIED", "IN_PROGRESS", "CANCELLED", "UNKNOWN"].includes(
        result.state,
      ) &&
      result.output !== null
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["output"],
        message: "only an applied reconciliation may include output",
      });
    }
  });
export type ToolReconcileResultV1 = z.infer<
  typeof ToolReconcileResultV1Schema
>;

export const RuntimeCheckpointV1Schema = z
  .object({
    contract_version: RuntimeContractVersionSchema,
    checkpoint_id: IdSchema,
    cursor: CheckpointCursorSchema,
    tenant_id: IdSchema,
    work_order_id: IdSchema,
    run_id: IdSchema,
    run_step_id: IdSchema,
    attempt: AttemptSchema,
    idempotency_key: IdempotencyKeySchema,
    fence_token: FenceTokenSchema,
    executor_id: IdSchema,
    lease_id: IdSchema,
    lease_epoch: PositiveOrdinalSchema,
    boundary: z.enum(["MODEL", "TOOL"]),
    phase: z.enum(["BEFORE", "AFTER"]),
    operation_id: IdSchema,
    state: z.enum([
      "READY",
      "SUCCEEDED",
      "FAILED",
      "CANCELLED",
      "UNKNOWN",
    ]),
    side_effect_state: z.enum([
      "NOT_APPLICABLE",
      "NOT_APPLIED",
      "APPLIED",
      "UNKNOWN",
    ]),
    reconciliation_required: z.boolean(),
    snapshot: JsonObjectSchema,
    created_at: TimestampSchema,
  })
  .strict()
  .superRefine((checkpoint, ctx) => {
    if (checkpoint.phase === "BEFORE" && checkpoint.state !== "READY") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["state"],
        message: "a BEFORE checkpoint must be READY",
      });
    }
    if (checkpoint.phase === "AFTER" && checkpoint.state === "READY") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["state"],
        message: "an AFTER checkpoint must be terminal or UNKNOWN",
      });
    }
    if (
      checkpoint.boundary === "MODEL" &&
      checkpoint.side_effect_state !== "NOT_APPLICABLE"
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["side_effect_state"],
        message: "model checkpoints cannot record a tool side effect",
      });
    }
    if (
      checkpoint.boundary === "MODEL" &&
      checkpoint.reconciliation_required
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["reconciliation_required"],
        message: "model checkpoints cannot require tool reconciliation",
      });
    }
    if (
      checkpoint.phase === "BEFORE" &&
      (checkpoint.reconciliation_required ||
        !["NOT_APPLICABLE", "NOT_APPLIED"].includes(
          checkpoint.side_effect_state,
        ))
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["side_effect_state"],
        message: "BEFORE checkpoints cannot claim or reconcile a side effect",
      });
    }
    if (
      checkpoint.side_effect_state === "UNKNOWN" &&
      !checkpoint.reconciliation_required
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["reconciliation_required"],
        message: "unknown checkpoint outcomes require reconciliation",
      });
    }
    if (
      (checkpoint.state === "UNKNOWN") !==
      (checkpoint.side_effect_state === "UNKNOWN")
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["side_effect_state"],
        message: "checkpoint state and side effect must become UNKNOWN together",
      });
    }
  });
export type RuntimeCheckpointV1 = z.infer<typeof RuntimeCheckpointV1Schema>;

export const RuntimeWireMessageTypeValues = [
  "MODEL_GENERATE_REQUEST",
  "MODEL_EVENT",
  "MODEL_CANCEL_REQUEST",
  "MODEL_CANCEL_RESULT",
  "TOOL_EXECUTE_REQUEST",
  "TOOL_EXECUTE_RESULT",
  "TOOL_CANCEL_REQUEST",
  "TOOL_CANCEL_RESULT",
  "TOOL_RECONCILE_REQUEST",
  "TOOL_RECONCILE_RESULT",
  "CHECKPOINT",
] as const;

const RuntimeWireEnvelopeBaseShape = {
  contract_version: RuntimeContractVersionSchema,
  envelope_id: IdSchema,
  emitted_at: TimestampSchema,
  context: ExecutionContextWireV1Schema,
};

/**
 * Typed JSON transport envelope. The discriminator selects the concrete
 * payload validator so a valid payload cannot be relabelled as another action.
 */
export const RuntimeWireEnvelopeV1Schema = z.discriminatedUnion("message_type", [
  z
    .object({
      ...RuntimeWireEnvelopeBaseShape,
      message_type: z.literal("MODEL_GENERATE_REQUEST"),
      payload: ModelGenerateRequestV1Schema,
    })
    .strict(),
  z
    .object({
      ...RuntimeWireEnvelopeBaseShape,
      message_type: z.literal("MODEL_EVENT"),
      payload: ModelEventV1Schema,
    })
    .strict(),
  z
    .object({
      ...RuntimeWireEnvelopeBaseShape,
      message_type: z.literal("MODEL_CANCEL_REQUEST"),
      payload: ModelCancelRequestV1Schema,
    })
    .strict(),
  z
    .object({
      ...RuntimeWireEnvelopeBaseShape,
      message_type: z.literal("MODEL_CANCEL_RESULT"),
      payload: ModelCancelResultV1Schema,
    })
    .strict(),
  z
    .object({
      ...RuntimeWireEnvelopeBaseShape,
      message_type: z.literal("TOOL_EXECUTE_REQUEST"),
      payload: ToolExecuteRequestV1Schema,
    })
    .strict(),
  z
    .object({
      ...RuntimeWireEnvelopeBaseShape,
      message_type: z.literal("TOOL_EXECUTE_RESULT"),
      payload: ToolExecuteResultV1Schema,
    })
    .strict(),
  z
    .object({
      ...RuntimeWireEnvelopeBaseShape,
      message_type: z.literal("TOOL_CANCEL_REQUEST"),
      payload: ToolCancelRequestV1Schema,
    })
    .strict(),
  z
    .object({
      ...RuntimeWireEnvelopeBaseShape,
      message_type: z.literal("TOOL_CANCEL_RESULT"),
      payload: ToolCancelResultV1Schema,
    })
    .strict(),
  z
    .object({
      ...RuntimeWireEnvelopeBaseShape,
      message_type: z.literal("TOOL_RECONCILE_REQUEST"),
      payload: ToolReconcileRequestV1Schema,
    })
    .strict(),
  z
    .object({
      ...RuntimeWireEnvelopeBaseShape,
      message_type: z.literal("TOOL_RECONCILE_RESULT"),
      payload: ToolReconcileResultV1Schema,
    })
    .strict(),
  z
    .object({
      ...RuntimeWireEnvelopeBaseShape,
      message_type: z.literal("CHECKPOINT"),
      payload: RuntimeCheckpointV1Schema,
    })
    .strict(),
]).superRefine((envelope, ctx) => {
  addJsonLimitIssues(envelope as JsonValue, ctx, {
    max_bytes: RuntimeJsonLimits.max_bytes,
    max_depth: RuntimeJsonLimits.max_depth,
    max_nodes: RuntimeJsonLimits.max_nodes,
  });
  const context = envelope.context;
  const payload = envelope.payload;
  const compare = (
    payloadKey: string,
    contextKey: keyof ExecutionContextWireV1,
  ): void => {
    if (
      payloadKey in payload &&
      (payload as Record<string, unknown>)[payloadKey] !== context[contextKey]
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["payload", payloadKey],
        message: `${payloadKey} must match context.${String(contextKey)}`,
      });
    }
  };

  compare("idempotency_key", "idempotency_key");
  compare("fence_token", "fence_token");
  compare("tenant_id", "tenant_id");
  compare("work_order_id", "work_order_id");
  compare("run_id", "run_id");
  compare("run_step_id", "run_step_id");
  compare("attempt", "attempt");

  if (envelope.message_type === "CHECKPOINT") {
    compare("tenant_id", "tenant_id");
    compare("work_order_id", "work_order_id");
    compare("run_id", "run_id");
    compare("run_step_id", "run_step_id");
    compare("attempt", "attempt");
    compare("executor_id", "executor_id");
    compare("lease_id", "lease_id");
    compare("lease_epoch", "lease_epoch");
    if (Date.parse(envelope.payload.created_at) > Date.parse(envelope.emitted_at)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["payload", "created_at"],
        message: "checkpoint creation cannot follow envelope emission",
      });
    }
  }

  if (
    envelope.message_type === "TOOL_EXECUTE_RESULT" &&
    Date.parse(envelope.payload.completed_at) > Date.parse(envelope.emitted_at)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["payload", "completed_at"],
      message: "tool completion cannot follow result envelope emission",
    });
  }

  if (
    envelope.message_type === "TOOL_RECONCILE_RESULT" &&
    Date.parse(envelope.payload.reconciled_at) > Date.parse(envelope.emitted_at)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["payload", "reconciled_at"],
      message: "reconciliation cannot follow result envelope emission",
    });
  }

  if (
    (envelope.message_type === "TOOL_CANCEL_RESULT" ||
      envelope.message_type === "MODEL_CANCEL_RESULT") &&
    Date.parse(envelope.payload.cancellation.acknowledged_at) >
      Date.parse(envelope.emitted_at)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["payload", "cancellation", "acknowledged_at"],
      message: "cancellation acknowledgement cannot follow result envelope emission",
    });
  }
  if (
    (envelope.message_type === "TOOL_CANCEL_RESULT" ||
      envelope.message_type === "MODEL_CANCEL_RESULT") &&
    Date.parse(envelope.emitted_at) >=
      Date.parse(envelope.payload.cancellation.force_by) &&
    envelope.payload.cancellation.forced_stop.required &&
    envelope.payload.cancellation.forced_stop.outcome === "PENDING"
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["payload", "cancellation", "forced_stop", "outcome"],
      message: "forced stop must be terminal once force_by has elapsed",
    });
  }

  if (envelope.message_type === "MODEL_GENERATE_REQUEST") {
    const target = envelope.payload.target;
    const ceiling = context.budget.model_ceilings[target.fallback_index];
    if (
      !ceiling ||
      ceiling.provider !== target.provider ||
      ceiling.model !== target.model
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["payload", "target"],
        message: "selected model and fallback index must match its budget ceiling",
      });
    }
  }

  if (
    envelope.message_type === "TOOL_EXECUTE_REQUEST" &&
    Date.parse(envelope.payload.deadline_at) >
      Date.parse(context.budget.deadline_at)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["payload", "deadline_at"],
      message: "tool deadline cannot exceed the execution deadline",
    });
  }

  if (Date.parse(envelope.emitted_at) > Date.parse(context.lease_expires_at)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["emitted_at"],
      message: "runtime envelope cannot be emitted after lease expiry",
    });
  }
});
export type RuntimeWireEnvelopeV1 = z.infer<
  typeof RuntimeWireEnvelopeV1Schema
>;

export interface ModelAdapterV1 {
  readonly descriptor: ModelDescriptorV1;
  generate(
    request: ModelGenerateRequestV1,
    context: ExecutionContextV1,
  ): AsyncIterable<ModelEventV1>;
  cancel(
    request: ModelCancelRequestV1,
    context: ExecutionContextV1,
  ): Promise<ModelCancelResultV1>;
}

export interface ToolAdapterV1 {
  readonly descriptor: ToolDescriptorV1;
  execute(
    request: ToolExecuteRequestV1,
    context: ExecutionContextV1,
  ): Promise<ToolExecuteResultV1>;
  cancel(
    request: ToolCancelRequestV1,
    context: ExecutionContextV1,
  ): Promise<ToolCancelResultV1>;
  reconcile(
    request: ToolReconcileRequestV1,
    context: ExecutionContextV1,
  ): Promise<ToolReconcileResultV1>;
}
