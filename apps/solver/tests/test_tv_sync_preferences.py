from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _tv_assignment(
    assignment_id: str,
    teacher_id: str,
    class_id: str,
    weekly_periods: int = 2,
) -> dict[str, object]:
    return {
        "id": assignment_id,
        "teacher_id": teacher_id,
        "class_id": class_id,
        "subject_id": "subject-tv",
        "weekly_periods": weekly_periods,
        "lesson_shape": "DOUBLE",
    }


def test_ninth_grade_tv_uses_two_9b_blocks_for_requested_pairings() -> None:
    response = client.post(
        "/solve",
        json={
            "periods_per_day": [4],
            "classes": [
                {"id": "class-8b", "code": "8.B"},
                {"id": "class-9a", "code": "9.A"},
                {"id": "class-9b", "code": "9.B"},
            ],
            "subjects": [{"id": "subject-tv", "code": "TV"}],
            "assignments": [
                _tv_assignment("tv-8b", "teacher-8b", "class-8b"),
                _tv_assignment("tv-9a", "teacher-9a", "class-9a"),
                _tv_assignment("tv-9b", "teacher-9b", "class-9b", 4),
            ],
            "availability": [
                {
                    "entity_type": "CLASS",
                    "entity_id": "class-8b",
                    "day": 0,
                    "period": 0,
                    "kind": "PREFERRED",
                    "weight": 100,
                },
                {
                    "entity_type": "CLASS",
                    "entity_id": "class-8b",
                    "day": 0,
                    "period": 1,
                    "kind": "PREFERRED",
                    "weight": 100,
                },
                {
                    "entity_type": "CLASS",
                    "entity_id": "class-9a",
                    "day": 0,
                    "period": 2,
                    "kind": "PREFERRED",
                    "weight": 100,
                },
                {
                    "entity_type": "CLASS",
                    "entity_id": "class-9a",
                    "day": 0,
                    "period": 3,
                    "kind": "PREFERRED",
                    "weight": 100,
                },
            ],
        },
    )

    assert response.status_code == 200, response.text
    lessons = response.json()["lessons"]
    by_assignment: dict[str, list[dict[str, object]]] = {}
    for lesson in lessons:
        by_assignment.setdefault(lesson["assignment_id"], []).append(lesson)

    assert len(by_assignment["tv-9b"]) == 2
    eight_b = by_assignment["tv-8b"][0]
    nine_a = by_assignment["tv-9a"][0]
    nine_b = sorted(by_assignment["tv-9b"], key=lambda item: item["block_id"])

    assert (eight_b["day"], eight_b["period"]) == (
        nine_b[0]["day"],
        nine_b[0]["period"],
    )
    assert (nine_a["day"], nine_a["period"]) == (
        nine_b[1]["day"],
        nine_b[1]["period"],
    )


def test_tv_sync_preference_yields_to_teacher_conflict() -> None:
    response = client.post(
        "/solve",
        json={
            "periods_per_day": [4],
            "classes": [
                {"id": "class-6a", "code": "6.A"},
                {"id": "class-6c", "code": "6.C"},
            ],
            "subjects": [{"id": "subject-tv", "code": "TV"}],
            "assignments": [
                _tv_assignment("tv-6a", "shared-teacher", "class-6a"),
                _tv_assignment("tv-6c", "shared-teacher", "class-6c"),
            ],
        },
    )

    assert response.status_code == 200, response.text
    lessons = response.json()["lessons"]
    assert len(lessons) == 2
    assert {
        (lesson["day"], lesson["period"])
        for lesson in lessons
    } == {(0, 0), (0, 2)}
