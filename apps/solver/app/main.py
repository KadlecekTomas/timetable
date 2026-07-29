from collections import defaultdict
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

import ortools
from fastapi import FastAPI, HTTPException
from ortools.sat.python import cp_model
from pydantic import BaseModel

from app.models import (
    Assignment,
    AvailabilityEntityType,
    AvailabilityKind,
    FixedLesson,
    ScheduledLesson,
    SolveRequest,
    SolveResponse,
    TeachingGroup,
)
from app.scoring import score_schedule
from app.validator import validate_schedule

app = FastAPI(title="Timetable Solver", version="0.3.0")


@dataclass(frozen=True)
class Block:
    assignment: Assignment
    index: int
    duration: int

    @property
    def id(self) -> str:
        return f"{self.assignment.id}:{self.index}"


@dataclass(frozen=True)
class CandidateKey:
    day: int
    period: int
    room_id: str | None


class HealthResponse(BaseModel):
    service: str
    status: str
    ortools_version: str
    timestamp: datetime


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(
        service="solver",
        status="ok",
        ortools_version=ortools.__version__,
        timestamp=datetime.now(UTC),
    )


def _blocks(payload: SolveRequest) -> list[Block]:
    return [
        Block(assignment=assignment, index=index, duration=duration)
        for assignment in sorted(payload.assignments, key=lambda item: item.id)
        for index, duration in enumerate(assignment.block_durations())
    ]


def _fixed_by_block(payload: SolveRequest) -> dict[str, FixedLesson]:
    return {
        f"{item.assignment_id}:{item.block_index}": item
        for item in [*payload.fixed_lessons, *payload.locked_lessons]
    }


def _matches_unavailable(
    payload: SolveRequest,
    assignment: Assignment,
    *,
    room_id: str | None,
    day: int,
    period: int,
    duration: int,
) -> bool:
    unavailable = {
        (rule.entity_type, rule.entity_id, rule.day, rule.period)
        for rule in payload.availability
        if rule.kind == AvailabilityKind.UNAVAILABLE
    }
    for occupied_period in range(period, period + duration):
        entities = [
            (AvailabilityEntityType.TEACHER, assignment.teacher_id),
            (AvailabilityEntityType.CLASS, assignment.class_id),
        ]
        if room_id:
            entities.append((AvailabilityEntityType.ROOM, room_id))
        if any(
            (entity_type, entity_id, day, occupied_period) in unavailable
            for entity_type, entity_id in entities
        ):
            return True
    return False


def _room_candidates(payload: SolveRequest, assignment: Assignment) -> list[str | None]:
    rooms_by_id = {room.id: room for room in payload.rooms}
    if assignment.required_room_id:
        return [assignment.required_room_id] if assignment.required_room_id in rooms_by_id else []
    if assignment.required_room_type_id:
        return sorted(
            room.id
            for room in payload.rooms
            if room.room_type_id == assignment.required_room_type_id
        )
    return [None]


def _candidate_keys(
    payload: SolveRequest,
    block: Block,
    fixed: FixedLesson | None,
) -> list[CandidateKey]:
    room_ids = _room_candidates(payload, block.assignment)
    if fixed and fixed.room_id is not None:
        room_ids = [room_id for room_id in room_ids if room_id == fixed.room_id]
        has_no_room_requirement = (
            block.assignment.required_room_id is None
            and block.assignment.required_room_type_id is None
        )
        if not room_ids and has_no_room_requirement:
            known_room_ids = {room.id for room in payload.rooms}
            room_ids = [fixed.room_id] if fixed.room_id in known_room_ids else []

    candidates: list[CandidateKey] = []
    for day, periods in enumerate(payload.periods_per_day):
        if fixed and day != fixed.day:
            continue
        for period in range(0, periods - block.duration + 1):
            if fixed and period != fixed.period:
                continue
            for room_id in room_ids:
                if _matches_unavailable(
                    payload,
                    block.assignment,
                    room_id=room_id,
                    day=day,
                    period=period,
                    duration=block.duration,
                ):
                    continue
                candidates.append(CandidateKey(day=day, period=period, room_id=room_id))
    return candidates


