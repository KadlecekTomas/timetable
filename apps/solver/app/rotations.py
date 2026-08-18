from __future__ import annotations

from collections import defaultdict
from typing import Any

from ortools.sat.python import cp_model

from app.class_groups import (
    assignment_class_ids,
    class_required_weekly_periods,
    rotation_assignment_legs,
)
from app.models import (
    LessonShape,
    RotationPlacement,
    ScheduledLesson,
    SolveRequest,
    TeachingGroup,
    ValidationIssue,
)
from app.school_day import crosses_lunch_break

AFTERNOON_START_PERIOD = 6  # zero-based: 7th lesson, after lunch
ALLOWED_CLASS_AFTERNOON_DAYS = {1, 2, 3}  # Tuesday, Wednesday, Thursday
CLASS_DAY_BALANCE_WEIGHT = 50_000
TEACHER_GAP_EXTRA_WEIGHT = 5_000
ASSIGNMENT_SPREAD_EXTRA_WEIGHT = 2_450
TV_SYNC_BONUS = 1_500

# Requested PE pairings. These are deliberately soft preferences: the solver
# rewards a shared start slot, but teacher/class/room feasibility always wins.
# 9.B has two double blocks: one is paired with 8.B, the other with 9.A.
TV_SYNC_BLOCK_GROUPS: tuple[tuple[tuple[str, int], ...], ...] = (
    (("6.A", 0), ("6.C", 0)),
    (("6.B", 0), ("6.D", 0), ("7.B", 0)),
    (("6.B", 1), ("6.D", 1), ("7.B", 1)),
    (("6.B", 2), ("6.D", 2), ("7.B", 2)),
    (("7.A", 0), ("7.C", 0)),
    (("8.B", 0), ("9.B", 0)),
    (("9.A", 0), ("9.B", 1)),
)


def effective_rotation_placement(assignments: tuple[Any, ...]) -> RotationPlacement:
    placements = {
        assignment.rotation_placement or RotationPlacement.SAME_DAY
        for assignment in assignments
    }
    if len(placements) != 1:
        raise ValueError("All assignments in one rotation must share placement mode")
    return next(iter(placements))


def _position_variables(
    candidates: list[tuple[Any, cp_model.IntVar]],
) -> dict[tuple[int, int], list[cp_model.IntVar]]:
    positions: dict[tuple[int, int], list[cp_model.IntVar]] = defaultdict(list)
    for candidate, variable in candidates:
        positions[(candidate.day, candidate.period)].append(variable)
    return dict(positions)


def _non_overlapping(
    left_period: int,
    right_period: int,
    duration: int,
) -> bool:
    return (
        left_period + duration <= right_period
        or right_period + duration <= left_period
    )


def _placement_allowed(
    placement: RotationPlacement,
    left_position: tuple[int, int],
    right_position: tuple[int, int],
    duration: int,
) -> bool:
    left_day, left_period = left_position
    right_day, right_period = right_position

    if placement == RotationPlacement.ADJACENT:
        if left_day != right_day:
            return False
        if abs(left_period - right_period) != duration:
            return False
        combined_start = min(left_period, right_period)
        return not crosses_lunch_break(combined_start, duration * 2)

    if placement == RotationPlacement.SAME_DAY:
        return left_day == right_day and _non_overlapping(
            left_period,
            right_period,
            duration,
        )

    return left_day != right_day or _non_overlapping(
        left_period,
        right_period,
        duration,
    )


def _placement_cost(
    placement: RotationPlacement,
    left_position: tuple[int, int],
    right_position: tuple[int, int],
    duration: int,
) -> int:
    left_day, left_period = left_position
    right_day, right_period = right_position

    if placement == RotationPlacement.ADJACENT:
        return 0

    if left_day == right_day:
        return max(0, abs(left_period - right_period) - duration)

    # Flexible rotations may use different days, but the objective still prefers
    # the closest possible swap before spending a whole extra school day.
    return abs(left_day - right_day) * 20 + abs(left_period - right_period)


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


