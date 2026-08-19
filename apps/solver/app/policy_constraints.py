from __future__ import annotations

from collections import defaultdict
from typing import Any

from app.class_groups import (
    assignment_class_ids,
    class_required_weekly_periods,
)
from app.models import SolveRequest
from app.policy import daily_subject_limit, subject_code
from ortools.sat.python import cp_model


HARD_BALANCE_PRIORITY = 20_000


def _occupancy_bool(
    model: cp_model.CpModel,
    sources: list[cp_model.IntVar],
    name: str,
) -> cp_model.IntVar:
    occupied = model.new_bool_var(name)
    if not sources:
        model.add(occupied == 0)
        return occupied
    source_sum = sum(sources)
    model.add(source_sum >= occupied)
    model.add(source_sum <= len(sources) * occupied)
    return occupied


def _allowed_class_day_patterns(payload: SolveRequest, day: int) -> list[list[int]]:
    policy = payload.policy
    periods = payload.periods_per_day[day]
    if policy is None:
        return []

    latest_values = policy.class_day.latest_period_by_day
    latest = periods - 1
    if day < len(latest_values) and latest_values[day] is not None:
        latest = min(latest, int(latest_values[day]))

    afternoon_start = policy.teacher_afternoon_break.afternoon_start_period
    allowed: list[list[int]] = []

    maximum_prefix = min(periods, latest + 1, afternoon_start)
    for length in range(maximum_prefix + 1):
        occupied = set(range(length))
        allowed.append([1 if period in occupied else 0 for period in range(periods)])

    for pattern in policy.class_day.allowed_afternoon_patterns:
        if any(period >= periods or period > latest for period in pattern):
            continue
        occupied = set(pattern)
        if policy.class_day.require_first_period and occupied and 0 not in occupied:
            continue
        vector = [1 if period in occupied else 0 for period in range(periods)]
        if vector not in allowed:
            allowed.append(vector)

    return allowed


