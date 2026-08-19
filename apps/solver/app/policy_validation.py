from __future__ import annotations

from collections import defaultdict

from app.class_groups import lesson_class_ids
from app.models import ScheduledLesson, SolveRequest, ValidationIssue
from app.policy import (
    candidate_exceeds_day_boundary,
    candidate_violates_subject_window,
    class_day_pattern_allowed,
    daily_subject_limit,
    subject_code,
    teacher_afternoon_break_satisfied,
)


def validate_policy_schedule(
    payload: SolveRequest,
    lessons: list[ScheduledLesson],
) -> list[ValidationIssue]:
    if payload.policy is None:
        return []

    issues: list[ValidationIssue] = []
    assignments = {assignment.id: assignment for assignment in payload.assignments}

    class_periods: dict[tuple[str, int], set[int]] = defaultdict(set)
    teacher_periods: dict[tuple[str, int], set[int]] = defaultdict(set)
    class_subject_periods: dict[tuple[str, str, int], set[int]] = defaultdict(set)

    for lesson in lessons:
        assignment = assignments.get(lesson.assignment_id)
        if assignment is None:
            continue
        if candidate_violates_subject_window(
            payload,
            assignment,
            day=lesson.day,
            period=lesson.period,
            duration=lesson.duration,
        ):
            issues.append(
                ValidationIssue(
                    code="POLICY_SUBJECT_WINDOW",
                    message=(
                        f"Předmět {subject_code(payload, assignment.subject_id)} "
                        "je umístěný do zakázaného časového okna."
                    ),
                    entity_ids=[lesson.block_id, assignment.subject_id],
                    day=lesson.day,
                    period=lesson.period,
                )
            )
        if candidate_exceeds_day_boundary(
            payload,
            day=lesson.day,
            period=lesson.period,
            duration=lesson.duration,
        ):
            issues.append(
                ValidationIssue(
                    code="POLICY_DAY_BOUNDARY",
                    message="Výuka přesahuje poslední povolenou hodinu daného dne.",
                    entity_ids=[lesson.block_id, lesson.class_id],
                    day=lesson.day,
                    period=lesson.period,
                )
            )

        code = subject_code(payload, assignment.subject_id)
        for period in range(lesson.period, lesson.period + lesson.duration):
            teacher_periods[(lesson.teacher_id, lesson.day)].add(period)
            for class_id in lesson_class_ids(lesson):
                class_periods[(class_id, lesson.day)].add(period)
                class_subject_periods[(class_id, code, lesson.day)].add(period)

    for (class_id, day), occupied in sorted(class_periods.items()):
        if not class_day_pattern_allowed(payload, occupied):
            issues.append(
                ValidationIssue(
                    code="POLICY_CLASS_DAY_PATTERN",
                    message=(
                        "Třída nemá kompaktní dopoledne ani jeden z povolených "
                        "obědových/odpoledních vzorů."
                    ),
                    entity_ids=[class_id],
                    day=day,
                    details={"occupiedPeriods": sorted(occupied)},
                )
            )

    for (teacher_id, day), occupied in sorted(teacher_periods.items()):
        if not teacher_afternoon_break_satisfied(payload, occupied):
            issues.append(
                ValidationIssue(
                    code="POLICY_TEACHER_AFTERNOON_BREAK",
                    message=(
                        "Učitel při odpolední výuce nemá požadovanou volnou hodinu "
                        "v obědovém okně."
                    ),
                    entity_ids=[teacher_id],
                    day=day,
                    details={"occupiedPeriods": sorted(occupied)},
                )
            )

    for (class_id, code, day), occupied in sorted(class_subject_periods.items()):
        subject = next(
            (
                item
                for item in payload.subjects
                if item.code.strip().upper() == code
            ),
            None,
        )
        if subject is None:
            continue
        limit = daily_subject_limit(payload, subject.id)
        if limit is None or len(occupied) <= limit:
            continue
        issues.append(
            ValidationIssue(
                code="POLICY_SUBJECT_DAILY_LIMIT",
                message=(
                    f"Třída má předmět {code} v jednom dni {len(occupied)}×, "
                    f"povolené maximum je {limit}."
                ),
                entity_ids=[class_id, subject.id],
                day=day,
                details={"occupiedPeriods": sorted(occupied), "limit": limit},
            )
        )

    return issues
