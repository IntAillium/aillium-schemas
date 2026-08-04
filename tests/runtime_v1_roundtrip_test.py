"""Cross-language runtime-v1 fixture and snake_case parity tests."""

from __future__ import annotations

import copy
import importlib.util
import json
import pathlib
import sys
import unittest

ROOT = pathlib.Path(__file__).resolve().parent.parent
MODULE_PATH = (
    ROOT / "packages" / "python" / "aillium_schemas" / "runtime_v1.py"
)
SPEC = importlib.util.spec_from_file_location("aillium_runtime_v1", MODULE_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


def load_fixture(name: str) -> dict:
    return json.loads((ROOT / "fixtures" / "runtime-v1" / name).read_text())


class RuntimeV1RoundTripTests(unittest.TestCase):
    def test_embedded_json_schema_matches_canonical(self):
        canonical = json.loads(
            (
                ROOT
                / "schemas"
                / "runtime"
                / "provider-neutral-runtime-v1.schema.json"
            ).read_text()
        )
        embedded = json.loads(
            (
                ROOT
                / "packages"
                / "python"
                / "aillium_schemas"
                / "schemas"
                / "runtime"
                / "provider-neutral-runtime-v1.schema.json"
            ).read_text()
        )
        self.assertEqual(embedded, canonical)

    def test_execution_context_schema_uses_only_snake_case(self):
        schema = json.loads(
            (
                ROOT
                / "schemas"
                / "runtime"
                / "provider-neutral-runtime-v1.schema.json"
            ).read_text()
        )
        fields = schema["oneOf"][0]["oneOf"][0]["properties"]["context"]["required"]
        self.assertTrue(all(field == field.lower() for field in fields))
        self.assertFalse(any(any(character.isupper() for character in field) for field in fields))

    def test_valid_fixture_round_trips_without_casing_drift(self):
        fixture = load_fixture("valid-tool-execute-envelope.json")
        parsed = MODULE.RuntimeWireEnvelopeV1.from_wire(fixture)
        self.assertEqual(parsed.to_wire(), fixture)

    def test_camel_case_context_is_rejected(self):
        fixture = load_fixture("invalid-camel-context.json")
        with self.assertRaises(ValueError):
            MODULE.RuntimeWireEnvelopeV1.from_wire(fixture)

    def test_payload_identity_mismatch_is_rejected(self):
        fixture = load_fixture("valid-tool-execute-envelope.json")
        fixture["payload"]["fence_token"] = "43"
        with self.assertRaises(ValueError):
            MODULE.RuntimeWireEnvelopeV1.from_wire(fixture)

    def test_unbalanced_budget_ledger_is_rejected(self):
        fixture = copy.deepcopy(load_fixture("valid-tool-execute-envelope.json"))
        fixture["context"]["budget_ledger"]["remaining"]["model_calls"] = 99
        with self.assertRaises(ValueError):
            MODULE.RuntimeWireEnvelopeV1.from_wire(fixture)

    def test_unknown_message_type_is_rejected(self):
        fixture = load_fixture("valid-tool-execute-envelope.json")
        fixture["message_type"] = "INVENTED_MESSAGE"
        with self.assertRaises(ValueError):
            MODULE.RuntimeWireEnvelopeV1.from_wire(fixture)

    def test_every_message_type_rejects_an_empty_payload(self):
        fixture = load_fixture("valid-tool-execute-envelope.json")
        message_types = [
            option["properties"]["message_type"]["const"]
            for option in MODULE._RUNTIME_SCHEMA["oneOf"][0]["oneOf"]
        ]
        self.assertIn("MODEL_CANCEL_RESULT", message_types)
        self.assertEqual(len(message_types), 11)
        for message_type in message_types:
            with self.subTest(message_type=message_type):
                invalid = copy.deepcopy(fixture)
                invalid["message_type"] = message_type
                invalid["payload"] = {}
                with self.assertRaises(ValueError):
                    MODULE.RuntimeWireEnvelopeV1.from_wire(invalid)

    def test_model_cancel_result_empty_payload_is_rejected(self):
        fixture = load_fixture("valid-tool-execute-envelope.json")
        fixture["message_type"] = "MODEL_CANCEL_RESULT"
        fixture["payload"] = {}
        with self.assertRaises(ValueError):
            MODULE.RuntimeWireEnvelopeV1.from_wire(fixture)

    def test_model_consumption_requires_declared_ceiling_and_balanced_totals(self):
        fixture = load_fixture("valid-tool-execute-envelope.json")
        consumed = fixture["context"]["budget_ledger"]["consumed"]
        remaining = fixture["context"]["budget_ledger"]["remaining"]
        consumed["model_calls"] = 1
        remaining["model_calls"] = 7
        fixture["context"]["budget_ledger"]["model_consumption"] = [
            {
                "provider": "undeclared-provider",
                "model": "model-1",
                "calls": 1,
                "input_tokens": 0,
                "output_tokens": 0,
                "total_tokens": 0,
                "cost_minor_units": 0,
            }
        ]
        with self.assertRaises(ValueError):
            MODULE.RuntimeWireEnvelopeV1.from_wire(fixture)

    def test_model_ceiling_cannot_exceed_global_budget(self):
        fixture = load_fixture("valid-tool-execute-envelope.json")
        fixture["context"]["budget"]["model_ceilings"][0]["max_calls"] = 9
        with self.assertRaises(ValueError):
            MODULE.RuntimeWireEnvelopeV1.from_wire(fixture)

    def test_runtime_envelope_is_deeply_immutable_and_defensively_copied(self):
        fixture = load_fixture("valid-tool-execute-envelope.json")
        parsed = MODULE.RuntimeWireEnvelopeV1.from_wire(fixture)
        with self.assertRaises(TypeError):
            parsed.context.budget["max_cost"]["minor_units"] = 999
        with self.assertRaises(TypeError):
            parsed.context.budget_ledger["remaining"]["model_calls"] = 99
        with self.assertRaises(TypeError):
            parsed.payload["input"]["title"] = "Changed"
        fixture["payload"]["input"]["title"] = "Changed outside"
        self.assertEqual(parsed.payload["input"]["title"], "Planning meeting")

    def test_complete_model_request_over_one_mib_is_rejected(self):
        fixture = load_fixture("valid-tool-execute-envelope.json")
        identity = {
            field: fixture["context"][field]
            for field in (
                "tenant_id",
                "work_order_id",
                "run_id",
                "run_step_id",
                "attempt",
                "idempotency_key",
                "fence_token",
            )
        }
        fixture["message_type"] = "MODEL_GENERATE_REQUEST"
        fixture["payload"] = {
            **identity,
            "operation_id": "large-model-request",
            "target": {
                "provider": "provider-1",
                "model": "model-1",
                "fallback_index": 0,
            },
            "messages": [
                {"role": "USER", "content": "x" * 700_000, "tool_call_id": None},
                {"role": "USER", "content": "y" * 700_000, "tool_call_id": None},
            ],
            "tool_mode": "NONE",
            "tools": [],
            "response_format": {"kind": "TEXT"},
        }
        with self.assertRaisesRegex(ValueError, "1 MiB"):
            MODULE.RuntimeWireEnvelopeV1.from_wire(fixture)

    def test_lease_envelope_is_typed_and_deeply_immutable(self):
        fixture = load_fixture("valid-tool-execute-envelope.json")
        context = fixture["context"]
        lease = {
            "contract_version": "1.0",
            "envelope_id": "lease-envelope-1",
            "message_type": "LEASE_ACQUIRE_REQUEST",
            "emitted_at": fixture["emitted_at"],
            "payload": {
                "lease_request_id": "lease-request-1",
                "scope": {
                    "tenant_id": context["tenant_id"],
                    "work_order_id": context["work_order_id"],
                    "run_id": context["run_id"],
                    "run_step_id": context["run_step_id"],
                    "attempt": context["attempt"],
                    "executor_id": context["executor_id"],
                    "idempotency_key": context["idempotency_key"],
                },
                "requested_at": fixture["emitted_at"],
                "requested_duration_ms": 60000,
            },
        }
        parsed = MODULE.ExecutorLeaseWireEnvelopeV1.from_wire(lease)
        self.assertEqual(parsed.to_wire(), lease)
        with self.assertRaises(TypeError):
            parsed.payload["scope"]["tenant_id"] = "tenant-2"

    def test_lease_envelope_rejects_unknown_message_type(self):
        lease = {
            "contract_version": "1.0",
            "envelope_id": "lease-envelope-invalid",
            "message_type": "LEASE_INVENTED",
            "emitted_at": "2026-08-03T12:00:00.000Z",
            "payload": {},
        }
        with self.assertRaises(ValueError):
            MODULE.ExecutorLeaseWireEnvelopeV1.from_wire(lease)

    def test_python_wire_validation_matches_ts_scalar_and_strictness_rules(self):
        base = load_fixture("valid-tool-execute-envelope.json")
        mutations = [
            lambda value: value["context"].__setitem__("tenant_id", " tenant-1"),
            lambda value: value["context"].__setitem__("checkpoint_cursor", " 4"),
            lambda value: value["context"].__setitem__("fence_token", "01"),
            lambda value: value["context"].__setitem__(
                "lease_expires_at", "2026-08-03 12:10:00"
            ),
            lambda value: value["context"].__setitem__(
                "lease_expires_at", "2026-08-03T12:10:00+25:00"
            ),
            lambda value: value["context"].__setitem__(
                "lease_expires_at", "2026-08-03T12:10:00+99:99"
            ),
            lambda value: value["payload"].__setitem__("unexpected", True),
            lambda value: value["payload"]["input"].__setitem__("ratio", float("nan")),
        ]
        for index, mutate in enumerate(mutations):
            with self.subTest(index=index):
                invalid = copy.deepcopy(base)
                mutate(invalid)
                with self.assertRaises(ValueError):
                    MODULE.RuntimeWireEnvelopeV1.from_wire(invalid)

    def test_budget_and_ledger_integers_have_explicit_safe_domain_limits(self):
        base = load_fixture("valid-tool-execute-envelope.json")
        mutations = [
            lambda value: value["context"]["budget"].__setitem__(
                "max_duration_ms", 2**53
            ),
            lambda value: value["context"]["budget"].__setitem__(
                "max_model_calls", 2**53
            ),
            lambda value: value["context"]["budget"]["max_cost"].__setitem__(
                "minor_units", 2**53
            ),
            lambda value: value["context"]["budget_ledger"]["remaining"].__setitem__(
                "input_tokens", 2**53
            ),
            lambda value: value["context"]["budget"]["model_ceilings"][
                0
            ].__setitem__("max_total_tokens", 2**53),
        ]
        for index, mutate in enumerate(mutations):
            with self.subTest(index=index):
                invalid = copy.deepcopy(base)
                mutate(invalid)
                with self.assertRaises(ValueError):
                    MODULE.RuntimeWireEnvelopeV1.from_wire(invalid)

    def test_python_applies_trim_only_to_fields_declared_trimmed_by_ts(self):
        fixture = load_fixture("valid-tool-execute-envelope.json")
        context = fixture["context"]
        identity = {
            field: context[field]
            for field in (
                "tenant_id",
                "work_order_id",
                "run_id",
                "run_step_id",
                "attempt",
                "idempotency_key",
                "fence_token",
            )
        }
        fixture["message_type"] = "MODEL_EVENT"
        fixture["payload"] = {
            **identity,
            "type": "TEXT_DELTA",
            "sequence": 1,
            "operation_id": "operation-whitespace",
            "text": "   ",
        }
        parsed = MODULE.RuntimeWireEnvelopeV1.from_wire(fixture)
        self.assertEqual(parsed.payload["text"], "   ")

        failed = copy.deepcopy(fixture)
        failed["payload"] = {
            **identity,
            "type": "FAILED",
            "sequence": 2,
            "operation_id": "operation-failed",
            "code": "provider_error",
            "message": "  upstream failed  ",
            "retryable": False,
        }
        parsed_failed = MODULE.RuntimeWireEnvelopeV1.from_wire(failed)
        self.assertEqual(parsed_failed.payload["message"], "upstream failed")

    def test_token_totals_must_equal_input_plus_output_everywhere(self):
        base = load_fixture("valid-tool-execute-envelope.json")
        mutations = [
            lambda value: value["context"]["budget"].__setitem__(
                "max_total_tokens", 24999
            ),
            lambda value: value["context"]["budget_ledger"]["remaining"].__setitem__(
                "total_tokens", 24999
            ),
            lambda value: value["context"]["budget"]["model_ceilings"][0].__setitem__(
                "max_total_tokens", 24999
            ),
        ]
        for index, mutate in enumerate(mutations):
            with self.subTest(index=index):
                invalid = copy.deepcopy(base)
                mutate(invalid)
                with self.assertRaises(ValueError):
                    MODULE.RuntimeWireEnvelopeV1.from_wire(invalid)

        consumption = copy.deepcopy(base)
        consumed = consumption["context"]["budget_ledger"]["consumed"]
        remaining = consumption["context"]["budget_ledger"]["remaining"]
        consumed.update(
            model_calls=1,
            input_tokens=5,
            output_tokens=5,
            total_tokens=11,
        )
        remaining.update(
            model_calls=7,
            input_tokens=19995,
            output_tokens=4995,
            total_tokens=24989,
        )
        consumption["context"]["budget_ledger"]["model_consumption"] = [
            {
                "provider": "provider-1",
                "model": "model-1",
                "calls": 1,
                "input_tokens": 5,
                "output_tokens": 5,
                "total_tokens": 11,
                "cost_minor_units": 0,
            }
        ]
        with self.assertRaises(ValueError):
            MODULE.RuntimeWireEnvelopeV1.from_wire(consumption)

    def test_pending_forced_stop_is_rejected_at_force_deadline(self):
        fixture = load_fixture("valid-tool-execute-envelope.json")
        identity = {
            field: fixture["payload"][field]
            for field in (
                "tenant_id",
                "work_order_id",
                "run_id",
                "run_step_id",
                "attempt",
                "operation_id",
                "idempotency_key",
                "fence_token",
            )
        }
        force_by = "2026-08-03T12:00:05.000Z"
        fixture["message_type"] = "MODEL_CANCEL_RESULT"
        fixture["emitted_at"] = force_by
        fixture["payload"] = {
            **identity,
            "cancellation": {
                "cancellation_id": "cancel-1",
                "state": "ACKNOWLEDGED",
                "requested_at": "2026-08-03T12:00:00.000Z",
                "acknowledge_by": "2026-08-03T12:00:02.000Z",
                "force_by": force_by,
                "acknowledged_at": "2026-08-03T12:00:01.000Z",
                "acknowledgement_latency_ms": 1000,
                "forced_stop": {
                    "required": True,
                    "deadline_at": force_by,
                    "enforced_at": None,
                    "mechanism": None,
                    "outcome": "PENDING",
                },
            },
        }
        with self.assertRaises(ValueError):
            MODULE.RuntimeWireEnvelopeV1.from_wire(fixture)

    def test_checkpoint_unknown_state_and_side_effect_are_biconditional(self):
        fixture = load_fixture("valid-tool-execute-envelope.json")
        context = fixture["context"]
        fixture["message_type"] = "CHECKPOINT"
        fixture["payload"] = {
            "contract_version": "1.0",
            "checkpoint_id": "checkpoint-5",
            "cursor": "5",
            "tenant_id": context["tenant_id"],
            "work_order_id": context["work_order_id"],
            "run_id": context["run_id"],
            "run_step_id": context["run_step_id"],
            "attempt": context["attempt"],
            "idempotency_key": context["idempotency_key"],
            "fence_token": context["fence_token"],
            "executor_id": context["executor_id"],
            "lease_id": context["lease_id"],
            "lease_epoch": context["lease_epoch"],
            "boundary": "TOOL",
            "phase": "AFTER",
            "operation_id": "operation-1",
            "state": "FAILED",
            "side_effect_state": "UNKNOWN",
            "reconciliation_required": True,
            "snapshot": {},
            "created_at": fixture["emitted_at"],
        }
        with self.assertRaises(ValueError):
            MODULE.RuntimeWireEnvelopeV1.from_wire(fixture)

    def test_lease_chronology_and_replacement_fence_must_advance(self):
        fixture = load_fixture("valid-tool-execute-envelope.json")
        context = fixture["context"]
        scope = {
            "tenant_id": context["tenant_id"],
            "work_order_id": context["work_order_id"],
            "run_id": context["run_id"],
            "run_step_id": context["run_step_id"],
            "attempt": context["attempt"],
            "executor_id": context["executor_id"],
            "idempotency_key": context["idempotency_key"],
        }
        acquire = {
            "contract_version": "1.0",
            "envelope_id": "lease-acquire-bad-expiry",
            "message_type": "LEASE_ACQUIRE_RESULT",
            "emitted_at": fixture["emitted_at"],
            "payload": {
                "lease_request_id": "lease-request-1",
                "status": "ACQUIRED",
                "lease_id": "lease-1",
                "lease_epoch": 1,
                "fence_token": "42",
                "lease_expires_at": fixture["emitted_at"],
                "requested_at": fixture["emitted_at"],
                "decided_at": fixture["emitted_at"],
                "rejection_reason": None,
            },
        }
        loss = {
            "contract_version": "1.0",
            "envelope_id": "lease-loss-bad-fence",
            "message_type": "LEASE_LOSS",
            "emitted_at": "2026-08-03T12:00:31.000Z",
            "payload": {
                "scope": scope,
                "lease_id": "lease-1",
                "lease_epoch": 3,
                "fence_token": "42",
                "lease_expires_at": "2026-08-03T12:01:00.000Z",
                "detected_at": "2026-08-03T12:00:31.000Z",
                "reason": "FENCED",
                "replacement_fence_token": "42",
            },
        }
        renew = {
            "contract_version": "1.0",
            "envelope_id": "lease-renew-after-expiry",
            "message_type": "LEASE_RENEW_REQUEST",
            "emitted_at": "2026-08-03T12:01:00.001Z",
            "payload": {
                "scope": scope,
                "lease_id": "lease-1",
                "lease_epoch": 3,
                "fence_token": "42",
                "lease_expires_at": "2026-08-03T12:01:00.000Z",
                "lease_request_id": "lease-request-2",
                "requested_at": "2026-08-03T12:00:30.000Z",
                "requested_duration_ms": 60000,
                "checkpoint_cursor": "5",
            },
        }
        renew_result_after_expiry = {
            "contract_version": "1.0",
            "envelope_id": "lease-renew-result-after-expiry",
            "message_type": "LEASE_RENEW_RESULT",
            "emitted_at": "2026-08-03T12:01:00.001Z",
            "payload": {
                "lease_request_id": "lease-request-3",
                "status": "RENEWED",
                "lease_id": "lease-1",
                "lease_epoch": 3,
                "fence_token": "42",
                "previous_expires_at": "2026-08-03T12:01:00.000Z",
                "lease_expires_at": "2026-08-03T12:02:00.000Z",
                "requested_at": "2026-08-03T12:00:30.000Z",
                "decided_at": "2026-08-03T12:01:00.001Z",
                "reason": None,
            },
        }
        for invalid in (acquire, renew, loss, renew_result_after_expiry):
            with self.assertRaises(ValueError):
                MODULE.ExecutorLeaseWireEnvelopeV1.from_wire(invalid)


if __name__ == "__main__":
    unittest.main()
