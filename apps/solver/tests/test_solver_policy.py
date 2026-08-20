from app.models import (
    Assignment,
    ClassDayPolicy,
    QualityPolicy,
    SchoolClass,
    SolveRequest,
    SolverPolicy,
    Subject,
    SubjectDailyLimit,
    SubjectWindowRule,
    TeacherAfternoonBreakPolicy,
)
from app.policy import (
    candidate_exceeds_day_boundary,
    candidate_violates_subject_window,
    class_day_pattern_allowed,
    daily_subject_limit,
    teacher_afternoon_break_satisfied,
)


def payload() -> SolveRequest:
    return SolveRequest(
        periods_per_day=[8, 8, 8, 8, 7],
        classes=[SchoolClass(id="class:8-A", code="8.A")],
        subjects=[
            Subject(id="subject:CJ", code="CJ"),
            Subject(id="subject:TV", code="TV"),
        ],
        assignments=[
            Assignment(
                id="assignment:cj",
                teacher_id="teacher:cj",
                class_id="class:8-A",
                subject_id="subject:CJ",
                weekly_periods=1,
            ),
            Assignment(
                id="assignment:tv",
                teacher_id="teacher:tv",
                class_id="class:8-A",
                subject_id="subject:TV",
                weekly_periods=1,
            ),
        ],
        policy=SolverPolicy(
            forbidden_subject_windows=[
                SubjectWindowRule(subject_codes=["CJ"], periods=[6, 7])
            ],
            subject_daily_limits=[
                SubjectDailyLimit(subject_codes=["CJ"], max_periods_per_day=1)
            ],
            class_day=ClassDayPolicy(
                require_first_period=True,
                allowed_afternoon_patterns=[
                    [0, 1, 2, 3, 5, 6],
                    [0, 1, 2, 3, 4, 6, 7],
                ],
                latest_period_by_day=[7, 7, 7, 7, 5],
            ),
            teacher_afternoon_break=TeacherAfternoonBreakPolicy(
                enabled=True,
                afternoon_start_period=6,
                break_periods=[3, 4, 5],
                minimum_free_periods=1,
            ),
            quality=QualityPolicy(),
        ),
    )


def assignment(request: SolveRequest, assignment_id: str) -> Assignment:
    return next(item for item in request.assignments if item.id == assignment_id)


def test_forbidden_subject_window_only_blocks_configured_subjects() -> None:
    request = payload()
    cj = assignment(request, "assignment:cj")
    tv = assignment(request, "assignment:tv")

    assert candidate_violates_subject_window(
        request, cj, day=1, period=6, duration=1
    )
    assert not candidate_violates_subject_window(
        request, cj, day=1, period=5, duration=1
    )
    assert not candidate_violates_subject_window(
        request, tv, day=1, period=7, duration=1
    )


def test_friday_latest_period_is_policy_data() -> None:
    request = payload()
    assert not candidate_exceeds_day_boundary(request, day=4, period=5, duration=1)
    assert candidate_exceeds_day_boundary(request, day=4, period=6, duration=1)
    assert candidate_exceeds_day_boundary(request, day=4, period=5, duration=2)
    assert not candidate_exceeds_day_boundary(request, day=2, period=7, duration=1)


def test_only_explicit_lunch_patterns_allow_an_internal_class_gap() -> None:
    request = payload()

    assert class_day_pattern_allowed(request, [0, 1, 2, 3, 4, 5])
    assert class_day_pattern_allowed(request, [0, 1, 2, 3, 5, 6])
    assert class_day_pattern_allowed(request, [0, 1, 2, 3, 4, 6, 7])

    assert not class_day_pattern_allowed(request, [0, 1, 2, 4, 5])
    assert not class_day_pattern_allowed(request, [0, 1, 2, 3, 4, 5, 6])
    assert not class_day_pattern_allowed(request, [1, 2, 3, 4])


def test_teacher_break_is_required_only_on_an_afternoon_day() -> None:
    request = payload()

    # Six straight morning lessons are explicitly allowed.
    assert teacher_afternoon_break_satisfied(request, [0, 1, 2, 3, 4, 5])

    # If period 7/8 is taught, one of human periods 4-6 must be free.
    assert not teacher_afternoon_break_satisfied(request, [0, 1, 2, 3, 4, 5, 6])
    assert teacher_afternoon_break_satisfied(request, [0, 1, 2, 3, 4, 6, 7])
    assert teacher_afternoon_break_satisfied(request, [0, 1, 2, 3, 5, 6])


def test_subject_daily_limit_is_configurable() -> None:
    request = payload()
    assert daily_subject_limit(request, "subject:CJ") == 1
    assert daily_subject_limit(request, "subject:TV") is None
