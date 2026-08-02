from __future__ import annotations

from collections import defaultdict
from typing import Any

from ortools.sat.python import cp_model

from app.class_groups import rotation_assignment_legs
from app.models import (
    RotationPlacement,
    ScheduledLesson,
    SolveRequest,
    ValidationIssue,
)
from app.school_day import crosses_lunch_break


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


def add_rotation_constraints(
    *,
    model: cp_model.CpModel,
    payload: SolveRequest,
    blocks_by_assignment: dict[str, list[Any]],
    variables: dict[str, list[tuple[Any, cp_model.IntVar]]],
    objective_terms: list[cp_model.LinearExpr],
) -> list[dict[str, Any]]:
    diagnostics: list[dict[str, Any]] = []

    for rotation_key, leg_1, leg_2 in rotation_assignment_legs(
        payload.assignments
    ):
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
                        f"Výměna {rotation_key} nemá v obou ramenech stejný "
                        "počet bloků."
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
                            f"Výměna {rotation_key} nemá v obou ramenech "
                            "stejnou délku odpovídajícího bloku."
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
                            f"Výměna {rotation_key} nemá žádnou dvojici "
                            f"umístění pro režim {placement.value}."
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

    return diagnostics


def validate_rotation_schedule(
    payload: SolveRequest,
    lessons_by_assignment: dict[str, list[ScheduledLesson]],
) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []

    for rotation_key, leg_1, leg_2 in rotation_assignment_legs(
        payload.assignments
    ):
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

            if not _non_overlapping(left.period, right.period, left.duration) and (
                left.day == right.day
            ):
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

            if placement in {
                RotationPlacement.ADJACENT,
                RotationPlacement.SAME_DAY,
            } and left.day != right.day:
                issues.append(
                    ValidationIssue(
                        code="ROTATION_NOT_SAME_DAY",
                        message=(
                            f"Obě ramena výměny {rotation_key} musí proběhnout "
                            "ve stejný den."
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
                                f"Obě ramena výměny {rotation_key} musí být "
                                "bezprostředně za sebou."
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
                                f"Výměna {rotation_key} nesmí být rozdělena "
                                "obědovou přestávkou."
                            ),
                            entity_ids=[left.block_id, right.block_id],
                            day=left.day,
                            period=combined_start,
                        )
                    )

    return issues
