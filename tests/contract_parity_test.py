"""Contract parity tests: verify Python and TypeScript exports match canonical JSON schemas.

These tests catch the exact class of drift bugs that occurred with RiskLevel
(missing MEDIUM) and Role (CUSTOMER vs USER) — where the canonical JSON schema
defines one set of values but a language-specific export diverges.

Run:  python -m pytest tests/contract_parity_test.py -v
  or: python -m unittest tests/contract_parity_test.py -v
"""

from __future__ import annotations

import json
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parent.parent

# ── Canonical JSON schemas ────────────────────────────────────────────
TASK_WORKFLOW = ROOT / "schemas" / "core" / "task-workflow.schema.json"
RUNTIME = ROOT / "schemas" / "openclaw" / "runtime.schema.json"
REMOTE_SUPPORT = ROOT / "schemas" / "meshcentral" / "remote-support.schema.json"
EXECUTOR_RESPONSE = ROOT / "schemas" / "executor" / "executor.response.schema.json"
STAFF_ROOM = ROOT / "schemas" / "staff-room" / "staff-room.schema.json"

# ── Python embedded copy (bundled in wheel) ───────────────────────────
PY_TASK_WORKFLOW = (
    ROOT
    / "packages"
    / "python"
    / "aillium_schemas"
    / "schemas"
    / "core"
    / "task-workflow.schema.json"
)
PY_STAFF_ROOM = (
    ROOT
    / "packages"
    / "python"
    / "aillium_schemas"
    / "schemas"
    / "staff-room"
    / "staff-room.schema.json"
)


def _load(path: pathlib.Path) -> dict:
    return json.loads(path.read_text())


class TestCanonicalTaskWorkflow(unittest.TestCase):
    """Verify task-workflow.schema.json enum values are consistent everywhere."""

    def setUp(self):
        self.schema = _load(TASK_WORKFLOW)
        self.defs = self.schema["$defs"]

    def test_risk_level_enum(self):
        expected = ["LOW", "MEDIUM", "HIGH", "CRITICAL"]
        actual = self.defs["risk_level"]["enum"]
        self.assertEqual(actual, expected, "Canonical risk_level enum drift")

    def test_task_state_enum(self):
        expected = ["PENDING", "NEEDS_APPROVAL", "RUNNING", "COMPLETED", "FAILED", "CANCELLED"]
        actual = self.defs["task_state"]["enum"]
        self.assertEqual(actual, expected, "Canonical task_state enum drift")

    def test_enforcement_enum(self):
        expected = ["HARD", "SOFT"]
        actual = self.defs["budget_caps"]["properties"]["enforcement"]["enum"]
        self.assertEqual(actual, expected)

    def test_step_update_status_enum(self):
        expected = ["INFO", "WARNING", "ERROR"]
        actual = self.defs["step_update"]["properties"]["status"]["enum"]
        self.assertEqual(actual, expected)


class TestPythonEmbeddedSchema(unittest.TestCase):
    """Verify the Python-package-embedded JSON matches canonical."""

    def test_risk_level_matches_canonical(self):
        canonical = _load(TASK_WORKFLOW)["$defs"]["risk_level"]["enum"]
        embedded = _load(PY_TASK_WORKFLOW)["$defs"]["risk_level"]["enum"]
        self.assertEqual(embedded, canonical, "Python embedded risk_level diverges from canonical")

    def test_task_state_matches_canonical(self):
        canonical = _load(TASK_WORKFLOW)["$defs"]["task_state"]["enum"]
        embedded = _load(PY_TASK_WORKFLOW)["$defs"]["task_state"]["enum"]
        self.assertEqual(embedded, canonical, "Python embedded task_state diverges from canonical")

    def test_full_schema_matches_canonical(self):
        canonical = _load(TASK_WORKFLOW)
        embedded = _load(PY_TASK_WORKFLOW)
        self.assertEqual(embedded, canonical, "Embedded schema diverges from canonical")


class TestPythonContractsParity(unittest.TestCase):
    """Verify Python Pydantic models match canonical JSON schema enums."""

    def setUp(self):
        # Import here so test collection doesn't fail if pydantic unavailable
        from aillium_schemas.contracts import (
            Plan,
            RiskLevel,
            Role,
            RuntimeStatus,
            TaskState,
        )

        self.RiskLevel = RiskLevel
        self.TaskState = TaskState
        self.Role = Role
        self.Plan = Plan
        self.RuntimeStatus = RuntimeStatus

    def test_risk_level_values(self):
        canonical = _load(TASK_WORKFLOW)["$defs"]["risk_level"]["enum"]
        python_values = [e.value for e in self.RiskLevel]
        self.assertEqual(python_values, canonical)

    def test_task_state_values(self):
        canonical = _load(TASK_WORKFLOW)["$defs"]["task_state"]["enum"]
        python_values = [e.value for e in self.TaskState]
        self.assertEqual(python_values, canonical)

    def test_role_values(self):
        # Role is not in a JSON schema — verify against TypeScript convention
        expected = ["SUPER_ADMIN", "ADMIN", "USER"]
        python_values = [e.value for e in self.Role]
        self.assertEqual(python_values, expected)

    def test_plan_values(self):
        expected = ["STARTER", "GROWTH", "OPERATOR", "ENTERPRISE"]
        python_values = [e.value for e in self.Plan]
        self.assertEqual(python_values, expected)

    def test_runtime_status_values(self):
        canonical = _load(RUNTIME)["$defs"]["runtime_result"]["properties"]["status"]["enum"]
        python_values = [e.value for e in self.RuntimeStatus]
        self.assertEqual(python_values, canonical)


