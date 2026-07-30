from app.models import ScheduledLesson, SolveRequest
from app.scoring import score_schedule
from app.validator import validate_schedule


def _request() -> SolveRequest:
    return SolveRequest.model_validate(
        {
            "periods_per_day": [4],
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
        }
    )


def test_hard_conflict_has_no_score() -> None:
    payload = _request()
    lessons = [
        ScheduledLesson(
            block_id="math-6a:0",
            assignment_id="math-6a",
            teacher_id="teacher-1",
            class_id="6a",
            subject_id="math",
            group="WHOLE",
            room_id=None,
            day=0,
            period=0,
            duration=1,
        ),
        ScheduledLesson(
            block_id="math-7a:0",
            assignment_id="math-7a",
            teacher_id="teacher-1",
            class_id="7a",
            subject_id="math",
            group="WHOLE",
            room_id=None,
            day=0,
            period=0,
            duration=1,
        ),
    ]

    issues = validate_schedule(payload, lessons)
    assert any(issue.code == "TEACHER_COLLISION" for issue in issues)
    score = score_schedule(payload, lessons)
    assert score.valid is False
    assert score.total is None


def test_score_is_deterministic_and_category_sum_matches_total() -> None:
    payload = _request()
    lessons = [
        ScheduledLesson(
            block_id="math-6a:0",
            assignment_id="math-6a",
            teacher_id="teacher-1",
            class_id="6a",
            subject_id="math",
            group="WHOLE",
            room_id=None,
            day=0,
            period=0,
            duration=1,
        ),
        ScheduledLesson(
            block_id="math-7a:0",
            assignment_id="math-7a",
            teacher_id="teacher-1",
            class_id="7a",
            subject_id="math",
            group="WHOLE",
            room_id=None,
            day=0,
            period=1,
            duration=1,
        ),
    ]

    first = score_schedule(payload, lessons)
    second = score_schedule(payload, lessons)
    assert first == second
    assert first.total == sum(first.categories.values())
    assert first.valid is True
