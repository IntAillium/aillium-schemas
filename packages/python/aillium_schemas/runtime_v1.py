"""Python-facing mirror for the provider-neutral runtime v1 wire envelope.

Detailed payload semantics remain owned by the canonical JSON Schema and the
TypeScript Zod contracts. This module validates transport identity, casing,
budget ledger integrity, lease identity, and envelope/payload correlation
without creating a second execution state machine.
"""

from __future__ import annotations

import copy
import json
import math
import re
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from types import MappingProxyType
from typing import Any, Mapping

RUNTIME_CONTRACT_VERSION = "1.0"
RUNTIME_MAX_BYTES = 1_048_576
RUNTIME_MAX_DEPTH = 32
RUNTIME_MAX_NODES = 100_000
_SCHEMA_PATH = (
    Path(__file__).resolve().parent
    / "schemas"
    / "runtime"
    / "provider-neutral-runtime-v1.schema.json"
)
_RUNTIME_SCHEMA = json.loads(_SCHEMA_PATH.read_text())
_EXECUTION_CONTEXT_SCHEMA = _RUNTIME_SCHEMA["oneOf"][0]["oneOf"][0]["properties"][
    "context"
]


def _freeze(value: Any) -> Any:
    if isinstance(value, Mapping):
        return MappingProxyType({key: _freeze(child) for key, child in value.items()})
    if isinstance(value, (list, tuple)):
        return tuple(_freeze(child) for child in value)
    return value


def _thaw(value: Any) -> Any:
    if isinstance(value, Mapping):
        return {key: _thaw(child) for key, child in value.items()}
    if isinstance(value, tuple):
        return [_thaw(child) for child in value]
    return copy.deepcopy(value)


def _measure_json(value: Any) -> tuple[int, int, int]:
    size = len(
        json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    )
    depth = 0
    nodes = 0
    stack = [(value, 1)]
    while stack:
        current, current_depth = stack.pop()
        depth = max(depth, current_depth)
        nodes += 1
        if isinstance(current, Mapping):
            if any(not isinstance(key, str) for key in current):
                raise ValueError("runtime JSON object keys must be strings")
            stack.extend((child, current_depth + 1) for child in current.values())
        elif isinstance(current, (list, tuple)):
            stack.extend((child, current_depth + 1) for child in current)
        elif isinstance(current, float) and not math.isfinite(current):
            raise ValueError("runtime JSON numbers must be finite")
    return size, depth, nodes


def _validate_json_limits(value: Any) -> None:
    size, depth, nodes = _measure_json(value)
    if size > RUNTIME_MAX_BYTES:
        raise ValueError("runtime JSON exceeds 1 MiB")
    if depth > RUNTIME_MAX_DEPTH:
        raise ValueError("runtime JSON exceeds maximum depth")
    if nodes > RUNTIME_MAX_NODES:
        raise ValueError("runtime JSON exceeds maximum node count")


