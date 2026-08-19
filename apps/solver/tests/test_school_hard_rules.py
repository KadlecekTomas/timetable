from fastapi.testclient import TestClient

from app.main import app
from app.models import ScheduledLesson, SolveRequest, TeachingGroup
from app.validator import validate_schedule

client = TestClient(app)


def assignment(assignment_id: str, class_id: str) -> dict[str, object]:
    return {
        "id": assignment_id,
        "teacher_id": "teacher-1",
        "class_id": class_id,
        "subject_id": "subject-general",
        "weekly_periods": 1,
    }


def fixed(assignment_id: str, period: int, *, day: int = 0) -> dict[str, object]:
    return {
        "assignment_id": assignment_id,
        "block_index": 0,
        "day": day,
        "period": period,
    }


def test_teacher_can_teach_fourth_and_sixth_with_fifth_free() -> None:
    response = client.post(
        "/solve",
        json={
            "periods_per_day": [6],
            "assignments": [
                assignment("lesson-4", "class-4"),
                assignment("lesson-6", "class-6"),
            ],
            "fixed_lessons": [
                fixed("lesson-4", 3),
                fixed("lesson-6", 5),
            ],
        },
    )

    assert response.status_code == 200, response.text
    assert sorted(lesson["period"] for lesson in response.json()["lessons"]) == [
        3,
        5,
    ]


def test_teacher_cannot_teach_fourth_fifth_and_sixth_without_break() -> None:
    response = client.post(
        "/solve",
        json={
            "periods_per_day": [6],
            "assignments": [
                assignment("lesson-4", "class-4"),
                assignment("lesson-5", "class-5"),
                assignment("lesson-6", "class-6"),
            ],
            "fixed_lessons": [
                fixed("lesson-4", 3),
                fixed("lesson-5", 4),
                fixed("lesson-6", 5),
            ],
        },
    )

    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "INFEASIBLE"


def test_friday_seventh_and_later_periods_are_forbidden() -> None:
    response = client.post(
        "/solve",
        json={
            "periods_per_day": [8, 8, 8, 8, 8],
            "assignments": [assignment("friday-afternoon", "class-1")],
            "fixed_lessons": [fixed("friday-afternoon", 6, day=4)],
        },
    )

    assert response.status_code == 422
    detail = response.json()["detail"]
    assert detail["code"] == "INFEASIBLE_INPUT"
    assert any(cause["code"] == "EMPTY_CANDIDATE_SET" for cause in detail["causes"])


def history_payload(periods: tuple[int, int]) -> dict[str, object]:
    return {
        "periods_per_day": [6],
        "subjects": [{"id": "subject-history", "code": "DEJ"}],
        "assignments": [
            {
                "id": "history",
                "teacher_id": "teacher-history",
                "class_id": "class-1",
                "subject_id": "subject-history",
                "weekly_periods": 2,
            }
        ],
        "fixed_lessons": [
            {
                "assignment_id": "history",
                "block_index": index,
                "day": 0,
                "period": period,
            }
            for index, period in enumerate(periods)
        ],
    }


def test_consecutive_history_lessons_are_infeasible() -> None:
    response = client.post("/solve", json=history_payload((1, 2)))

    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "INFEASIBLE"


def test_nonconsecutive_history_lessons_are_allowed() -> None:
    response = client.post("/solve", json=history_payload((1, 3)))

    assert response.status_code == 200, response.text
    assert sorted(lesson["period"] for lesson in response.json()["lessons"]) == [
        1,
        3,
    ]


def test_validator_reports_all_school_hard_rule_violations() -> None:
    payload = SolveRequest.model_validate(
        {
            "periods_per_day": [8, 8, 8, 8, 8],
            "subjects": [
                {"id": "subject-history", "code": "DEJ"},
                {"id": "subject-tv", "code": "TV"},
            ],
            "assignments": [
                {
                    "id": "history",
                    "teacher_id": "teacher-1",
                    "class_id": "class-history",
                    "subject_id": "subject-history",
                    "weekly_periods": 2,
                },
                {
                    "id": "tv",
                    "teacher_id": "teacher-1",
                    "class_id": "class-tv",
                    "subject_id": "subject-tv",
                    "weekly_periods": 4,
                    "lesson_shape": "DOUBLE",
                    "max_per_day": 2,
                },
                assignment("break-6", "class-break"),
            ],
        }
    )
    lessons = [
        ScheduledLesson(
            block_id="history:0",
            assignment_id="history",
            teacher_id="teacher-1",
            class_id="class-history",
            subject_id="subject-history",
            group=TeachingGroup.WHOLE,
            room_id=None,
            day=0,
            period=3,
            duration=1,
        ),
        ScheduledLesson(
            block_id="history:1",
            assignment_id="history",
            teacher_id="teacher-1",
            class_id="class-history",
            subject_id="subject-history",
            group=TeachingGroup.WHOLE,
            room_id=None,
            day=0,
            period=4,
            duration=1,
        ),
        ScheduledLesson(
            block_id="break-6:0",
            assignment_id="break-6",
            teacher_id="teacher-1",
            class_id="class-break",
            subject_id="subject-general",
            group=TeachingGroup.WHOLE,
            room_id=None,
            day=0,
            period=5,
            duration=1,
        ),
        ScheduledLesson(
            block_id="tv:0",
            assignment_id="tv",
            teacher_id="teacher-1",
            class_id="class-tv",
            subject_id="subject-tv",
            group=TeachingGroup.WHOLE,
            room_id=None,
            day=4,
            period=3,
            duration=2,
        ),
        ScheduledLesson(
            block_id="tv:1",
            assignment_id="tv",
            teacher_id="teacher-1",
            class_id="class-tv",
            subject_id="subject-tv",
            group=TeachingGroup.WHOLE,
            room_id=None,
            day=4,
            period=6,
            duration=2,
        ),
    ]

    issue_codes = {issue.code for issue in validate_schedule(payload, lessons)}

    assert "TEACHER_BREAK_MISSING" in issue_codes
    assert "FRIDAY_AFTERNOON_FORBIDDEN" in issue_codes
    assert "MAX_PER_DAY_EXCEEDED" in issue_codes
    assert "CONSECUTIVE_HISTORY_LESSONS" in issue_codes