def _preflight_diagnostics(
    payload: SolveRequest,
    blocks: list[Block],
) -> list[dict[str, Any]]:
    diagnostics: list[dict[str, Any]] = []
    fixed = _fixed_by_block(payload)
    for block in blocks:
        if not _candidate_keys(payload, block, fixed.get(block.id)):
            diagnostics.append(
                {
                    "code": "EMPTY_CANDIDATE_SET",
                    "message": f"Blok {block.id} nemá žádné povolené umístění.",
                    "entityIds": [block.assignment.id, block.id],
                }
            )

    for teacher_id in sorted({item.teacher_id for item in payload.assignments}):
        required = sum(
            item.weekly_periods
            for item in payload.assignments
            if item.teacher_id == teacher_id
        )
        unavailable = {
            (rule.day, rule.period)
            for rule in payload.availability
            if rule.kind == AvailabilityKind.UNAVAILABLE
            and rule.entity_type == AvailabilityEntityType.TEACHER
            and rule.entity_id == teacher_id
        }
        available = sum(payload.periods_per_day) - len(unavailable)
        if required > available:
            diagnostics.append(
                {
                    "code": "TEACHER_CAPACITY_EXCEEDED",
                    "message": (
                        f"Učitel {teacher_id} potřebuje {required} hodin, "
                        f"ale má pouze {available} dostupných slotů."
                    ),
                    "entityIds": [teacher_id],
                    "details": {"required": required, "available": available},
                }
            )
    return diagnostics


def _fixed_conflict_diagnostics(payload: SolveRequest) -> list[dict[str, Any]]:
    assignments = {assignment.id: assignment for assignment in payload.assignments}
    fixed_items = [*payload.fixed_lessons, *payload.locked_lessons]
    diagnostics: list[dict[str, Any]] = []

    for index, left in enumerate(fixed_items):
        left_assignment = assignments[left.assignment_id]
        left_duration = left_assignment.block_durations()[left.block_index]
        for right in fixed_items[index + 1 :]:
            right_assignment = assignments[right.assignment_id]
            right_duration = right_assignment.block_durations()[right.block_index]
            if left.day != right.day:
                continue
            overlaps = (
                left.period < right.period + right_duration
                and right.period < left.period + left_duration
            )
            if not overlaps:
                continue
            class_conflict = left_assignment.class_id == right_assignment.class_id and (
                left_assignment.group == TeachingGroup.WHOLE
                or right_assignment.group == TeachingGroup.WHOLE
                or left_assignment.group == right_assignment.group
            )
            shares_resource = (
                left_assignment.teacher_id == right_assignment.teacher_id
                or class_conflict
                or (
                    left.room_id is not None
                    and right.room_id is not None
                    and left.room_id == right.room_id
                )
            )
            if shares_resource:
                diagnostics.append(
                    {
                        "code": "FIXED_LESSON_CONFLICT",
                        "message": (
                            f"Pevné bloky {left.assignment_id}:{left.block_index} a "
                            f"{right.assignment_id}:{right.block_index} se překrývají."
                        ),
                        "entityIds": [left.assignment_id, right.assignment_id],
                        "details": {
                            "day": left.day,
                            "period": max(left.period, right.period),
                        },
                    }
                )
    return diagnostics


def _availability_cost(
    payload: SolveRequest,
    assignment: Assignment,
    candidate: CandidateKey,
    duration: int,
) -> int:
    coefficient = candidate.period * payload.weights.late_period
    for rule in payload.availability:
        occupies_rule_period = candidate.period <= rule.period < candidate.period + duration
        if not occupies_rule_period or rule.day != candidate.day:
            continue
        matches = (
            rule.entity_type == AvailabilityEntityType.TEACHER
            and rule.entity_id == assignment.teacher_id
        ) or (
            rule.entity_type == AvailabilityEntityType.CLASS
            and rule.entity_id == assignment.class_id
        ) or (
            rule.entity_type == AvailabilityEntityType.ROOM
            and candidate.room_id is not None
            and rule.entity_id == candidate.room_id
        )
        if not matches:
            continue
        if rule.kind == AvailabilityKind.DISCOURAGED:
            coefficient += rule.weight or payload.weights.discouraged_slot
        elif rule.kind == AvailabilityKind.PREFERRED:
            coefficient -= min(
                rule.weight or payload.weights.preferred_slot_bonus,
                100,
            )
    return coefficient


def _add_gap_objective(
    model: cp_model.CpModel,
    objective_terms: list[cp_model.LinearExpr],
    occupancy_sources: dict[tuple[str, int, int], list[cp_model.IntVar]],
    entity_ids: set[str],
    periods_per_day: list[int],
    weight: int,
    prefix: str,
) -> None:
    for entity_id in sorted(entity_ids):
        for day, periods in enumerate(periods_per_day):
            occupancy: list[cp_model.IntVar] = []
            for period in range(periods):
                occupied = model.new_bool_var(
                    f"{prefix}_occupied_{entity_id}_{day}_{period}"
                )
                sources = occupancy_sources.get((entity_id, day, period), [])
                if sources:
                    model.add_max_equality(occupied, sources)
                else:
                    model.add(occupied == 0)
                occupancy.append(occupied)

            for period in range(1, periods - 1):
                before = model.new_bool_var(
                    f"{prefix}_before_{entity_id}_{day}_{period}"
                )
                after = model.new_bool_var(
                    f"{prefix}_after_{entity_id}_{day}_{period}"
                )
                gap = model.new_bool_var(f"{prefix}_gap_{entity_id}_{day}_{period}")
                model.add_max_equality(before, occupancy[:period])
                model.add_max_equality(after, occupancy[period + 1 :])
                model.add_bool_and(
                    [before, after, occupancy[period].Not()]
                ).only_enforce_if(gap)
                model.add_bool_or(
                    [before.Not(), after.Not(), occupancy[period]]
                ).only_enforce_if(gap.Not())
                objective_terms.append(gap * weight)