def _validate_json_schema(value: Any, schema: Mapping[str, Any], path: str) -> Any:
    if "oneOf" in schema:
        matches: list[Any] = []
        for option in schema["oneOf"]:
            try:
                matches.append(_validate_json_schema(value, option, path))
            except ValueError:
                pass
        if len(matches) != 1:
            raise ValueError(f"{path} must match exactly one schema variant")
        return matches[0]
    if "const" in schema and value != schema["const"]:
        raise ValueError(f"{path} must equal {schema['const']!r}")
    if "enum" in schema and value not in schema["enum"]:
        raise ValueError(f"{path} has an unsupported value")
    expected_type = schema.get("type")
    if expected_type == "object":
        if not isinstance(value, Mapping):
            raise ValueError(f"{path} must be an object")
        required = set(schema.get("required", []))
        missing = required - set(value)
        if missing:
            raise ValueError(f"{path} missing required fields {sorted(missing)}")
        properties = schema.get("properties", {})
        if schema.get("additionalProperties") is False:
            extras = set(value) - set(properties)
            if extras:
                raise ValueError(f"{path} has extra fields {sorted(extras)}")
        normalized: dict[str, Any] = {}
        for key, child in value.items():
            child_schema = properties.get(key, schema.get("additionalProperties"))
            if isinstance(child_schema, Mapping):
                normalized[key] = _validate_json_schema(
                    child, child_schema, f"{path}.{key}"
                )
            else:
                normalized[key] = copy.deepcopy(child)
        return normalized
    elif expected_type == "array":
        if not isinstance(value, (list, tuple)):
            raise ValueError(f"{path} must be an array")
        if len(value) < schema.get("minItems", 0) or len(value) > schema.get(
            "maxItems", float("inf")
        ):
            raise ValueError(f"{path} array length is outside bounds")
        return [
            _validate_json_schema(child, schema.get("items", {}), f"{path}[{index}]")
            for index, child in enumerate(value)
        ]
    elif expected_type == "string":
        if not isinstance(value, str):
            raise ValueError(f"{path} must be a string")
        if schema.get("x-zod-trim") is True:
            value = value.strip()
        if len(value) < schema.get("minLength", 0) or len(value) > schema.get(
            "maxLength", float("inf")
        ):
            raise ValueError(f"{path} string length is outside bounds")
        if "pattern" in schema and re.search(schema["pattern"], value) is None:
            raise ValueError(f"{path} does not match its pattern")
        if schema.get("format") == "date-time":
            _timestamp(value, path)
        return value
    elif expected_type == "integer":
        if not isinstance(value, int) or isinstance(value, bool):
            raise ValueError(f"{path} must be an integer")
        if value < schema.get("minimum", float("-inf")) or value > schema.get(
            "maximum", float("inf")
        ):
            raise ValueError(f"{path} integer is outside bounds")
        if value <= schema.get("exclusiveMinimum", float("-inf")):
            raise ValueError(f"{path} integer is below its exclusive minimum")
        if value >= schema.get("exclusiveMaximum", float("inf")):
            raise ValueError(f"{path} integer is above its exclusive maximum")
        return value
    elif expected_type == "number":
        if not isinstance(value, (int, float)) or isinstance(value, bool):
            raise ValueError(f"{path} must be a number")
        if not math.isfinite(value):
            raise ValueError(f"{path} must be finite")
        return value
    elif expected_type == "boolean" and not isinstance(value, bool):
        raise ValueError(f"{path} must be a boolean")
    elif expected_type == "null" and value is not None:
        raise ValueError(f"{path} must be null")
    return copy.deepcopy(value)


def _timestamp(value: Any, field: str) -> datetime:
    if not isinstance(value, str):
        raise ValueError(f"{field} must be an RFC3339 timestamp")
    match = re.fullmatch(
        r"(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|([+-])(\d{2}):(\d{2}))",
        value,
    )
    if match is None:
        raise ValueError(f"{field} must include RFC3339 time and offset")
    offset_hour = match.group(8)
    offset_minute = match.group(9)
    if offset_hour is not None and (
        int(offset_hour) > 23 or int(offset_minute) > 59
    ):
        raise ValueError(f"{field} has an invalid RFC3339 offset")
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError(f"{field} must be an RFC3339 timestamp") from exc


def _positive_int(value: Any, field: str) -> int:
    if not isinstance(value, int) or isinstance(value, bool) or value <= 0:
        raise ValueError(f"{field} must be a positive integer")
    return value


def _nonempty(value: Any, field: str) -> str:
    if not isinstance(value, str) or not value or value != value.strip():
        raise ValueError(f"{field} must be a non-empty string")
    return value


def _exact_keys(value: Mapping[str, Any], expected: set[str], field: str) -> None:
    actual = set(value)
    if actual != expected:
        raise ValueError(
            f"{field} fields mismatch; missing={sorted(expected - actual)}, "
            f"extra={sorted(actual - expected)}"
        )