def add_policy_constraints(
    *,
    model: cp_model.CpModel,
    payload: SolveRequest,
    blocks_by_assignment: dict[str, list[Any]],
    variables: dict[str, list[tuple[Any, cp_model.IntVar]]],
    objective_terms: list[cp_model.LinearExpr],
) -> None:
    policy = payload.policy
    if policy is None:
        return

    class_sources: dict[tuple[str, int, int], list[cp_model.IntVar]] = defaultdict(list)
    teacher_sources: dict[tuple[str, int, int], list[cp_model.IntVar]] = defaultdict(list)
    class_subject_sources: dict[
        tuple[str, str, int, int], list[cp_model.IntVar]
    ] = defaultdict(list)

    for assignment in payload.assignments:
        code = subject_code(payload, assignment.subject_id)
        for block in blocks_by_assignment[assignment.id]:
            for candidate, variable in variables[block.id]:
                for occupied_period in range(
                    candidate.period, candidate.period + block.duration
                ):
                    teacher_sources[
                        (assignment.teacher_id, candidate.day, occupied_period)
                    ].append(variable)
                    for class_id in assignment_class_ids(assignment):
                        class_sources[(class_id, candidate.day, occupied_period)].append(
                            variable
                        )
                        if assignment.rotation_key is None:
                            class_subject_sources[
                                (class_id, code, candidate.day, occupied_period)
                            ].append(variable)

                late_weight = policy.quality.subject_late_weights.get(code, 0)
                afternoon_bonus = policy.quality.subject_afternoon_bonuses.get(code, 0)
                afternoon_start = policy.teacher_afternoon_break.afternoon_start_period
                late_periods = sum(
                    1
                    for occupied_period in range(
                        candidate.period, candidate.period + block.duration
                    )
                    if occupied_period >= max(0, afternoon_start - 1)
                )
                afternoon_periods = sum(
                    1
                    for occupied_period in range(
                        candidate.period, candidate.period + block.duration
                    )
                    if occupied_period >= afternoon_start
                )
                if late_weight and late_periods:
                    objective_terms.append(variable * late_weight * late_periods)
                if afternoon_bonus and afternoon_periods:
                    objective_terms.append(
                        variable * -afternoon_bonus * afternoon_periods
                    )

    class_ids = sorted(
        {
            class_id
            for assignment in payload.assignments
            for class_id in assignment_class_ids(assignment)
        }
    )
    required_by_class = class_required_weekly_periods(payload.assignments)
    regular_class_ids = {
        class_id
        for class_id, weekly_periods in required_by_class.items()
        if weekly_periods >= len(payload.periods_per_day)
    }

    class_occupancy: dict[tuple[str, int], list[cp_model.IntVar]] = {}
    for class_id in class_ids:
        for day, periods in enumerate(payload.periods_per_day):
            occupancy = [
                _occupancy_bool(
                    model,
                    class_sources.get((class_id, day, period), []),
                    f"policy_class_{class_id}_{day}_{period}",
                )
                for period in range(periods)
            ]
            class_occupancy[(class_id, day)] = occupancy
            if class_id in regular_class_ids:
                allowed = _allowed_class_day_patterns(payload, day)
                if allowed:
                    model.add_allowed_assignments(occupancy, allowed)

    codes_with_limits = sorted(
        {
            code
            for rule in policy.subject_daily_limits
            for code in rule.subject_codes
        }
    )
    for class_id in class_ids:
        for code in codes_with_limits:
            matching_subject = next(
                (
                    subject
                    for subject in payload.subjects
                    if subject.code.strip().upper() == code
                ),
                None,
            )
            if matching_subject is None:
                continue
            limit = daily_subject_limit(payload, matching_subject.id)
            if limit is None:
                continue
            for day, periods in enumerate(payload.periods_per_day):
                subject_occupancy = [
                    _occupancy_bool(
                        model,
                        class_subject_sources.get((class_id, code, day, period), []),
                        f"policy_subject_{class_id}_{code}_{day}_{period}",
                    )
                    for period in range(periods)
                ]
                model.add(sum(subject_occupancy) <= limit)

    break_policy = policy.teacher_afternoon_break
    if break_policy.enabled:
        teacher_ids = sorted({assignment.teacher_id for assignment in payload.assignments})
        for teacher_id in teacher_ids:
            for day, periods in enumerate(payload.periods_per_day):
                occupancy = [
                    _occupancy_bool(
                        model,
                        teacher_sources.get((teacher_id, day, period), []),
                        f"policy_teacher_{teacher_id}_{day}_{period}",
                    )
                    for period in range(periods)
                ]
                late_slots = occupancy[break_policy.afternoon_start_period :]
                if not late_slots:
                    continue
                afternoon = model.new_bool_var(
                    f"policy_teacher_afternoon_{teacher_id}_{day}"
                )
                model.add(sum(late_slots) >= afternoon)
                model.add(sum(late_slots) <= len(late_slots) * afternoon)
                relevant_break_slots = [
                    occupancy[period]
                    for period in break_policy.break_periods
                    if period < periods
                ]
                if not relevant_break_slots:
                    continue
                maximum_occupied = max(
                    0,
                    len(relevant_break_slots) - break_policy.minimum_free_periods,
                )
                model.add(sum(relevant_break_slots) <= maximum_occupied).only_enforce_if(
                    afternoon
                )

    for class_id in sorted(regular_class_ids):
        day_loads: list[cp_model.IntVar] = []
        for day, periods in enumerate(payload.periods_per_day):
            occupancy = class_occupancy[(class_id, day)]
            load = model.new_int_var(0, periods, f"policy_load_{class_id}_{day}")
            model.add(load == sum(occupancy))
            day_loads.append(load)

            afternoon_start = break_policy.afternoon_start_period
            late_slots = occupancy[afternoon_start:]
            if late_slots:
                afternoon = model.new_bool_var(
                    f"policy_class_afternoon_{class_id}_{day}"
                )
                model.add(sum(late_slots) >= afternoon)
                model.add(sum(late_slots) <= len(late_slots) * afternoon)
                day_weight = (
                    policy.quality.afternoon_day_weights[day]
                    if day < len(policy.quality.afternoon_day_weights)
                    else 0
                )
                total_weight = policy.quality.class_afternoon_weight + day_weight
                if total_weight:
                    objective_terms.append(afternoon * total_weight)

        if len(day_loads) >= 2 and policy.quality.class_daily_balance_weight:
            max_load = model.new_int_var(
                0,
                max(payload.periods_per_day),
                f"policy_max_load_{class_id}",
            )
            min_load = model.new_int_var(
                0,
                max(payload.periods_per_day),
                f"policy_min_load_{class_id}",
            )
            model.add_max_equality(max_load, day_loads)
            model.add_min_equality(min_load, day_loads)
            spread = model.new_int_var(
                0,
                max(payload.periods_per_day),
                f"policy_load_spread_{class_id}",
            )
            model.add(spread == max_load - min_load)
            if policy.quality.class_daily_balance_weight >= HARD_BALANCE_PRIORITY:
                model.add(spread <= 1)
            objective_terms.append(
                spread * policy.quality.class_daily_balance_weight
            )