def _preferred_tv_assignments(payload: SolveRequest) -> dict[str, Any]:
    class_code_by_id = {school_class.id: school_class.code for school_class in payload.classes}
    subject_code_by_id = {subject.id: subject.code.strip().upper() for subject in payload.subjects}
    candidates: dict[str, list[Any]] = defaultdict(list)

    for assignment in payload.assignments:
        if subject_code_by_id.get(assignment.subject_id, "") != "TV":
            continue
        class_ids = assignment_class_ids(assignment)
        if len(class_ids) != 1:
            continue
        class_code = class_code_by_id.get(class_ids[0], "")
        if class_code:
            candidates[class_code].append(assignment)

    priority = {
        TeachingGroup.GROUP_1: 0,
        TeachingGroup.WHOLE: 1,
        TeachingGroup.GROUP_2: 2,
        TeachingGroup.GROUP_3: 3,
    }
    return {
        class_code: sorted(
            assignments,
            key=lambda assignment: (priority[assignment.group], assignment.id),
        )[0]
        for class_code, assignments in candidates.items()
        if assignments
    }


def _block_slot_variable(
    *,
    model: cp_model.CpModel,
    block: Any,
    variables: dict[str, list[tuple[Any, cp_model.IntVar]]],
) -> cp_model.IntVar:
    candidates = variables[block.id]
    encoded = [(candidate.day * 16 + candidate.period, variable) for candidate, variable in candidates]
    upper_bound = max((slot for slot, _variable in encoded), default=0)
    slot = model.new_int_var(0, upper_bound, f"tv_sync_slot_{block.id}")
    model.add(slot == sum(value * variable for value, variable in encoded))
    return slot


def _add_preferred_tv_sync(
    *,
    model: cp_model.CpModel,
    payload: SolveRequest,
    blocks_by_assignment: dict[str, list[Any]],
    variables: dict[str, list[tuple[Any, cp_model.IntVar]]],
    objective_terms: list[cp_model.LinearExpr],
) -> None:
    representatives = _preferred_tv_assignments(payload)
    slot_cache: dict[str, cp_model.IntVar] = {}

    for group_index, requested_group in enumerate(TV_SYNC_BLOCK_GROUPS):
        blocks: list[Any] = []
        for class_code, block_index in requested_group:
            assignment = representatives.get(class_code)
            if assignment is None:
                continue
            assignment_blocks = sorted(
                blocks_by_assignment.get(assignment.id, []),
                key=lambda block: block.index,
            )
            if block_index >= len(assignment_blocks):
                continue
            blocks.append(assignment_blocks[block_index])

        for left_index, left in enumerate(blocks):
            for right in blocks[left_index + 1 :]:
                if left.duration != right.duration:
                    continue
                left_slot = slot_cache.get(left.id)
                if left_slot is None:
                    left_slot = _block_slot_variable(
                        model=model,
                        block=left,
                        variables=variables,
                    )
                    slot_cache[left.id] = left_slot
                right_slot = slot_cache.get(right.id)
                if right_slot is None:
                    right_slot = _block_slot_variable(
                        model=model,
                        block=right,
                        variables=variables,
                    )
                    slot_cache[right.id] = right_slot

                same_slot = model.new_bool_var(
                    f"tv_sync_{group_index}_{left.id}_{right.id}"
                )
                model.add(left_slot == right_slot).only_enforce_if(same_slot)
                model.add(left_slot != right_slot).only_enforce_if(same_slot.Not())
                objective_terms.append(same_slot * -TV_SYNC_BONUS)