@dataclass(frozen=True)
class ExecutionContextWireV1:
    contract_version: str
    tenant_id: str
    work_order_id: str
    run_id: str
    run_step_id: str
    attempt: int
    idempotency_key: str
    fence_token: str
    checkpoint_cursor: str | None
    executor_id: str
    lease_id: str
    lease_epoch: int
    lease_expires_at: str
    budget: Mapping[str, Any]
    budget_ledger: Mapping[str, Any]

    @classmethod
    def from_wire(cls, value: Mapping[str, Any]) -> "ExecutionContextWireV1":
        _validate_json_limits(value)
        value = _validate_json_schema(
            value, _EXECUTION_CONTEXT_SCHEMA, "execution context"
        )
        expected = {
            "contract_version",
            "tenant_id",
            "work_order_id",
            "run_id",
            "run_step_id",
            "attempt",
            "idempotency_key",
            "fence_token",
            "checkpoint_cursor",
            "executor_id",
            "lease_id",
            "lease_epoch",
            "lease_expires_at",
            "budget",
            "budget_ledger",
        }
        _exact_keys(value, expected, "context")
        if value["contract_version"] != RUNTIME_CONTRACT_VERSION:
            raise ValueError("unsupported runtime contract version")
        for field in (
            "tenant_id",
            "work_order_id",
            "run_id",
            "run_step_id",
            "idempotency_key",
            "executor_id",
            "lease_id",
        ):
            _nonempty(value[field], field)
        _positive_int(value["attempt"], "attempt")
        _positive_int(value["lease_epoch"], "lease_epoch")
        fence_token = _nonempty(value["fence_token"], "fence_token")
        if re.fullmatch(r"(?:0|[1-9]\d*)", fence_token) is None:
            raise ValueError("fence_token must be an unsigned decimal string")
        _timestamp(value["lease_expires_at"], "lease_expires_at")
        if not isinstance(value["budget"], Mapping) or not isinstance(
            value["budget_ledger"], Mapping
        ):
            raise ValueError("budget and budget_ledger must be objects")
        cls._validate_budget(value["budget"], value["budget_ledger"])
        return cls(
            **{
                **dict(value),
                "budget": _freeze(value["budget"]),
                "budget_ledger": _freeze(value["budget_ledger"]),
            }
        )

    @staticmethod
    def _validate_budget(
        budget: Mapping[str, Any], ledger: Mapping[str, Any]
    ) -> None:
        if budget.get("max_total_tokens") != budget.get(
            "max_input_tokens", -1
        ) + budget.get("max_output_tokens", -1):
            raise ValueError("budget total tokens must equal input plus output")
        limit_map = {
            "duration_ms": "max_duration_ms",
            "model_calls": "max_model_calls",
            "tool_calls": "max_tool_calls",
            "retries": "max_retries",
            "revisions": "max_revision_count",
            "input_tokens": "max_input_tokens",
            "output_tokens": "max_output_tokens",
            "total_tokens": "max_total_tokens",
        }
        consumed = ledger.get("consumed")
        remaining = ledger.get("remaining")
        if not isinstance(consumed, Mapping) or not isinstance(remaining, Mapping):
            raise ValueError("budget ledger requires consumed and remaining objects")
        for label, counter in (("consumed", consumed), ("remaining", remaining)):
            if counter.get("total_tokens") != counter.get(
                "input_tokens", -1
            ) + counter.get("output_tokens", -1):
                raise ValueError(f"{label} total tokens must equal input plus output")
        for counter, limit in limit_map.items():
            if consumed.get(counter, -1) + remaining.get(counter, -1) != budget.get(
                limit
            ):
                raise ValueError(f"budget ledger {counter} does not balance")
        max_cost = budget.get("max_cost")
        if not isinstance(max_cost, Mapping):
            raise ValueError("max_cost must be an object")
        if (
            consumed.get("cost_minor_units", -1)
            + remaining.get("cost_minor_units", -1)
            != max_cost.get("minor_units")
        ):
            raise ValueError("budget ledger cost_minor_units does not balance")
        if ledger.get("currency") != max_cost.get("currency"):
            raise ValueError("budget ledger currency does not match max_cost")
        ceilings_value = budget.get("model_ceilings")
        consumption_value = ledger.get("model_consumption")
        if not isinstance(ceilings_value, (list, tuple)) or not isinstance(
            consumption_value, (list, tuple)
        ):
            raise ValueError("model ceilings and consumption must be arrays")
        ceilings: dict[tuple[Any, Any], Mapping[str, Any]] = {}
        for ceiling in ceilings_value:
            if not isinstance(ceiling, Mapping):
                raise ValueError("model ceiling must be an object")
            key = (ceiling.get("provider"), ceiling.get("model"))
            if key in ceilings:
                raise ValueError("model ceilings must be unique")
            ceilings[key] = ceiling
            if (
                ceiling.get("max_total_tokens")
                != ceiling.get("max_input_tokens", -1)
                + ceiling.get("max_output_tokens", -1)
                or
                ceiling.get("max_calls", 0) > budget.get("max_model_calls", -1)
                or ceiling.get("max_input_tokens", 0)
                > budget.get("max_input_tokens", -1)
                or ceiling.get("max_output_tokens", 0)
                > budget.get("max_output_tokens", -1)
                or ceiling.get("max_total_tokens", 0)
                > budget.get("max_total_tokens", -1)
                or ceiling.get("max_cost_minor_units", 0)
                > max_cost.get("minor_units", -1)
            ):
                raise ValueError("model ceiling exceeds the global budget")
        totals = {
            "model_calls": 0,
            "input_tokens": 0,
            "output_tokens": 0,
            "total_tokens": 0,
            "cost_minor_units": 0,
        }
        seen: set[tuple[Any, Any]] = set()
        for use in consumption_value:
            if not isinstance(use, Mapping):
                raise ValueError("model consumption must be an object")
            key = (use.get("provider"), use.get("model"))
            if key in seen:
                raise ValueError("model consumption must be unique")
            seen.add(key)
            ceiling = ceilings.get(key)
            if ceiling is None:
                raise ValueError("model consumption has no declared ceiling")
            comparisons = {
                "calls": "max_calls",
                "input_tokens": "max_input_tokens",
                "output_tokens": "max_output_tokens",
                "total_tokens": "max_total_tokens",
                "cost_minor_units": "max_cost_minor_units",
            }
            if use.get("total_tokens") != use.get("input_tokens", -1) + use.get(
                "output_tokens", -1
            ):
                raise ValueError("model consumption total tokens do not balance")
            for used_field, maximum_field in comparisons.items():
                used = use.get(used_field, -1)
                if used < 0 or used > ceiling.get(maximum_field, -1):
                    raise ValueError("model consumption exceeds its ceiling")
            totals["model_calls"] += use["calls"]
            for field in (
                "input_tokens",
                "output_tokens",
                "total_tokens",
                "cost_minor_units",
            ):
                totals[field] += use[field]
        for field, total in totals.items():
            if consumed.get(field) != total:
                raise ValueError(f"consumed {field} does not match model consumption")

    def to_wire(self) -> dict[str, Any]:
        return copy.deepcopy(
            {
                "contract_version": self.contract_version,
                "tenant_id": self.tenant_id,
                "work_order_id": self.work_order_id,
                "run_id": self.run_id,
                "run_step_id": self.run_step_id,
                "attempt": self.attempt,
                "idempotency_key": self.idempotency_key,
                "fence_token": self.fence_token,
                "checkpoint_cursor": self.checkpoint_cursor,
                "executor_id": self.executor_id,
                "lease_id": self.lease_id,
                "lease_epoch": self.lease_epoch,
                "lease_expires_at": self.lease_expires_at,
                "budget": _thaw(self.budget),
                "budget_ledger": _thaw(self.budget_ledger),
            }
        )


