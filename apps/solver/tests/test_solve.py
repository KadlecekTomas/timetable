from fastapi.testclient import TestClient

from app.main import _search_workers, app
from app.models import SolveRequest, SolverWeights

client = TestClient(app)


def test_solver_returns_conflict_free_schedule() -> None:
    response = client.post(
        "/solve",
        json={
            "periods_per_day": [4, 4],
            "assignments": [
                {
                    "id": "math-6a",
                    "teacher_id": "teacher-1",
                    "class_id": "6a",
                    "subject_id": "math",
                    "weekly_periods": 2,
                },
                {
                    "id": "czech-6a",
                    "teacher_id": "teacher-2",
                    "class_id": "6a",
                    "subject_id": "czech",
                    "weekly_periods": 2,
                },
            ],
        },
    )

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["status"] in {"FEASIBLE", "OPTIMAL"}
    assert len(payload["lessons"]) == 4
    slots = {
        (item["class_id"], item["day"], item["period"])
        for item in payload["lessons"]
    }
    assert len(slots) == 4
    assert payload["score"]["valid"] is True
    assert (
        sum(payload["score"]["categories"].values())
        == payload["score"]["total"]
    )


def test_split_groups_can_run_in_parallel() -> None:
    response = client.post(
        "/solve",
        json={
            "periods_per_day": [1],
            "rooms": [
                {"id": "room-1", "room_type_id": "general"},
                {"id": "room-2", "room_type_id": "general"},
            ],
            "assignments": [
                {
                    "id": "english-6a-g1",
                    "teacher_id": "teacher-1",
                    "class_id": "6a",
                    "subject_id": "english",
                    "group": "GROUP_1",
                    "weekly_periods": 1,
                    "required_room_id": "room-1",
                },
                {
                    "id": "english-6a-g2",
                    "teacher_id": "teacher-2",
                    "class_id": "6a",
                    "subject_id": "english",
                    "group": "GROUP_2",
                    "weekly_periods": 1,
                    "required_room_id": "room-2",
                },
            ],
        },
    )

    assert response.status_code == 200, response.text
    lessons = response.json()["lessons"]
    assert {(lesson["day"], lesson["period"]) for lesson in lessons} == {
        (0, 0)
    }


def test_solver_respects_unavailable_slots() -> None:
    response = client.post(
        "/solve",
        json={
            "periods_per_day": [2],
            "assignments": [
                {
                    "id": "math-6a",
                    "teacher_id": "teacher-1",
                    "class_id": "6a",
                    "subject_id": "math",
                    "weekly_periods": 1,
                }
            ],
            "availability": [
                {
                    "entity_type": "TEACHER",
                    "entity_id": "teacher-1",
                    "day": 0,
                    "period": 0,
                    "kind": "UNAVAILABLE",
                }
            ],
        },
    )

    assert response.status_code == 200, response.text
    assert response.json()["lessons"][0]["period"] == 1


def test_double_lesson_remains_one_consecutive_block() -> None:
    response = client.post(
        "/solve",
        json={
            "periods_per_day": [4],
            "assignments": [
                {
                    "id": "lab-6a",
                    "teacher_id": "teacher-1",
                    "class_id": "6a",
                    "subject_id": "science",
                    "weekly_periods": 2,
                    "lesson_shape": "DOUBLE",
                }
            ],
        },
    )

    assert response.status_code == 200, response.text
    lessons = response.json()["lessons"]
    assert len(lessons) == 1
    assert lessons[0]["duration"] == 2


def test_solver_preserves_locked_lesson() -> None:
    response = client.post(
        "/solve",
        json={
            "periods_per_day": [4, 4, 4],
            "assignments": [
                {
                    "id": "math-6a",
                    "teacher_id": "teacher-1",
                    "class_id": "6a",
                    "subject_id": "math",
                    "weekly_periods": 1,
                }
            ],
            "locked_lessons": [
                {
                    "assignment_id": "math-6a",
                    "block_index": 0,
                    "day": 2,
                    "period": 3,
                }
            ],
        },
    )

    assert response.status_code == 200, response.text
    lesson = response.json()["lessons"][0]
    assert lesson["day"] == 2
    assert lesson["period"] == 3
    assert lesson["locked"] is True


