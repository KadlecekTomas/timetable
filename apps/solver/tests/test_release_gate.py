from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def deterministic_payload() -> dict:
    return {
        "periods_per_day": [4, 4, 4],
        "rooms": [
            {"id": "room-1", "room_type_id": "general"},
            {"id": "room-2", "room_type_id": "general"},
        ],
        "assignments": [
            {
                "id": "math-6a",
                "teacher_id": "teacher-1",
                "class_id": "6a",
                "subject_id": "math",
                "weekly_periods": 2,
                "required_room_id": "room-1",
                "max_per_day": 1,
            },
            {
                "id": "czech-6a",
                "teacher_id": "teacher-2",
                "class_id": "6a",
                "subject_id": "czech",
                "weekly_periods": 2,
                "required_room_id": "room-2",
                "max_per_day": 1,
            },
        ],
        "random_seed": 1234,
        "time_limit_seconds": 10,
    }


def test_solver_is_deterministic_for_identical_snapshot() -> None:
    first = client.post("/solve", json=deterministic_payload())
    second = client.post("/solve", json=deterministic_payload())

    assert first.status_code == 200, first.text
    assert second.status_code == 200, second.text

    first_payload = first.json()
    second_payload = second.json()
    assert first_payload["status"] == second_payload["status"]
    assert first_payload["objective_value"] == second_payload["objective_value"]
    assert first_payload["lessons"] == second_payload["lessons"]
    assert first_payload["score"] == second_payload["score"]


def test_single_room_cannot_host_two_classes_in_same_slot() -> None:
    response = client.post(
        "/solve",
        json={
            "periods_per_day": [1],
            "rooms": [{"id": "lab", "room_type_id": "lab"}],
            "assignments": [
                {
                    "id": "science-6a",
                    "teacher_id": "teacher-1",
                    "class_id": "6a",
                    "subject_id": "science",
                    "weekly_periods": 1,
                    "required_room_id": "lab",
                },
                {
                    "id": "science-7a",
                    "teacher_id": "teacher-2",
                    "class_id": "7a",
                    "subject_id": "science",
                    "weekly_periods": 1,
                    "required_room_id": "lab",
                },
            ],
        },
    )

    assert response.status_code == 422
    detail = response.json()["detail"]
    assert detail["code"] == "INFEASIBLE"
    assert any(cause["code"] == "INFEASIBLE_MODEL" for cause in detail["causes"])


def test_teacher_capacity_shortage_is_explained_before_solving() -> None:
    response = client.post(
        "/solve",
        json={
            "periods_per_day": [1],
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
        },
    )

    assert response.status_code == 422
    detail = response.json()["detail"]
    assert detail["code"] == "INFEASIBLE_INPUT"
    cause = next(item for item in detail["causes"] if item["code"] == "TEACHER_CAPACITY_EXCEEDED")
    assert cause["details"] == {"required": 2, "available": 1}


def test_double_lesson_cannot_cross_an_unavailable_period() -> None:
    response = client.post(
        "/solve",
        json={
            "periods_per_day": [2],
            "assignments": [
                {
                    "id": "science-6a",
                    "teacher_id": "teacher-1",
                    "class_id": "6a",
                    "subject_id": "science",
                    "weekly_periods": 2,
                    "lesson_shape": "DOUBLE",
                }
            ],
            "availability": [
                {
                    "entity_type": "TEACHER",
                    "entity_id": "teacher-1",
                    "day": 0,
                    "period": 1,
                    "kind": "UNAVAILABLE",
                }
            ],
        },
    )

    assert response.status_code == 422
    detail = response.json()["detail"]
    assert detail["code"] == "INFEASIBLE_INPUT"
    assert any(cause["code"] == "EMPTY_CANDIDATE_SET" for cause in detail["causes"])


def test_preferred_slot_wins_when_hard_constraints_are_equal() -> None:
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
                    "period": 1,
                    "kind": "PREFERRED",
                    "weight": 50,
                }
            ],
        },
    )

    assert response.status_code == 200, response.text
    lesson = response.json()["lessons"][0]
    assert lesson["day"] == 0
    assert lesson["period"] == 1
