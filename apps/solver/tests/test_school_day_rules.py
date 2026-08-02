from fastapi.testclient import TestClient

from app.main import app
from app.models import ScheduledLesson, SolveRequest, TeachingGroup
from app.validator import validate_schedule

client = TestClient(app)


def unavailable_periods(periods: list[int]) -> list[dict[str, object]]:
    return [
        {
            "entity_type": "TEACHER",
            "entity_id": "teacher-1",
            "day": 0,
            "period": period,
            "kind": "UNAVAILABLE",
        }
        for period in periods
    ]


def double_lesson_payload(allowed_periods: set[int]) -> dict[str, object]:
    return {
        "periods_per_day": [8],
        "assignments": [
            {
                "id": "double-lesson",
                "teacher_id": "teacher-1",
                "class_id": "class-1",
                "subject_id": "subject-1",
                "weekly_periods": 2,
                "lesson_shape": "DOUBLE",
            }
        ],
        "availability": unavailable_periods([period for period in range(8) if period not in allowed_periods]),
    }


def test_double_lesson_cannot_cross_morning_and_afternoon_boundary() -> None:
    response = client.post("/solve", json=double_lesson_payload({5, 6}))

    assert response.status_code == 422
    detail = response.json()["detail"]
    assert detail["code"] == "INFEASIBLE_INPUT"
    assert any(cause["code"] == "EMPTY_CANDIDATE_SET" for cause in detail["causes"])


def test_double_lesson_can_start_after_the_lunch_break() -> None:
    response = client.post("/solve", json=double_lesson_payload({6, 7}))

    assert response.status_code == 200, response.text
    lesson = response.json()["lessons"][0]
    assert lesson["period"] == 6
    assert lesson["duration"] == 2


def test_regular_class_starts_at_eight_every_weekday() -> None:
    response = client.post(
        "/solve",
        json={
            "periods_per_day": [2, 2, 2, 2, 2],
            "assignments": [
                {
                    "id": "daily-lesson",
                    "teacher_id": "teacher-1",
                    "class_id": "class-1",
                    "subject_id": "subject-1",
                    "weekly_periods": 5,
                    "lesson_shape": "SINGLE",
                    "max_per_day": 1,
                }
            ],
        },
    )

    assert response.status_code == 200, response.text
    lessons = response.json()["lessons"]
    assert sorted((lesson["day"], lesson["period"]) for lesson in lessons) == [
        (0, 0),
        (1, 0),
        (2, 0),
        (3, 0),
        (4, 0),
    ]


def test_regular_class_has_continuous_lessons_from_eight() -> None:
    response = client.post(
        "/solve",
        json={
            "periods_per_day": [3, 3, 3, 3, 3],
            "assignments": [
                {
                    "id": "daily-math",
                    "teacher_id": "teacher-1",
                    "class_id": "class-1",
                    "subject_id": "math",
                    "weekly_periods": 5,
                    "max_per_day": 1,
                },
                {
                    "id": "daily-czech",
                    "teacher_id": "teacher-2",
                    "class_id": "class-1",
                    "subject_id": "czech",
                    "weekly_periods": 5,
                    "max_per_day": 1,
                },
            ],
        },
    )

    assert response.status_code == 200, response.text
    lessons = response.json()["lessons"]
    for day in range(5):
        assert sorted(
            lesson["period"] for lesson in lessons if lesson["day"] == day
        ) == [0, 1]


def test_validator_rejects_internal_class_gap() -> None:
    payload = SolveRequest.model_validate(
        {
            "periods_per_day": [3, 1, 1, 1, 1],
            "assignments": [
                {
                    "id": "daily-lesson",
                    "teacher_id": "teacher-1",
                    "class_id": "class-1",
                    "subject_id": "subject-1",
                    "weekly_periods": 6,
                    "max_per_day": 2,
                }
            ],
        }
    )
    positions = [(0, 0), (0, 2), (1, 0), (2, 0), (3, 0), (4, 0)]
    lessons = [
        ScheduledLesson(
            block_id=f"daily-lesson:{index}",
            assignment_id="daily-lesson",
            teacher_id="teacher-1",
            class_id="class-1",
            subject_id="subject-1",
            group=TeachingGroup.WHOLE,
            room_id=None,
            day=day,
            period=period,
            duration=1,
        )
        for index, (day, period) in enumerate(positions)
    ]

    issues = validate_schedule(payload, lessons)

    assert any(issue.code == "CLASS_HAS_INTERNAL_GAP" for issue in issues)
