from fastapi import HTTPException
from fastapi.testclient import TestClient

from app import runtime
from app.models import SolveRequest
from app.runtime import RelaxationOutcome, app

client = TestClient(app)


def test_runtime_explains_class_day_policy_instead_of_generic_infeasible() -> None:
    # Ten weekly periods normally fit easily. But fixing one lesson to Monday's
    # seventh period conflicts with the school's hard class-day shape: classes
    # must start in period 1 and have no internal gaps, while Monday afternoon is
    # also forbidden by the school policy. Removing only that policy makes the
    # same teaching data immediately feasible, so this is a fast deterministic
    # diagnostic case instead of a search-timeout-sensitive stress test.
    assignments = [
        {
            "id": f"lesson-{index}",
            "teacher_id": f"teacher-{index}",
            "class_id": "8a",
            "subject_id": f"subject-{index}",
            "weekly_periods": 1,
        }
        for index in range(10)
    ]

    response = client.post(
        "/solve",
        json={
            "periods_per_day": [8, 8, 8, 8, 8],
            "classes": [{"id": "8a", "code": "8.A"}],
            "assignments": assignments,
            "fixed_lessons": [
                {
                    "assignment_id": "lesson-0",
                    "block_index": 0,
                    "day": 0,
                    "period": 6,
                }
            ],
            "time_limit_seconds": 5,
        },
    )

    assert response.status_code == 422, response.text
    error = response.json()["error"]
    assert error["code"] == "INFEASIBLE"
    assert "denní struktury tříd" in error["message"]
    causes = error["details"]["causes"]
    assert causes[0]["code"] == "CLASS_DAY_POLICY_CONFLICT"


def test_runtime_explains_parallel_sync_conflict() -> None:
    response = client.post(
        "/solve",
        json={
            "periods_per_day": [2],
            "assignments": [
                {
                    "id": "split-a",
                    "teacher_id": "teacher-a",
                    "class_id": "class-a",
                    "subject_id": "subject-a",
                    "group": "GROUP_1",
                    "parallel_key": "split-a-b",
                    "weekly_periods": 1,
                },
                {
                    "id": "split-b",
                    "teacher_id": "teacher-b",
                    "class_id": "class-a",
                    "subject_id": "subject-a",
                    "group": "GROUP_2",
                    "parallel_key": "split-a-b",
                    "weekly_periods": 1,
                },
            ],
            "availability": [
                {
                    "entity_type": "TEACHER",
                    "entity_id": "teacher-a",
                    "day": 0,
                    "period": 1,
                    "kind": "UNAVAILABLE",
                },
                {
                    "entity_type": "TEACHER",
                    "entity_id": "teacher-b",
                    "day": 0,
                    "period": 0,
                    "kind": "UNAVAILABLE",
                },
            ],
            "time_limit_seconds": 5,
        },
    )

    assert response.status_code == 422, response.text
    error = response.json()["error"]
    assert error["code"] == "INFEASIBLE"
    assert "paralelní skupiny" in error["message"]
    assert error["details"]["causes"][0]["code"] == "PARALLEL_POLICY_CONFLICT"


def test_relaxation_timeout_is_indeterminate(monkeypatch) -> None:
    payload = SolveRequest(
        periods_per_day=[1],
        assignments=[
            {
                "id": "lesson-a",
                "teacher_id": "teacher-a",
                "class_id": "class-a",
                "subject_id": "subject-a",
                "weekly_periods": 1,
            }
        ],
        time_limit_seconds=1,
    )

    def timeout(_payload: SolveRequest) -> None:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "SEARCH_LIMIT_EXCEEDED",
                "message": "Solver vyčerpal časový limit.",
            },
        )

    monkeypatch.setattr(runtime.solver_main, "solve", timeout)

    assert (
        runtime._find_feasible_relaxation(payload)
        == RelaxationOutcome.INDETERMINATE
    )


def test_indeterminate_diagnostics_do_not_claim_bad_input(monkeypatch) -> None:
    payload = SolveRequest(
        periods_per_day=[2],
        assignments=[
            {
                "id": "lesson-a",
                "teacher_id": "teacher-a",
                "class_id": "class-a",
                "subject_id": "subject-a",
                "weekly_periods": 1,
            }
        ],
    )

    monkeypatch.setattr(
        runtime,
        "_find_feasible_relaxation",
        lambda *_args, **_kwargs: RelaxationOutcome.INDETERMINATE,
    )

    diagnostics = runtime._diagnose_infeasibility(payload)
    assert diagnostics[0]["code"] == "DIAGNOSTIC_SEARCH_LIMIT"
    assert "neznamená" in diagnostics[0]["message"]


def test_runtime_preserves_specific_preflight_message() -> None:
    response = client.post(
        "/solve",
        json={
            "periods_per_day": [1],
            "assignments": [
                {
                    "id": "blocked",
                    "teacher_id": "teacher-a",
                    "class_id": "class-a",
                    "subject_id": "subject-a",
                    "weekly_periods": 1,
                }
            ],
            "availability": [
                {
                    "entity_type": "TEACHER",
                    "entity_id": "teacher-a",
                    "day": 0,
                    "period": 0,
                    "kind": "UNAVAILABLE",
                }
            ],
        },
    )

    assert response.status_code == 422, response.text
    error = response.json()["error"]
    assert error["code"] == "INFEASIBLE_INPUT"
    assert "nemají žádné povolené umístění" in error["message"]
    assert error["details"]["causes"][0]["code"] == "EMPTY_CANDIDATE_SET"
