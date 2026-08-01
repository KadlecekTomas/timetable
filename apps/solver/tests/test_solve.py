from fastapi.testclient import TestClient

from app.main import app

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
    slots = {(item["class_id"], item["day"], item["period"]) for item in payload["lessons"]}
    assert len(slots) == 4
    assert payload["score"]["valid"] is True
    assert sum(payload["score"]["categories"].values()) == payload["score"]["total"]


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
    assert {(lesson["day"], lesson["period"]) for lesson in lessons} == {(0, 0)}


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
    assert any(cause["code"] == "FIXED_LESSON_CONFLICT" for cause in detail["causes"])