def _add_school_quality_policy(
    *,
    model: cp_model.CpModel,
    payload: SolveRequest,
    blocks_by_assignment: dict[str, list[Any]],
    variables: dict[str, list[tuple[Any, cp_model.IntVar]]],
    objective_terms: list[cp_model.LinearExpr],
) -> None:
    """Apply the agreed school-level quality rules to every full timetable solve.

    The class timetable is a pedagogical invariant: afternoons are only Tue/Wed/Thu,
    never on consecutive days, and weekly load is kept as even as possible. Teacher
    gaps and repeated standalone blocks receive school-scale objective weights so the
    five-minute mode spends its search budget on the things leadership actually sees.
    """

    class_sources: dict[tuple[str, int, int], list[cp_model.IntVar]] = defaultdict(list)
    teacher_sources: dict[tuple[str, int, int], list[cp_model.IntVar]] = defaultdict(list)

    for assignment in payload.assignments:
        for block in blocks_by_assignment[assignment.id]:
            for candidate, variable in variables[block.id]:
                for period in range(candidate.period, candidate.period + block.duration):
                    teacher_sources[(assignment.teacher_id, candidate.day, period)].append(
                        variable
                    )
                    for class_id in assignment_class_ids(assignment):
                        class_sources[(class_id, candidate.day, period)].append(variable)

    # Strongly minimize teacher gaps. main.py already contributes payload.weights.teacher_gap;
    # this extra term raises the effective school profile from 1,000 to 6,000 without
    # changing the public contract or old saved snapshots.
    teacher_ids = sorted({assignment.teacher_id for assignment in payload.assignments})
    for teacher_id in teacher_ids:
        for day, periods in enumerate(payload.periods_per_day):
            occupancy = [
                _occupancy_bool(
                    model,
                    teacher_sources.get((teacher_id, day, period), []),
                    f"quality_teacher_{teacher_id}_{day}_{period}",
                )
                for period in range(periods)
            ]
            for period in range(1, periods - 1):
                before = model.new_bool_var(
                    f"quality_teacher_before_{teacher_id}_{day}_{period}"
                )
                after = model.new_bool_var(
                    f"quality_teacher_after_{teacher_id}_{day}_{period}"
                )
                before_sum = sum(occupancy[:period])
                after_sum = sum(occupancy[period + 1 :])
                model.add(before_sum >= before)
                model.add(before_sum <= period * before)
                model.add(after_sum >= after)
                model.add(after_sum <= (periods - period - 1) * after)

                gap = model.new_bool_var(
                    f"quality_teacher_gap_{teacher_id}_{day}_{period}"
                )
                model.add(gap <= before)
                model.add(gap <= after)
                model.add(gap + occupancy[period] <= 1)
                model.add(gap >= before + after - occupancy[period] - 1)
                objective_terms.append(gap * TEACHER_GAP_EXTRA_WEIGHT)

    # Raise same-day standalone concentration from 50 to an effective 2,500.
    for assignment in payload.assignments:
        if assignment.lesson_shape == LessonShape.DOUBLE:
            continue
        assignment_blocks = blocks_by_assignment[assignment.id]
        for day in range(len(payload.periods_per_day)):
            day_variables = [
                variable
                for block in assignment_blocks
                for candidate, variable in variables[block.id]
                if candidate.day == day
            ]
            count = model.new_int_var(
                0,
                len(assignment_blocks),
                f"quality_assignment_count_{assignment.id}_{day}",
            )
            model.add(count == sum(day_variables))
            excess = model.new_int_var(
                0,
                len(assignment_blocks),
                f"quality_assignment_excess_{assignment.id}_{day}",
            )
            model.add(excess >= count - 1)
            objective_terms.append(excess * ASSIGNMENT_SPREAD_EXTRA_WEIGHT)

    # The following policy is specifically the five-day second-stage school week.
    if len(payload.periods_per_day) != 5:
        return

    required_periods = class_required_weekly_periods(payload.assignments)
    for class_id, weekly_periods in sorted(required_periods.items()):
        if weekly_periods < 5:
            continue

        # 29h => >=5/day, 30h => >=5/day, 31-34h => >=6/day.
        minimum_daily_load = max(1, ((weekly_periods + 4) // 5) - 1)
        day_loads: list[cp_model.IntVar] = []
        afternoon_flags: list[cp_model.IntVar] = []

        for day, periods in enumerate(payload.periods_per_day):
            occupancy = [
                _occupancy_bool(
                    model,
                    class_sources.get((class_id, day, period), []),
                    f"quality_class_{class_id}_{day}_{period}",
                )
                for period in range(periods)
            ]
            load = model.new_int_var(0, periods, f"quality_class_load_{class_id}_{day}")
            model.add(load == sum(occupancy))
            model.add(load >= minimum_daily_load)
            day_loads.append(load)

            afternoon = model.new_bool_var(
                f"quality_class_afternoon_{class_id}_{day}"
            )
            late_slots = occupancy[AFTERNOON_START_PERIOD:]
            if late_slots:
                model.add(sum(late_slots) >= afternoon)
                model.add(sum(late_slots) <= len(late_slots) * afternoon)
            else:
                model.add(afternoon == 0)
            if day not in ALLOWED_CLASS_AFTERNOON_DAYS:
                model.add(afternoon == 0)
            afternoon_flags.append(afternoon)

        for day in range(4):
            model.add(afternoon_flags[day] + afternoon_flags[day + 1] <= 1)

        max_load = model.new_int_var(
            0,
            max(payload.periods_per_day),
            f"quality_class_max_{class_id}",
        )
        min_load = model.new_int_var(
            0,
            max(payload.periods_per_day),
            f"quality_class_min_{class_id}",
        )
        model.add_max_equality(max_load, day_loads)
        model.add_min_equality(min_load, day_loads)
        spread = model.new_int_var(
            0,
            max(payload.periods_per_day),
            f"quality_class_spread_{class_id}",
        )
        model.add(spread == max_load - min_load)
        objective_terms.append(spread * CLASS_DAY_BALANCE_WEIGHT)


def add_rotation_constraints(
    *,
    model: cp_model.CpModel,
    payload: SolveRequest,
    blocks_by_assignment: dict[str, list[Any]],
    variables: dict[str, list[tuple[Any, cp_model.IntVar]]],
    objective_terms: list[cp_model.LinearExpr],
) -> list[dict[str, Any]]:
    diagnostics: list[dict[str, Any]] = []

    for rotation_key, leg_1, leg_2 in rotation_assignment_legs(payload.assignments):
        assignments = (*leg_1, *leg_2)
        placement = effective_rotation_placement(assignments)
        leg_1_blocks = sorted(
            blocks_by_assignment[leg_1[0].id],
            key=lambda block: block.index,
        )
        leg_2_blocks = sorted(
            blocks_by_assignment[leg_2[0].id],
            key=lambda block: block.index,
        )

        if len(leg_1_blocks) != len(leg_2_blocks):
            diagnostics.append(
                {
                    "code": "ROTATION_BLOCK_COUNT_MISMATCH",
                    "message": (
                        f"Výměna {rotation_key} nemá v obou ramenech stejný počet bloků."
                    ),
                    "entityIds": [assignment.id for assignment in assignments],
                }
            )
            continue

        for leg_1_block, leg_2_block in zip(
            leg_1_blocks,
            leg_2_blocks,
            strict=True,
        ):
            if leg_1_block.duration != leg_2_block.duration:
                diagnostics.append(
                    {
                        "code": "ROTATION_BLOCK_DURATION_MISMATCH",
                        "message": (
                            f"Výměna {rotation_key} nemá v obou ramenech stejnou délku odpovídajícího bloku."
                        ),
                        "entityIds": [
                            leg_1_block.assignment.id,
                            leg_2_block.assignment.id,
                        ],
                    }
                )
                continue

            left_positions = _position_variables(variables[leg_1_block.id])
            right_positions = _position_variables(variables[leg_2_block.id])
            pair_variables: list[
                tuple[
                    tuple[int, int],
                    tuple[int, int],
                    cp_model.IntVar,
                ]
            ] = []

            for left_position in sorted(left_positions):
                for right_position in sorted(right_positions):
                    if not _placement_allowed(
                        placement,
                        left_position,
                        right_position,
                        leg_1_block.duration,
                    ):
                        continue
                    pair_variable = model.new_bool_var(
                        "rotation_pair_"
                        f"{rotation_key}_{leg_1_block.index}_"
                        f"{left_position[0]}_{left_position[1]}_"
                        f"{right_position[0]}_{right_position[1]}"
                    )
                    pair_variables.append(
                        (left_position, right_position, pair_variable)
                    )
                    placement_cost = _placement_cost(
                        placement,
                        left_position,
                        right_position,
                        leg_1_block.duration,
                    )
                    if placement_cost:
                        objective_terms.append(
                            pair_variable
                            * placement_cost
                            * payload.weights.rotation_spread
                        )

            if not pair_variables:
                diagnostics.append(
                    {
                        "code": "ROTATION_PLACEMENT_UNAVAILABLE",
                        "message": (
                            f"Výměna {rotation_key} nemá žádnou dvojici umístění pro režim {placement.value}."
                        ),
                        "entityIds": [assignment.id for assignment in assignments],
                        "details": {
                            "placement": placement.value,
                            "blockIndex": leg_1_block.index,
                        },
                    }
                )
                continue

            model.add_exactly_one(
                [variable for _left, _right, variable in pair_variables]
            )

            for position, source_variables in left_positions.items():
                linked_pairs = [
                    pair_variable
                    for left_position, _right_position, pair_variable in pair_variables
                    if left_position == position
                ]
                model.add(sum(source_variables) == sum(linked_pairs))

            for position, source_variables in right_positions.items():
                linked_pairs = [
                    pair_variable
                    for _left_position, right_position, pair_variable in pair_variables
                    if right_position == position
                ]
                model.add(sum(source_variables) == sum(linked_pairs))

    _add_preferred_tv_sync(
        model=model,
        payload=payload,
        blocks_by_assignment=blocks_by_assignment,
        variables=variables,
        objective_terms=objective_terms,
    )
    _add_school_quality_policy(
        model=model,
        payload=payload,
        blocks_by_assignment=blocks_by_assignment,
        variables=variables,
        objective_terms=objective_terms,
    )
    return diagnostics


def validate_rotation_schedule(
    payload: SolveRequest,
    lessons_by_assignment: dict[str, list[ScheduledLesson]],
) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []

    for rotation_key, leg_1, leg_2 in rotation_assignment_legs(payload.assignments):
        assignments = (*leg_1, *leg_2)
        placement = effective_rotation_placement(assignments)
        leg_1_lessons = sorted(
            lessons_by_assignment.get(leg_1[0].id, []),
            key=lambda lesson: lesson.block_id,
        )
        leg_2_lessons = sorted(
            lessons_by_assignment.get(leg_2[0].id, []),
            key=lambda lesson: lesson.block_id,
        )
        if len(leg_1_lessons) != len(leg_2_lessons):
            continue

        for left, right in zip(
            leg_1_lessons,
            leg_2_lessons,
            strict=True,
        ):
            if left.duration != right.duration:
                continue

            if not _non_overlapping(
                left.period,
                right.period,
                left.duration,
            ) and (left.day == right.day):
                issues.append(
                    ValidationIssue(
                        code="ROTATION_LEGS_OVERLAP",
                        message=(
                            f"Ramena výměny {rotation_key} se nesmějí překrývat."
                        ),
                        entity_ids=[left.block_id, right.block_id],
                        day=left.day,
                        period=min(left.period, right.period),
                    )
                )
                continue

            if (
                placement
                in {
                    RotationPlacement.ADJACENT,
                    RotationPlacement.SAME_DAY,
                }
                and left.day != right.day
            ):
                issues.append(
                    ValidationIssue(
                        code="ROTATION_NOT_SAME_DAY",
                        message=(
                            f"Obě ramena výměny {rotation_key} musí proběhnout ve stejný den."
                        ),
                        entity_ids=[left.block_id, right.block_id],
                    )
                )
                continue

            if placement == RotationPlacement.ADJACENT:
                combined_start = min(left.period, right.period)
                if abs(left.period - right.period) != left.duration:
                    issues.append(
                        ValidationIssue(
                            code="ROTATION_NOT_ADJACENT",
                            message=(
                                f"Obě ramena výměny {rotation_key} musí být bezprostředně za sebou."
                            ),
                            entity_ids=[left.block_id, right.block_id],
                            day=left.day,
                            period=combined_start,
                        )
                    )
                elif crosses_lunch_break(
                    combined_start,
                    left.duration * 2,
                ):
                    issues.append(
                        ValidationIssue(
                            code="ROTATION_CROSSES_LUNCH_BREAK",
                            message=(
                                f"Výměna {rotation_key} nesmí být rozdělena obědovou přestávkou."
                            ),
                            entity_ids=[left.block_id, right.block_id],
                            day=left.day,
                            period=combined_start,
                        )
                    )

    return issues