def _milliseconds(start: str, end: str) -> int:
    return int((_timestamp(end, "end") - _timestamp(start, "start")).total_seconds() * 1000)


def _validate_cancel_request(payload: Mapping[str, Any]) -> None:
    acknowledge_ms = _milliseconds(payload["requested_at"], payload["acknowledge_by"])
    force_ms = _milliseconds(payload["requested_at"], payload["force_by"])
    if acknowledge_ms < 0 or acknowledge_ms > 2_000:
        raise ValueError("cancellation acknowledgement deadline exceeds two seconds")
    if force_ms < acknowledge_ms or force_ms > 5_000:
        raise ValueError("forced-stop deadline exceeds five seconds")


def _validate_cancellation(metadata: Mapping[str, Any], emitted_at: str) -> None:
    _validate_cancel_request(metadata)
    acknowledgement_ms = _milliseconds(
        metadata["requested_at"], metadata["acknowledged_at"]
    )
    if (
        acknowledgement_ms < 0
        or acknowledgement_ms > 2_000
        or _timestamp(metadata["acknowledged_at"], "acknowledged_at")
        > _timestamp(metadata["acknowledge_by"], "acknowledge_by")
        or metadata["acknowledgement_latency_ms"] != acknowledgement_ms
        or _timestamp(metadata["acknowledged_at"], "acknowledged_at")
        > _timestamp(emitted_at, "emitted_at")
    ):
        raise ValueError("cancellation acknowledgement metadata does not correlate")
    forced = metadata["forced_stop"]
    if forced["deadline_at"] != metadata["force_by"]:
        raise ValueError("forced-stop deadline does not correlate")
    if not forced["required"]:
        if (
            forced["outcome"] != "NOT_REQUIRED"
            or forced["enforced_at"] is not None
            or forced["mechanism"] is not None
        ):
            raise ValueError("non-required forced stop contains enforcement metadata")
    else:
        if forced["outcome"] == "NOT_REQUIRED":
            raise ValueError("required forced stop cannot be NOT_REQUIRED")
        if forced["outcome"] in ("SUCCEEDED", "FAILED"):
            if forced["enforced_at"] is None or forced["mechanism"] is None:
                raise ValueError("completed forced stop lacks enforcement metadata")
        if forced["outcome"] == "PENDING" and forced["enforced_at"] is not None:
            raise ValueError("pending forced stop cannot already be enforced")
    if metadata["state"] in ("UNSUPPORTED", "FAILED") and not forced["required"]:
        raise ValueError("failed cooperative cancellation requires forced stop")
    if (
        forced["required"]
        and forced["outcome"] == "PENDING"
        and _timestamp(emitted_at, "emitted_at")
        >= _timestamp(metadata["force_by"], "force_by")
    ):
        raise ValueError("forced stop must be terminal after force_by")
    if forced["enforced_at"] is not None:
        enforced = _timestamp(forced["enforced_at"], "enforced_at")
        if (
            enforced < _timestamp(metadata["requested_at"], "requested_at")
            or enforced > _timestamp(metadata["force_by"], "force_by")
            or enforced > _timestamp(emitted_at, "emitted_at")
        ):
            raise ValueError("forced stop was not enforced inside its deadline")


