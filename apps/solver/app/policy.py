from __future__ import annotations

from collections.abc import Iterable

from app.models import Assignment, SolveRequest


def subject_code(payload: SolveRequest, subject_id: str) -> str:
    subject = next((item for item in payload.subjects if item.id == subject_id), None)
    return subject.code.strip().upper() if subject is not None else ""


def candidate_violates_subject_window(
    payload: SolveRequest,
    assignment: Assignment,
    *,
    day: int,
    period: int,
    duration: int,
) -> bool:
    policy = payload.policy
    if policy is None:
        return False
    code = subject_code(payload, assignment.subject_id)
    occupied = set(range(period, period + duration))
    for rule in policy.forbidden_subject_windows:
        if code not in rule.subject_codes:
            continue
        if rule.days is not None and day not in rule.days:
            continue
        if occupied.intersection(rule.periods):
            return True
    return False


def candidate_exceeds_day_boundary(
    payload: SolveRequest,
    *,
    day: int,
    period: int,
    duration: int,
) -> bool:
    policy = payload.policy
    if policy is None:
        return False
    latest = policy.class_day.latest_period_by_day
    if day >= len(latest) or latest[day] is None:
        return False
    return period + duration - 1 > int(latest[day])


def daily_subject_limit(payload: SolveRequest, subject_id: str) -> int | None:
    policy = payload.policy
    if policy is None:
        return None
    code = subject_code(payload, subject_id)
    limits = [
        rule.max_periods_per_day
        for rule in policy.subject_daily_limits
        if code in rule.subject_codes
    ]
    return min(limits) if limits else None


def _is_prefix(occupied: list[int]) -> bool:
    return occupied == list(range(len(occupied)))


def class_day_pattern_allowed(
    payload: SolveRequest,
    occupied_periods: Iterable[int],
) -> bool:
    """Validate one class/day occupancy against the generic day/lunch policy.

    Non-afternoon days remain compact prefixes from period zero. Once a class
    reaches the configured afternoon start, its occupied periods must match one
    of the school's explicit lunch/afternoon patterns exactly.
    """

    occupied = sorted(set(occupied_periods))
    if not occupied:
        return True
    policy = payload.policy
    if policy is None:
        return _is_prefix(occupied)

    class_day = policy.class_day
    if class_day.require_first_period and occupied[0] != 0:
        return False

    afternoon_start = policy.teacher_afternoon_break.afternoon_start_period
    has_afternoon = any(period >= afternoon_start for period in occupied)
    if not has_afternoon:
        return _is_prefix(occupied)

    return occupied in class_day.allowed_afternoon_patterns


def teacher_afternoon_break_satisfied(
    payload: SolveRequest,
    occupied_periods: Iterable[int],
) -> bool:
    occupied = set(occupied_periods)
    policy = payload.policy
    if policy is None or not policy.teacher_afternoon_break.enabled:
        return True

    rule = policy.teacher_afternoon_break
    if not any(period >= rule.afternoon_start_period for period in occupied):
        return True

    free = sum(1 for period in rule.break_periods if period not in occupied)
    return free >= rule.minimum_free_periods


def afternoon_day(payload: SolveRequest, occupied_periods: Iterable[int]) -> bool:
    occupied = set(occupied_periods)
    policy = payload.policy
    if policy is None:
        return False
    start = policy.teacher_afternoon_break.afternoon_start_period
    return any(period >= start for period in occupied)