def test_conflicting_fixed_lessons_return_verifiable_cause() -> None:
    response = client.post(
        "/solve",
        json={
            "periods_per_day": [2],
            "assignments": [
                {
                    "id": "math-6a",
                    "teacher_id": "teacher-1",
                    "class_id": "6a",
                    "subject_id": "math",
                    "weekly_periods": 1,
                },
                {
                    "id": "math-7a",
                    "teacher_id": "teacher-1",
                    "class_id": "7a",
                    "subject_id": "math",
                    "weekly_periods": 1,
                },
            ],
            "fixed_lessons": [
                {
                    "assignment_id": "math-6a",
                    "block_index": 0,
                    "day": 0,
                    "period": 0,
                },
                {
                    "assignment_id": "math-7a",
                    "block_index": 0,
                    "day": 0,
                    "period": 0,
                },
            ],
        },
    )

    assert response.status_code == 422
    detail = response.json()["detail"]
    assert detail["code"] == "INFEASIBLE"
    assert any(
        cause["code"] == "FIXED_LESSON_CONFLICT"
        for cause in detail["causes"]
    )


def test_weak_client_weights_are_upgraded_to_compactness_first_profile() -> None:
    weights = SolverWeights(
        teacher_gap=1,
        class_gap=1,
        discouraged_slot=1,
        preferred_slot_bonus=0,
        same_day_concentration=1,
        late_period=1,
    )

    assert weights.teacher_gap == 1_000
    assert weights.class_gap == 2_000
    assert weights.discouraged_slot == 25
    assert weights.preferred_slot_bonus == 3
    assert weights.same_day_concentration == 50
    assert weights.late_period == 10


def test_compactness_profile_keeps_simple_class_day_without_gaps() -> None:
    response = client.post(
        "/solve",
        json={
            "periods_per_day": [5],
            "assignments": [
                {
                    "id": "math-6a",
                    "teacher_id": "teacher-1",
                    "class_id": "6a",
                    "subject_id": "math",
                    "weekly_periods": 1,
                },
                {
                    "id": "czech-6a",
                    "teacher_id": "teacher-2",
                    "class_id": "6a",
                    "subject_id": "czech",
                    "weekly_periods": 1,
                },
                {
                    "id": "english-6a",
                    "teacher_id": "teacher-3",
                    "class_id": "6a",
                    "subject_id": "english",
                    "weekly_periods": 1,
                },
            ],
            "weights": {
                "teacher_gap": 0,
                "class_gap": 0,
                "discouraged_slot": 0,
                "preferred_slot_bonus": 0,
                "same_day_concentration": 0,
                "late_period": 0,
            },
        },
    )

    assert response.status_code == 200, response.text
    assert {
        lesson["period"] for lesson in response.json()["lessons"]
    } == {0, 1, 2}


def test_full_school_time_limit_uses_parallel_search() -> None:
    quick = SolveRequest.model_validate(
        {
            "assignments": [
                {
                    "id": "lesson",
                    "teacher_id": "teacher",
                    "class_id": "class",
                    "subject_id": "subject",
                    "weekly_periods": 1,
                }
            ],
            "time_limit_seconds": 30,
        }
    )
    full_school = quick.model_copy(update={"time_limit_seconds": 180})

    assert _search_workers(quick) == 1
    assert _search_workers(full_school) == 8


def test_three_split_groups_run_in_the_same_parallel_slot() -> None:
    response = client.post(
        "/solve",
        json={
            "periods_per_day": [2],
            "assignments": [
                {
                    "id": "english-6a-g1",
                    "teacher_id": "teacher-1",
                    "class_id": "6a",
                    "subject_id": "english",
                    "group": "GROUP_1",
                    "weekly_periods": 1,
                    "parallel_key": "english-6a",
                },
                {
                    "id": "english-6a-g2",
                    "teacher_id": "teacher-2",
                    "class_id": "6a",
                    "subject_id": "english",
                    "group": "GROUP_2",
                    "weekly_periods": 1,
                    "parallel_key": "english-6a",
                },
                {
                    "id": "english-6a-g3",
                    "teacher_id": "teacher-3",
                    "class_id": "6a",
                    "subject_id": "english",
                    "group": "GROUP_3",
                    "weekly_periods": 1,
                    "parallel_key": "english-6a",
                },
            ],
        },
    )

    assert response.status_code == 200, response.text
    lessons = response.json()["lessons"]
    assert {lesson["group"] for lesson in lessons} == {
        "GROUP_1",
        "GROUP_2",
        "GROUP_3",
    }
    assert len({(lesson["day"], lesson["period"]) for lesson in lessons}) == 1