def _validate_runtime_payload(
    message_type: str,
    payload: Mapping[str, Any],
    context: ExecutionContextWireV1,
    emitted_at: str,
) -> None:
    for field in (
        "tenant_id",
        "work_order_id",
        "run_id",
        "run_step_id",
        "attempt",
        "idempotency_key",
        "fence_token",
    ):
        if field in payload and payload[field] != getattr(context, field):
            raise ValueError(f"payload {field} must match context")

    if message_type == "MODEL_GENERATE_REQUEST":
        if payload["tool_mode"] == "NONE" and payload["tools"]:
            raise ValueError("tool definitions require an active tool mode")
        tool_names = [tool["name"] for tool in payload["tools"]]
        if len(tool_names) != len(set(tool_names)):
            raise ValueError("tool definitions must have unique names")
        target = payload["target"]
        ceilings = context.budget["model_ceilings"]
        index = target["fallback_index"]
        if (
            index >= len(ceilings)
            or ceilings[index]["provider"] != target["provider"]
            or ceilings[index]["model"] != target["model"]
        ):
            raise ValueError("model target does not match its fallback ceiling")
    elif message_type == "MODEL_EVENT":
        if payload["type"] == "CANCELLED" and _timestamp(
            payload["acknowledged_at"], "acknowledged_at"
        ) > _timestamp(emitted_at, "emitted_at"):
            raise ValueError("model cancellation acknowledgement follows emission")
    elif message_type == "TOOL_EXECUTE_REQUEST":
        if _timestamp(payload["deadline_at"], "deadline_at") > _timestamp(
            context.budget["deadline_at"], "deadline_at"
        ):
            raise ValueError("tool deadline exceeds execution deadline")
    elif message_type == "TOOL_EXECUTE_RESULT":
        started = _timestamp(payload["started_at"], "started_at")
        completed = _timestamp(payload["completed_at"], "completed_at")
        if started > completed or completed > _timestamp(emitted_at, "emitted_at"):
            raise ValueError("tool result chronology is invalid")
        if payload["status"] == "FAILED" and payload["error"] is None:
            raise ValueError("failed tool result requires an error")
        if payload["status"] == "SUCCEEDED" and payload["error"] is not None:
            raise ValueError("successful tool result cannot contain an error")
        allowed = {
            "SUCCEEDED": {"NONE", "APPLIED"},
            "FAILED": {"NOT_APPLIED", "UNKNOWN"},
            "CANCELLED": {"NOT_APPLIED", "UNKNOWN"},
            "UNKNOWN": {"UNKNOWN"},
        }
        side_effect = payload["side_effect"]["state"]
        if side_effect not in allowed[payload["status"]]:
            raise ValueError("tool result and side-effect state diverge")
        if payload["reconciliation_required"] != (side_effect == "UNKNOWN"):
            raise ValueError("unknown side effect must require reconciliation")
    elif message_type in ("MODEL_CANCEL_REQUEST", "TOOL_CANCEL_REQUEST"):
        _validate_cancel_request(payload)
    elif message_type in ("MODEL_CANCEL_RESULT", "TOOL_CANCEL_RESULT"):
        _validate_cancellation(payload["cancellation"], emitted_at)
    elif message_type == "TOOL_RECONCILE_RESULT":
        requested = _timestamp(payload["requested_at"], "requested_at")
        reconciled = _timestamp(payload["reconciled_at"], "reconciled_at")
        if requested > reconciled or reconciled > _timestamp(emitted_at, "emitted_at"):
            raise ValueError("reconciliation chronology is invalid")
        replayable = payload["state"] in ("NOT_FOUND", "NOT_APPLIED")
        if payload["safe_to_replay"] != replayable:
            raise ValueError("unsafe reconciliation cannot be replayed")
        if payload["state"] != "APPLIED" and payload["output"] is not None:
            raise ValueError("only applied reconciliation may include output")
    elif message_type == "CHECKPOINT":
        for field in (
            "tenant_id",
            "work_order_id",
            "run_id",
            "run_step_id",
            "attempt",
            "idempotency_key",
            "fence_token",
            "executor_id",
            "lease_id",
            "lease_epoch",
        ):
            if payload[field] != getattr(context, field):
                raise ValueError(f"checkpoint {field} must match context")
        if _timestamp(payload["created_at"], "created_at") > _timestamp(
            emitted_at, "emitted_at"
        ):
            raise ValueError("checkpoint creation follows envelope emission")
        if payload["phase"] == "BEFORE":
            if (
                payload["state"] != "READY"
                or payload["reconciliation_required"]
                or payload["side_effect_state"]
                not in ("NOT_APPLICABLE", "NOT_APPLIED")
            ):
                raise ValueError("BEFORE checkpoint state is invalid")
        elif payload["state"] == "READY":
            raise ValueError("AFTER checkpoint cannot remain READY")
        if payload["boundary"] == "MODEL" and (
            payload["side_effect_state"] != "NOT_APPLICABLE"
            or payload["reconciliation_required"]
        ):
            raise ValueError("model checkpoint cannot contain tool side effects")
        if payload["side_effect_state"] == "UNKNOWN" and not payload[
            "reconciliation_required"
        ]:
            raise ValueError("unknown checkpoint requires reconciliation")
        if (payload["state"] == "UNKNOWN") != (
            payload["side_effect_state"] == "UNKNOWN"
        ):
            raise ValueError("checkpoint state and side effect must become unknown together")


