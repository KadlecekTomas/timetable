from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_solver_returns_conflict_free_schedule() -> None:
    response = client.post(
        "/solve",
        json={
            "assignments": [
                {
                    "id": "math-6a",
                    "teacher_id": "teacher-1",
                    "class_id": "6a",
                    "subject_id": "math",
                    "room_id": "room-1",
                    "lessons_per_week": 2,
                },
                {
                    "id": "czech-6a",
                    "teacher_id": "teacher-2",
                    "class_id": "6a",
                    "subject_id": "czech",
                    "room_id": "room-2",
                    "lessons_per_week": 2,
                },
            ]
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "FEASIBLE"
    assert len(payload["lessons"]) == 4
    slots = {(item["class_id"], item["day"], item["period"]) for item in payload["lessons"]}
    assert len(slots) == 4


def test_solver_preserves_locked_lesson() -> None:
    response = client.post(
        "/solve",
        json={
            "assignments": [
                {
                    "id": "math-6a",
                    "teacher_id": "teacher-1",
                    "class_id": "6a",
                    "subject_id": "math",
                    "lessons_per_week": 1,
                }
            ],
            "locked_lessons": [{"assignment_id": "math-6a", "day": 2, "period": 3}],
        },
    )

    assert response.status_code == 200
    lesson = response.json()["lessons"][0]
    assert lesson["day"] == 2
    assert lesson["period"] == 3
    assert lesson["locked"] is True