@app.post("/solve", response_model=SolveResponse)
def solve(payload: SolveRequest) -> SolveResponse:
    blocks = _blocks(payload)
    fixed = _fixed_by_block(payload)
    preflight = _preflight_diagnostics(payload, blocks)
    if preflight:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "INFEASIBLE_INPUT",
                "message": "Některé výukové bloky nemají žádné povolené umístění.",
                "causes": preflight,
            },
        )

    model = cp_model.CpModel()
    variables: dict[str, list[tuple[CandidateKey, cp_model.IntVar]]] = {}
    teacher_slots: dict[tuple[str, int, int], list[cp_model.IntVar]] = defaultdict(list)
    room_slots: dict[tuple[str, int, int], list[cp_model.IntVar]] = defaultdict(list)
    class_whole_slots: dict[tuple[str, int, int], list[cp_model.IntVar]] = defaultdict(list)
    class_group_1_slots: dict[tuple[str, int, int], list[cp_model.IntVar]] = defaultdict(list)
    class_group_2_slots: dict[tuple[str, int, int], list[cp_model.IntVar]] = defaultdict(list)
    class_all_slots: dict[tuple[str, int, int], list[cp_model.IntVar]] = defaultdict(list)
    objective_terms: list[cp_model.LinearExpr] = []

    for block in blocks:
        candidates: list[tuple[CandidateKey, cp_model.IntVar]] = []
        for candidate in _candidate_keys(payload, block, fixed.get(block.id)):
            room_token = candidate.room_id or "none"
            variable = model.new_bool_var(
                "place_"
                f"{block.assignment.id}_{block.index}_{candidate.day}_"
                f"{candidate.period}_{room_token}"
            )
            candidates.append((candidate, variable))
            objective_terms.append(
                variable
                * _availability_cost(
                    payload,
                    block.assignment,
                    candidate,
                    block.duration,
                )
            )

            for period in range(candidate.period, candidate.period + block.duration):
                teacher_slots[
                    (block.assignment.teacher_id, candidate.day, period)
                ].append(variable)
                class_all_slots[
                    (block.assignment.class_id, candidate.day, period)
                ].append(variable)
                if block.assignment.group == TeachingGroup.WHOLE:
                    class_whole_slots[
                        (block.assignment.class_id, candidate.day, period)
                    ].append(variable)
                elif block.assignment.group == TeachingGroup.GROUP_1:
                    class_group_1_slots[
                        (block.assignment.class_id, candidate.day, period)
                    ].append(variable)
                else:
                    class_group_2_slots[
                        (block.assignment.class_id, candidate.day, period)
                    ].append(variable)
                if candidate.room_id:
                    room_slots[(candidate.room_id, candidate.day, period)].append(variable)

        model.add_exactly_one([variable for _candidate, variable in candidates])
        variables[block.id] = candidates

    for slot_variables in teacher_slots.values():
        model.add(sum(slot_variables) <= 1)
    for slot_variables in room_slots.values():
        model.add(sum(slot_variables) <= 1)

    class_slot_keys = (
        set(class_whole_slots) | set(class_group_1_slots) | set(class_group_2_slots)
    )
    for key in class_slot_keys:
        whole = class_whole_slots.get(key, [])
        group_1 = class_group_1_slots.get(key, [])
        group_2 = class_group_2_slots.get(key, [])
        model.add(sum([*whole, *group_1]) <= 1)
        model.add(sum([*whole, *group_2]) <= 1)

    blocks_by_assignment: dict[str, list[Block]] = defaultdict(list)
    for block in blocks:
        blocks_by_assignment[block.assignment.id].append(block)

    for assignment in payload.assignments:
        assignment_blocks = blocks_by_assignment[assignment.id]
        day_used: list[cp_model.IntVar] = []
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
                f"count_{assignment.id}_{day}",
            )
            model.add(count == sum(day_variables))
            used = model.new_bool_var(f"used_{assignment.id}_{day}")
            model.add(count >= 1).only_enforce_if(used)
            model.add(count == 0).only_enforce_if(used.Not())
            day_used.append(used)

            excess = model.new_int_var(
                0,
                len(assignment_blocks),
                f"excess_{assignment.id}_{day}",
            )
            model.add(excess >= count - 1)
            objective_terms.append(
                excess * payload.weights.same_day_concentration
            )

            if assignment.max_per_day is not None:
                period_terms = [
                    variable * block.duration
                    for block in assignment_blocks
                    for candidate, variable in variables[block.id]
                    if candidate.day == day
                ]
                model.add(sum(period_terms) <= assignment.max_per_day)

        if assignment.min_day_gap:
            for left_day in range(len(day_used)):
                for right_day in range(left_day + 1, len(day_used)):
                    if right_day - left_day > assignment.min_day_gap:
                        continue
                    both = model.new_bool_var(
                        f"close_days_{assignment.id}_{left_day}_{right_day}"
                    )
                    model.add_bool_and(
                        [day_used[left_day], day_used[right_day]]
                    ).only_enforce_if(both)
                    model.add_bool_or(
                        [day_used[left_day].Not(), day_used[right_day].Not()]
                    ).only_enforce_if(both.Not())
                    objective_terms.append(
                        both * payload.weights.same_day_concentration
                    )

    _add_gap_objective(
        model,
        objective_terms,
        teacher_slots,
        {assignment.teacher_id for assignment in payload.assignments},
        payload.periods_per_day,
        payload.weights.teacher_gap,
        "teacher",
    )
    _add_gap_objective(
        model,
        objective_terms,
        class_all_slots,
        {assignment.class_id for assignment in payload.assignments},
        payload.periods_per_day,
        payload.weights.class_gap,
        "class",
    )
    model.minimize(sum(objective_terms))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = float(payload.time_limit_seconds)
    solver.parameters.num_search_workers = 1
    solver.parameters.random_seed = payload.random_seed
    status = solver.solve(model)

    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        diagnostics = _fixed_conflict_diagnostics(payload) or [
            {
                "code": "INFEASIBLE_MODEL",
                "message": "Model nemá řešení při aktuální kombinaci tvrdých omezení.",
                "entityIds": [],
            }
        ]
        raise HTTPException(
            status_code=422,
            detail={
                "code": "INFEASIBLE",
                "message": "Pro zadaná data nebyl nalezen rozvrh bez tvrdého konfliktu.",
                "causes": diagnostics,
            },
        )

    fixed_rule_blocks = {
        f"{item.assignment_id}:{item.block_index}" for item in payload.fixed_lessons
    }
    locked_blocks = {
        f"{item.assignment_id}:{item.block_index}" for item in payload.locked_lessons
    }
    lessons: list[ScheduledLesson] = []
    for block in blocks:
        selected = next(
            candidate
            for candidate, variable in variables[block.id]
            if solver.value(variable) == 1
        )
        if block.id in fixed_rule_blocks:
            origin = "FIXED_RULE"
        elif block.id in locked_blocks:
            origin = "MANUAL"
        else:
            origin = "SOLVER"
        lessons.append(
            ScheduledLesson(
                block_id=block.id,
                assignment_id=block.assignment.id,
                teacher_id=block.assignment.teacher_id,
                class_id=block.assignment.class_id,
                subject_id=block.assignment.subject_id,
                group=block.assignment.group,
                room_id=selected.room_id,
                day=selected.day,
                period=selected.period,
                duration=block.duration,
                locked=(
                    block.id in fixed_rule_blocks or block.id in locked_blocks
                ),
                origin=origin,
            )
        )

    lessons.sort(key=lambda item: (item.day, item.period, item.class_id, item.block_id))
    hard_issues = validate_schedule(payload, lessons)
    if hard_issues:
        raise HTTPException(
            status_code=500,
            detail={
                "code": "POST_SOLVE_VALIDATION_FAILED",
                "message": (
                    "Výsledek solveru neprošel nezávislou kontrolou "
                    "tvrdých omezení."
                ),
                "issues": [issue.model_dump() for issue in hard_issues],
            },
        )

    score = score_schedule(payload, lessons)
    status_name = "OPTIMAL" if status == cp_model.OPTIMAL else "FEASIBLE"
    return SolveResponse(
        status=status_name,
        objective_value=float(solver.objective_value),
        lessons=lessons,
        score=score,
        diagnostics=[
            {
                "code": "HARD_CONSTRAINTS_VALIDATED",
                "message": (
                    "Výsledek prošel nezávislou kontrolou tvrdých omezení."
                ),
            },
            {
                "code": "DETERMINISTIC_TEST_MODE",
                "message": "Solver použil jedno vlákno a pevný random seed.",
            },
        ],
        solver_stats={
            "solverVersion": ortools.__version__,
            "wallTimeSeconds": solver.wall_time,
            "branches": solver.num_branches,
            "conflicts": solver.num_conflicts,
            "bestObjectiveBound": solver.best_objective_bound,
            "randomSeed": payload.random_seed,
            "workers": 1,
        },
    )