@dataclass(frozen=True)
class RuntimeWireEnvelopeV1:
    contract_version: str
    envelope_id: str
    message_type: str
    emitted_at: str
    context: ExecutionContextWireV1
    payload: Mapping[str, Any]

    @classmethod
    def from_wire(cls, value: Mapping[str, Any]) -> "RuntimeWireEnvelopeV1":
        _validate_json_limits(value)
        value = _validate_json_schema(
            value, _RUNTIME_SCHEMA["oneOf"][0], "runtime envelope"
        )
        _exact_keys(
            value,
            {
                "contract_version",
                "envelope_id",
                "message_type",
                "emitted_at",
                "context",
                "payload",
            },
            "runtime envelope",
        )
        if value["contract_version"] != RUNTIME_CONTRACT_VERSION:
            raise ValueError("unsupported runtime contract version")
        _nonempty(value["envelope_id"], "envelope_id")
        _timestamp(value["emitted_at"], "emitted_at")
        if not isinstance(value["context"], Mapping) or not isinstance(
            value["payload"], Mapping
        ):
            raise ValueError("context and payload must be objects")
        context = ExecutionContextWireV1.from_wire(value["context"])
        payload = _freeze(value["payload"])
        if _timestamp(value["emitted_at"], "emitted_at") > _timestamp(
            context.lease_expires_at, "lease_expires_at"
        ):
            raise ValueError("runtime envelope was emitted after lease expiry")
        _validate_runtime_payload(
            value["message_type"], payload, context, value["emitted_at"]
        )
        return cls(
            contract_version=value["contract_version"],
            envelope_id=value["envelope_id"],
            message_type=value["message_type"],
            emitted_at=value["emitted_at"],
            context=context,
            payload=payload,
        )

    def to_wire(self) -> dict[str, Any]:
        return copy.deepcopy(
            {
                "contract_version": self.contract_version,
                "envelope_id": self.envelope_id,
                "message_type": self.message_type,
                "emitted_at": self.emitted_at,
                "context": self.context.to_wire(),
                "payload": _thaw(self.payload),
            }
        )