class TestRuntimeSchema(unittest.TestCase):
    """Verify openclaw runtime schema enums."""

    def setUp(self):
        self.schema = _load(RUNTIME)
        self.defs = self.schema["$defs"]

    def test_runtime_status_enum(self):
        expected = ["succeeded", "failed", "cancelled", "timed_out"]
        actual = self.defs["runtime_result"]["properties"]["status"]["enum"]
        self.assertEqual(actual, expected)


class TestMeshCentralSchema(unittest.TestCase):
    """Verify meshcentral remote-support schema enums."""

    def setUp(self):
        self.schema = _load(REMOTE_SUPPORT)
        self.defs = self.schema["$defs"]

    def test_session_state_status_enum(self):
        expected = ["requested", "establishing", "active", "ended", "failed"]
        actual = self.defs["session_state"]["properties"]["status"]["enum"]
        self.assertEqual(actual, expected)


class TestExecutorResponseSchema(unittest.TestCase):
    """Verify executor response schema enums."""

    def setUp(self):
        self.schema = _load(EXECUTOR_RESPONSE)

    def test_status_enum(self):
        expected = ["succeeded", "failed", "cancelled", "timed_out"]
        actual = self.schema["properties"]["status"]["enum"]
        self.assertEqual(actual, expected)

    def test_executor_type_enum(self):
        expected = ["generic", "agent", "tool", "job"]
        actual = self.schema["properties"]["executor_type"]["enum"]
        self.assertEqual(actual, expected)


class TestStaffRoomSchema(unittest.TestCase):
    """Verify staff-room schema enums, embedded copy, and Python parity."""

    def setUp(self):
        self.schema = _load(STAFF_ROOM)
        self.defs = self.schema["$defs"]

    def test_memory_retention_enum(self):
        expected = ["PERMANENT", "SEMI_PERMANENT", "TEMPORARY", "ARCHIVED"]
        actual = self.defs["staff_room_memory_retention"]["enum"]
        self.assertEqual(actual, expected)

    def test_record_status_enum(self):
        expected = ["DRAFT", "ACTIVE", "UNDER_REVIEW", "DEPRECATED", "ARCHIVED"]
        actual = self.defs["staff_room_record_status"]["enum"]
        self.assertEqual(actual, expected)

    def test_memory_scope_enum(self):
        expected = ["GLOBAL", "DEPARTMENTAL", "ROLE_BASED", "RESTRICTED", "ADMIN_ONLY"]
        actual = self.defs["staff_room_memory_scope"]["enum"]
        self.assertEqual(actual, expected)

    def test_agent_status_enum(self):
        expected = ["ACTIVE", "INACTIVE", "SUSPENDED", "ARCHIVED"]
        actual = self.defs["staff_room_agent_status"]["enum"]
        self.assertEqual(actual, expected)

    def test_relationship_type_enum(self):
        expected = [
            "DEPARTMENT_TO_PROCESS",
            "PROCESS_TO_OWNER",
            "TOOL_TO_DEPARTMENT",
            "AGENT_TO_DEPARTMENT",
            "INCIDENT_TO_RESOLUTION",
            "ARTICLE_TO_PROCESS",
            "PROCESS_TO_ESCALATION",
            "KNOWLEDGE_TO_ROLE",
            "AGENT_TO_KNOWLEDGE",
            "PROCESS_TO_TOOL",
            "DEPARTMENT_TO_TOOL",
            "CUSTOM",
        ]
        actual = self.defs["staff_room_relationship_type"]["enum"]
        self.assertEqual(actual, expected)

    def test_embedded_copy_matches_canonical(self):
        canonical = _load(STAFF_ROOM)
        embedded = _load(PY_STAFF_ROOM)
        self.assertEqual(embedded, canonical, "Embedded staff-room schema diverges from canonical")

    def test_python_memory_retention_matches(self):
        from aillium_schemas.contracts import StaffRoomMemoryRetention

        canonical = self.defs["staff_room_memory_retention"]["enum"]
        python_values = [e.value for e in StaffRoomMemoryRetention]
        self.assertEqual(python_values, canonical)

    def test_python_record_status_matches(self):
        from aillium_schemas.contracts import StaffRoomRecordStatus

        canonical = self.defs["staff_room_record_status"]["enum"]
        python_values = [e.value for e in StaffRoomRecordStatus]
        self.assertEqual(python_values, canonical)

    def test_python_memory_scope_matches(self):
        from aillium_schemas.contracts import StaffRoomMemoryScope

        canonical = self.defs["staff_room_memory_scope"]["enum"]
        python_values = [e.value for e in StaffRoomMemoryScope]
        self.assertEqual(python_values, canonical)

    def test_python_agent_status_matches(self):
        from aillium_schemas.contracts import StaffRoomAgentStatus

        canonical = self.defs["staff_room_agent_status"]["enum"]
        python_values = [e.value for e in StaffRoomAgentStatus]
        self.assertEqual(python_values, canonical)

    def test_python_relationship_type_matches(self):
        from aillium_schemas.contracts import StaffRoomRelationshipType

        canonical = self.defs["staff_room_relationship_type"]["enum"]
        python_values = [e.value for e in StaffRoomRelationshipType]
        self.assertEqual(python_values, canonical)


if __name__ == "__main__":
    unittest.main()