@dataclass(frozen=True)
class ExecutorLeaseWireEnvelopeV1:
    contract_version: str
    envelope_id: str
    message_type: str
    emitted_at: str
    payload: Mapping[str, Any]

    @classmethod
    def from_wire(cls, value: Mapping[str, Any]) -> "ExecutorLeaseWireEnvelopeV1":
        _validate_json_limits(value)
        value = _validate_json_schema(
            value, _RUNTIME_SCHEMA["oneOf"][1], "lease envelope"
        )
        payload = value["payload"]
        emitted = _timestamp(value["emitted_at"], "emitted_at")
        message_type = value["message_type"]
        if message_type in ("LEASE_ACQUIRE_REQUEST", "LEASE_RENEW_REQUEST"):
            if _timestamp(payload["requested_at"], "requested_at") > emitted:
                raise ValueError("lease request follows envelope emission")
        if message_type == "LEASE_RENEW_REQUEST" and (
            _timestamp(payload["requested_at"], "requested_at")
            >= _timestamp(payload["lease_expires_at"], "lease_expires_at")
            or emitted > _timestamp(payload["lease_expires_at"], "lease_expires_at")
        ):
            raise ValueError("renewal request is outside the active lease")
        if message_type == "LEASE_ACQUIRE_RESULT":
            requested = _timestamp(payload["requested_at"], "requested_at")
            decided = _timestamp(payload["decided_at"], "decided_at")
            if requested > decided or decided > emitted:
                raise ValueError("lease acquisition chronology is invalid")
            lease_fields = (
                payload["lease_id"],
                payload["lease_epoch"],
                payload["fence_token"],
                payload["lease_expires_at"],
            )
            if payload["status"] == "ACQUIRED":
                if any(field is None for field in lease_fields) or payload[
                    "rejection_reason"
                ] is not None:
                    raise ValueError("acquired lease fields are incomplete")
                if _timestamp(
                    payload["lease_expires_at"], "lease_expires_at"
                ) <= decided:
                    raise ValueError("acquired lease expiry must follow decision")
            elif any(field is not None for field in lease_fields) or payload[
                "rejection_reason"
            ] is None:
                raise ValueError("rejected lease fields are inconsistent")
        elif message_type == "LEASE_RENEW_RESULT":
            requested = _timestamp(payload["requested_at"], "requested_at")
            decided = _timestamp(payload["decided_at"], "decided_at")
            if requested > decided or decided > emitted:
                raise ValueError("lease renewal chronology is invalid")
            if payload["status"] == "RENEWED":
                if payload["lease_expires_at"] is None or payload["reason"] is not None:
                    raise ValueError("renewed lease fields are incomplete")
                if decided > _timestamp(
                    payload["previous_expires_at"], "previous_expires_at"
                ):
                    raise ValueError("an expired lease cannot be renewed")
                if _timestamp(
                    payload["lease_expires_at"], "lease_expires_at"
                ) <= _timestamp(payload["previous_expires_at"], "previous_expires_at"):
                    raise ValueError("renewed lease expiry did not advance")
            elif payload["lease_expires_at"] is not None or payload["reason"] is None:
                raise ValueError("lost/rejected renewal fields are inconsistent")
        elif message_type == "EXECUTOR_HEARTBEAT":
            last_activity = _timestamp(payload["last_activity_at"], "last_activity_at")
            heartbeat_at = _timestamp(payload["emitted_at"], "payload.emitted_at")
            expires = _timestamp(payload["lease_expires_at"], "lease_expires_at")
            if last_activity > heartbeat_at or heartbeat_at > expires or heartbeat_at > emitted:
                raise ValueError("heartbeat chronology is outside its active lease")
        elif message_type == "LEASE_LOSS":
            if _timestamp(payload["detected_at"], "detected_at") > emitted:
                raise ValueError("lease loss detection follows envelope emission")
            if payload["reason"] == "FENCED":
                if payload["replacement_fence_token"] is None:
                    raise ValueError("fenced lease loss lacks replacement fence")
                if int(payload["replacement_fence_token"]) <= int(
                    payload["fence_token"]
                ):
                    raise ValueError("replacement fence token must strictly advance")
            elif payload["replacement_fence_token"] is not None:
                raise ValueError("replacement fence is only valid for fenced loss")
            if payload["reason"] == "EXPIRED" and _timestamp(
                payload["detected_at"], "detected_at"
            ) < _timestamp(payload["lease_expires_at"], "lease_expires_at"):
                raise ValueError("expired lease was reported before expiry")
        return cls(
            contract_version=value["contract_version"],
            envelope_id=value["envelope_id"],
            message_type=message_type,
            emitted_at=value["emitted_at"],
            payload=_freeze(payload),
        )

    def to_wire(self) -> dict[str, Any]:
        return {
            "contract_version": self.contract_version,
            "envelope_id": self.envelope_id,
            "message_type": self.message_type,
            "emitted_at": self.emitted_at,
            "payload": _thaw(self.payload),
        }
