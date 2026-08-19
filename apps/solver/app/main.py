import os
import time
from collections import defaultdict
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

import ortools
from fastapi import FastAPI, HTTPException
from ortools.sat.python import cp_model
from pydantic import BaseModel

from app.class_groups import (
    assignment_class_ids,
    class_required_weekly_periods,
    parallel_assignment_groups,
)
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
from app.room_sharing import (
    room_share_block_pair_key,
    room_share_block_pairs,
)
from app.rotations import add_rotation_constraints
from app.school_day import crosses_lunch_break
from app.scoring import score_schedule
from app.validator import validate_schedule

app = FastAPI(title="Timetable Solver", version="0.3.0")

AFTERNOON_START_PERIOD = 5
SUBJECT_LATE_WEIGHTS = {
    "CJ": 3_500,
    "M": 4_000,
    "INF": 3_500,
    "JAZ1": 3_000,
    "JAZ2": 3_000,
    "FY": 1_800,
    "CH": 1_800,
    "DEJ": 500,
    "ZEM": 500,
    "PRI": 500,
    "OV": 150,
    "VZ": 150,
    "HV": 0,
    "TV": 0,
    "VV": 0,
    "PC": 0,
}
SUBJECT_AFTERNOON_BONUSES = {
    "TV": 1_800,
    "PC": 1_500,
    "VV": 1_500,
    "SVS": 1_300,
    "VZ": 1_300,
    "VKZ": 1_300,
    "HV": 350,
    "PRPK": 300,
    "PKCJ": 300,
}
DEFAULT_SUBJECT_LATE_WEIGHT = 300
VERCEL_REQUEST_BUDGET_SECONDS = 270.0
LOCAL_DEEP_SOLVE_MAX_SECONDS = 1_800.0
LOCAL_DEEP_SOLVE_ENV = "ALLOW_LONG_SOLVES"


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
    return {f"{item.assignment_id}:{item.block_index}": item for item in [*payload.fixed_lessons, *payload.locked_lessons]}


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
            *((AvailabilityEntityType.CLASS, class_id) for class_id in assignment_class_ids(assignment)),
        ]
        if room_id:
            entities.append((AvailabilityEntityType.ROOM, room_id))
        if any((entity_type, entity_id, day, occupied_period) in unavailable for entity_type, entity_id in entities):
            return True
    return False


def _room_candidates(
    payload: SolveRequest,
    assignment: Assignment,
) -> list[str | None]:
    rooms_by_id = {room.id: room for room in payload.rooms}
    if assignment.required_room_id:
        return [assignment.required_room_id] if assignment.required_room_id in rooms_by_id else []
    if assignment.required_room_type_id:
        return sorted(room.id for room in payload.rooms if room.room_type_id == assignment.required_room_type_id)
    return [None]


def _candidate_keys(
    payload: SolveRequest,
    block: Block,
    fixed: FixedLesson | None,
) -> list[CandidateKey]:
    room_ids = _room_candidates(payload, block.assignment)
    if fixed and fixed.room_id is not None:
        room_ids = [room_id for room_id in room_ids if room_id == fixed.room_id]
        has_no_room_requirement = block.assignment.required_room_id is None and block.assignment.required_room_type_id is None
        if not room_ids and has_no_room_requirement:
            known_room_ids = {room.id for room in payload.rooms}
            room_ids = [fixed.room_id] if fixed.room_id in known_room_ids else []

    candidates: list[CandidateKey] = []
    for day, periods in enumerate(payload.periods_per_day):
        if fixed and day != fixed.day:
            continue
        for period in range(0, periods - block.duration + 1):
            if crosses_lunch_break(period, block.duration):
                continue
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

    blocks_by_id = {block.id: block for block in blocks}
    for left_block_id, right_block_id in room_share_block_pairs(payload.assignments):
        left_block = blocks_by_id[left_block_id]
        right_block = blocks_by_id[right_block_id]
        left_candidates = set(
            _candidate_keys(payload, left_block, fixed.get(left_block_id))
        )
        right_candidates = set(
            _candidate_keys(payload, right_block, fixed.get(right_block_id))
        )
        if not left_candidates.intersection(right_candidates):
            diagnostics.append(
                {
                    "code": "ROOM_SHARE_EMPTY_INTERSECTION",
                    "message": (
                        f"Sdílené bloky {left_block_id} a {right_block_id} nemají společné umístění a místnost."
                    ),
                    "entityIds": [left_block.assignment.id, right_block.assignment.id],
                }
            )

    for teacher_id in sorted({item.teacher_id for item in payload.assignments}):
        required = sum(item.weekly_periods for item in payload.assignments if item.teacher_id == teacher_id)
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
                    "message": (f"Učitel {teacher_id} potřebuje {required} hodin, ale má pouze {available} dostupných slotů."),
                    "entityIds": [teacher_id],
                    "details": {"required": required, "available": available},
                }
            )
    return diagnostics


def _fixed_conflict_diagnostics(
    payload: SolveRequest,
) -> list[dict[str, Any]]:
    assignments = {assignment.id: assignment for assignment in payload.assignments}
    fixed_items = [*payload.fixed_lessons, *payload.locked_lessons]
    diagnostics: list[dict[str, Any]] = []
    shared_room_pairs = {
        room_share_block_pair_key(left, right)
        for left, right in room_share_block_pairs(payload.assignments)
    }

    for index, left in enumerate(fixed_items):
        left_assignment = assignments[left.assignment_id]
        left_duration = left_assignment.block_durations()[left.block_index]
        for right in fixed_items[index + 1 :]:
            right_assignment = assignments[right.assignment_id]
            right_duration = right_assignment.block_durations()[right.block_index]
            if left.day != right.day:
                continue
            overlaps = left.period < right.period + right_duration and right.period < left.period + left_duration
            if not overlaps:
                continue
            class_conflict = bool(set(assignment_class_ids(left_assignment)) & set(assignment_class_ids(right_assignment))) and (
                left_assignment.group == TeachingGroup.WHOLE
                or right_assignment.group == TeachingGroup.WHOLE
                or left_assignment.group == right_assignment.group
            )
            left_block_id = f"{left.assignment_id}:{left.block_index}"
            right_block_id = f"{right.assignment_id}:{right.block_index}"
            is_shared_room_pair = (
                room_share_block_pair_key(left_block_id, right_block_id)
                in shared_room_pairs
            )
            same_room_conflict = (
                left.room_id is not None
                and right.room_id is not None
                and left.room_id == right.room_id
                and not is_shared_room_pair
            )
            shares_resource = (
                left_assignment.teacher_id == right_assignment.teacher_id
                or class_conflict
                or same_room_conflict
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


def _subject_code(payload: SolveRequest, subject_id: str) -> str:
    subject = next(
        (item for item in payload.subjects if item.id == subject_id),
        None,
    )
    if subject is not None:
        return subject.code.strip().upper()
    return subject_id.rsplit(":", 1)[-1].strip().upper()


def _subject_late_cost(
    payload: SolveRequest,
    assignment: Assignment,
    candidate: CandidateKey,
    duration: int,
) -> int:
    latest_period = candidate.period + duration - 1
    afternoon_distance = max(
        0,
        latest_period - AFTERNOON_START_PERIOD + 1,
    )
    if afternoon_distance == 0:
        return 0
    subject_code = _subject_code(payload, assignment.subject_id)
    afternoon_bonus = SUBJECT_AFTERNOON_BONUSES.get(subject_code, 0)
    if afternoon_bonus > 0:
        return -afternoon_distance * afternoon_bonus
    weight = SUBJECT_LATE_WEIGHTS.get(
        subject_code,
        DEFAULT_SUBJECT_LATE_WEIGHT,
    )
    return afternoon_distance * weight


def _availability_cost(
    payload: SolveRequest,
    assignment: Assignment,
    candidate: CandidateKey,
    duration: int,
) -> int:
    coefficient = candidate.period * payload.weights.late_period
    coefficient += _subject_late_cost(
        payload,
        assignment,
        candidate,
        duration,
    )
    for rule in payload.availability:
        occupies_rule_period = candidate.period <= rule.period < candidate.period + duration
        if not occupies_rule_period or rule.day != candidate.day:
            continue
        matches = (
            (rule.entity_type == AvailabilityEntityType.TEACHER and rule.entity_id == assignment.teacher_id)
            or (rule.entity_type == AvailabilityEntityType.CLASS and rule.entity_id == assignment.class_id)
            or (rule.entity_type == AvailabilityEntityType.ROOM and candidate.room_id is not None and rule.entity_id == candidate.room_id)
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


def _occupancy_variables(
    model: cp_model.CpModel,
    occupancy_sources: dict[tuple[str, int, int], list[cp_model.IntVar]],
    entity_id: str,
    day: int,
    periods: int,
    prefix: str,
) -> list[cp_model.IntVar]:
    occupancy: list[cp_model.IntVar] = []
    for period in range(periods):
        occupied = model.new_bool_var(f"{prefix}_occupied_{entity_id}_{day}_{period}")
        sources = occupancy_sources.get((entity_id, day, period), [])
        if sources:
            source_sum = sum(sources)
            model.add(source_sum >= occupied)
            model.add(source_sum <= len(sources) * occupied)
        else:
            model.add(occupied == 0)
        occupancy.append(occupied)
    return occupancy


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
            occupancy = _occupancy_variables(
                model,
                occupancy_sources,
                entity_id,
                day,
                periods,
                prefix,
            )
            for period in range(1, periods - 1):
                before = model.new_bool_var(f"{prefix}_before_{entity_id}_{day}_{period}")
                after = model.new_bool_var(f"{prefix}_after_{entity_id}_{day}_{period}")
                before_sum = sum(occupancy[:period])
                after_sum = sum(occupancy[period + 1 :])
                model.add(before_sum >= before)
                model.add(before_sum <= period * before)
                model.add(after_sum >= after)
                model.add(after_sum <= (periods - period - 1) * after)

                gap = model.new_bool_var(f"{prefix}_gap_{entity_id}_{day}_{period}")
                model.add(gap <= before)
                model.add(gap <= after)
                model.add(gap + occupancy[period] <= 1)
                model.add(gap >= before + after - occupancy[period] - 1)
                objective_terms.append(gap * weight)


def _forbid_regular_class_gaps(
    model: cp_model.CpModel,
    class_slots: dict[tuple[str, int, int], list[cp_model.IntVar]],
    required_periods_by_class: dict[str, int],
    periods_per_day: list[int],
) -> None:
    if len(periods_per_day) < 5:
        return
    for class_id, weekly_periods in sorted(required_periods_by_class.items()):
        if weekly_periods < len(periods_per_day):
            continue
        for day, periods in enumerate(periods_per_day):
            occupancy = _occupancy_variables(
                model,
                class_slots,
                class_id,
                day,
                periods,
                "class_contiguous",
            )
            for period in range(periods - 1):
                model.add(occupancy[period + 1] <= occupancy[period])


def _search_workers(payload: SolveRequest) -> int:
    """Keep small tests deterministic and use a CP-SAT portfolio for full schools."""
    return 8 if payload.time_limit_seconds >= 120 else 1


def _long_solves_enabled() -> bool:
    return os.getenv(LOCAL_DEEP_SOLVE_ENV, "").strip().lower() in {
        "1",
        "true",
        "yes",
    }


def _solver_time_limit_seconds(
    payload: SolveRequest,
    request_started: float,
) -> float:
    requested = float(payload.time_limit_seconds)
    if _long_solves_enabled():
        return min(requested, LOCAL_DEEP_SOLVE_MAX_SECONDS)
    elapsed = max(0.0, time.monotonic() - request_started)
    remaining_budget = max(1.0, VERCEL_REQUEST_BUDGET_SECONDS - elapsed)
    return min(requested, remaining_budget)


@app.post("/solve", response_model=SolveResponse)
def solve(payload: SolveRequest) -> SolveResponse:
    request_started = time.monotonic()
    blocks = _blocks(payload)
    fixed = _fixed_by_block(payload)
    preflight = _preflight_diagnostics(payload, blocks)
    if preflight:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "INFEASIBLE_INPUT",
                "message": ("Některé výukové bloky nemají žádné povolené umístění."),
                "causes": preflight,
            },
        )

    model = cp_model.CpModel()
    variables: dict[str, list[tuple[CandidateKey, cp_model.IntVar]]] = {}
    room_share_pairs = room_share_block_pairs(payload.assignments)
    shared_room_follower_blocks = {right for _left, right in room_share_pairs}
    teacher_slots: dict[tuple[str, int, int], list[cp_model.IntVar]] = defaultdict(list)
    room_slots: dict[tuple[str, int, int], list[cp_model.IntVar]] = defaultdict(list)
    class_whole_slots: dict[tuple[str, int, int], list[cp_model.IntVar]] = defaultdict(list)
    class_group_1_slots: dict[tuple[str, int, int], list[cp_model.IntVar]] = defaultdict(list)
    class_group_2_slots: dict[tuple[str, int, int], list[cp_model.IntVar]] = defaultdict(list)
    class_group_3_slots: dict[tuple[str, int, int], list[cp_model.IntVar]] = defaultdict(list)
    class_all_slots: dict[tuple[str, int, int], list[cp_model.IntVar]] = defaultdict(list)
    objective_terms: list[cp_model.LinearExpr] = []

    for block in blocks:
        candidates: list[tuple[CandidateKey, cp_model.IntVar]] = []
        for candidate in _candidate_keys(
            payload,
            block,
            fixed.get(block.id),
        ):
            room_token = candidate.room_id or "none"
            variable = model.new_bool_var(f"place_{block.assignment.id}_{block.index}_{candidate.day}_{candidate.period}_{room_token}")
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

            for period in range(
                candidate.period,
                candidate.period + block.duration,
            ):
                teacher_slots[
                    (
                        block.assignment.teacher_id,
                        candidate.day,
                        period,
                    )
                ].append(variable)
                for class_id in assignment_class_ids(block.assignment):
                    class_all_slots[(class_id, candidate.day, period)].append(variable)
                    if block.assignment.group == TeachingGroup.WHOLE:
                        class_whole_slots[(class_id, candidate.day, period)].append(variable)
                    elif block.assignment.group == TeachingGroup.GROUP_1:
                        class_group_1_slots[(class_id, candidate.day, period)].append(variable)
                    elif block.assignment.group == TeachingGroup.GROUP_2:
                        class_group_2_slots[(class_id, candidate.day, period)].append(variable)
                    else:
                        class_group_3_slots[(class_id, candidate.day, period)].append(variable)
                if candidate.room_id and block.id not in shared_room_follower_blocks:
                    room_slots[(candidate.room_id, candidate.day, period)].append(variable)

        model.add_exactly_one([variable for _candidate, variable in candidates])
        variables[block.id] = candidates

    for slot_variables in teacher_slots.values():
        model.add(sum(slot_variables) <= 1)
    for slot_variables in room_slots.values():
        model.add(sum(slot_variables) <= 1)

    class_slot_keys = (
        set(class_whole_slots)
        | set(class_group_1_slots)
        | set(class_group_2_slots)
        | set(class_group_3_slots)
    )
    for key in class_slot_keys:
        whole = class_whole_slots.get(key, [])
        for group_slots in (
            class_group_1_slots.get(key, []),
            class_group_2_slots.get(key, []),
            class_group_3_slots.get(key, []),
        ):
            model.add(sum([*whole, *group_slots]) <= 1)

    required_periods_by_class = class_required_weekly_periods(payload.assignments)
    if len(payload.periods_per_day) >= 5:
        for class_id, weekly_periods in required_periods_by_class.items():
            if weekly_periods < len(payload.periods_per_day):
                continue
            for day, periods in enumerate(payload.periods_per_day):
                if periods <= 0:
                    continue
                model.add(sum(class_all_slots.get((class_id, day, 0), [])) >= 1)
    _forbid_regular_class_gaps(
        model,
        class_all_slots,
        required_periods_by_class,
        payload.periods_per_day,
    )

    blocks_by_assignment: dict[str, list[Block]] = defaultdict(list)
    for block in blocks:
        blocks_by_assignment[block.assignment.id].append(block)

    for parallel_group in parallel_assignment_groups(payload.assignments):
        grouped_blocks = [
            sorted(blocks_by_assignment[assignment.id], key=lambda item: item.index)
            for assignment in parallel_group
        ]
        expected_shape = [item.duration for item in grouped_blocks[0]]
        if any(
            [item.duration for item in blocks] != expected_shape
            for blocks in grouped_blocks[1:]
        ):
            raise HTTPException(
                status_code=422,
                detail={
                    "code": "PARALLEL_GROUP_SHAPE_MISMATCH",
                    "message": ("Paralelní skupiny stejné výuky musí mít stejné rozložení hodin."),
                    "causes": [
                        {"entityIds": [assignment.id for assignment in parallel_group]}
                    ],
                },
            )
        for block_index in range(len(expected_shape)):
            blocks_at_index = [blocks[block_index] for blocks in grouped_blocks]
            positions = {
                (candidate.day, candidate.period)
                for block in blocks_at_index
                for candidate, _variable in variables[block.id]
            }
            reference = blocks_at_index[0]
            for day, period in positions:
                reference_at_position = [
                    variable
                    for candidate, variable in variables[reference.id]
                    if candidate.day == day and candidate.period == period
                ]
                for candidate_block in blocks_at_index[1:]:
                    candidate_at_position = [
                        variable
                        for candidate, variable in variables[candidate_block.id]
                        if candidate.day == day and candidate.period == period
                    ]
                    model.add(
                        sum(reference_at_position) == sum(candidate_at_position)
                    )

    for left_block_id, right_block_id in room_share_pairs:
        positions = {
            (candidate.day, candidate.period, candidate.room_id)
            for block_id in (left_block_id, right_block_id)
            for candidate, _variable in variables[block_id]
        }
        for day, period, room_id in positions:
            left_at_position = [
                variable
                for candidate, variable in variables[left_block_id]
                if (
                    candidate.day == day
                    and candidate.period == period
                    and candidate.room_id == room_id
                )
            ]
            right_at_position = [
                variable
                for candidate, variable in variables[right_block_id]
                if (
                    candidate.day == day
                    and candidate.period == period
                    and candidate.room_id == room_id
                )
            ]
            model.add(sum(left_at_position) == sum(right_at_position))

    rotation_diagnostics = add_rotation_constraints(
        model=model,
        payload=payload,
        blocks_by_assignment=blocks_by_assignment,
        variables=variables,
        objective_terms=objective_terms,
    )
    if rotation_diagnostics:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "ROTATION_PLACEMENT_INFEASIBLE",
                "message": "Některou výměnu předmětů nelze umístit podle zvoleného režimu.",
                "causes": rotation_diagnostics,
            },
        )

    for assignment in payload.assignments:
        assignment_blocks = blocks_by_assignment[assignment.id]
        day_used: list[cp_model.IntVar] = []
        for day in range(len(payload.periods_per_day)):
            day_variables = [variable for block in assignment_blocks for candidate, variable in variables[block.id] if candidate.day == day]
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
            objective_terms.append(excess * payload.weights.same_day_concentration)

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
                    both = model.new_bool_var(f"close_days_{assignment.id}_{left_day}_{right_day}")
                    model.add_bool_and([day_used[left_day], day_used[right_day]]).only_enforce_if(both)
                    model.add_bool_or(
                        [
                            day_used[left_day].Not(),
                            day_used[right_day].Not(),
                        ]
                    ).only_enforce_if(both.Not())
                    objective_terms.append(both * payload.weights.same_day_concentration)

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
        {class_id for assignment in payload.assignments for class_id in assignment_class_ids(assignment)},
        payload.periods_per_day,
        payload.weights.class_gap,
        "class",
    )
    objective = sum(objective_terms)
    model.minimize(objective)
    workers = _search_workers(payload)
    effective_time_limit_seconds = _solver_time_limit_seconds(
        payload,
        request_started,
    )
    first_solution_wall_time_seconds = 0.0
    fallback_search_wall_time_seconds = 0.0
    optimization_wall_time_seconds = 0.0
    search_phases: list[str] = []
    search_seeds: list[int] = []

    if workers > 1:
        # Keep the weighted objective active because it materially guides CP-SAT on
        # the full school model. The first phase only changes the stopping rule: as
        # soon as the guided search finds a valid timetable, preserve it instead of
        # risking an UNKNOWN response while chasing a better objective value.
        primary_search_seconds = min(180.0, effective_time_limit_seconds)
        first_solution_solver = cp_model.CpSolver()
        first_solution_solver.parameters.max_time_in_seconds = primary_search_seconds
        first_solution_solver.parameters.num_search_workers = workers
        first_solution_solver.parameters.random_seed = payload.random_seed
        first_solution_solver.parameters.stop_after_first_solution = True
        status = first_solution_solver.solve(model)
        first_solution_wall_time_seconds = first_solution_solver.wall_time
        search_phases.append("GUIDED_FIRST_SOLUTION")
        search_seeds.append(payload.random_seed)
        solver = first_solution_solver

        remaining_seconds = max(
            0.0,
            effective_time_limit_seconds - first_solution_wall_time_seconds,
        )
        if status == cp_model.UNKNOWN and remaining_seconds >= 5.0:
            # A retry must be a genuinely different search, not another run with the
            # same fixed seed. This is especially valuable after a long first attempt.
            alternate_seed = (
                payload.random_seed + 1
                if payload.random_seed < 2_147_483_646
                else 1
            )
            fallback_solver = cp_model.CpSolver()
            fallback_solver.parameters.max_time_in_seconds = remaining_seconds
            fallback_solver.parameters.num_search_workers = workers
            fallback_solver.parameters.random_seed = alternate_seed
            fallback_solver.parameters.stop_after_first_solution = True
            fallback_status = fallback_solver.solve(model)
            fallback_search_wall_time_seconds = fallback_solver.wall_time
            search_phases.append("ALTERNATE_SEED_FIRST_SOLUTION")
            search_seeds.append(alternate_seed)
            if fallback_status != cp_model.UNKNOWN:
                solver = fallback_solver
                status = fallback_status

        if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            remaining_seconds = max(
                0.0,
                effective_time_limit_seconds
                - first_solution_wall_time_seconds
                - fallback_search_wall_time_seconds,
            )
            if status != cp_model.OPTIMAL and remaining_seconds >= 1.0:
                for block in blocks:
                    selected_hint = next(
                        variable
                        for _candidate, variable in variables[block.id]
                        if solver.value(variable) == 1
                    )
                    model.add_hint(selected_hint, 1)

                # Quality still matters, but once a valid school timetable exists we
                # cap this phase so the user gets the candidate back promptly.
                optimization_budget_seconds = min(30.0, remaining_seconds)
                optimization_solver = cp_model.CpSolver()
                optimization_solver.parameters.max_time_in_seconds = (
                    optimization_budget_seconds
                )
                optimization_solver.parameters.num_search_workers = workers
                optimization_solver.parameters.random_seed = search_seeds[-1]
                optimization_status = optimization_solver.solve(model)
                optimization_wall_time_seconds = optimization_solver.wall_time
                search_phases.append("OPTIMIZATION")
                if optimization_status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
                    solver = optimization_solver
                    status = optimization_status
    else:
        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = effective_time_limit_seconds
        solver.parameters.num_search_workers = workers
        solver.parameters.random_seed = payload.random_seed
        status = solver.solve(model)
        optimization_wall_time_seconds = solver.wall_time
        search_phases.append("OPTIMIZATION")
        search_seeds.append(payload.random_seed)

    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        if status == cp_model.UNKNOWN:
            diagnostics = [
                {
                    "code": "SEARCH_LIMIT_EXCEEDED",
                    "message": ("Solver v časovém limitu nenalezl kandidáta. To samo o sobě nedokazuje, že model nemá řešení."),
                    "entityIds": [],
                    "details": {
                        "requestedTimeLimitSeconds": payload.time_limit_seconds,
                        "effectiveTimeLimitSeconds": effective_time_limit_seconds,
                        "workers": workers,
                        "searchPhase": search_phases[-1] if search_phases else "UNKNOWN",
                    },
                }
            ]
            response_code = "SEARCH_LIMIT_EXCEEDED"
            response_message = "V časovém limitu nebyl nalezen rozvrh. Model nebyl prokázán jako neproveditelný."
        else:
            diagnostics = _fixed_conflict_diagnostics(payload) or [
                {
                    "code": "INFEASIBLE_MODEL",
                    "message": ("Model nemá řešení při aktuální kombinaci tvrdých omezení."),
                    "entityIds": [],
                }
            ]
            response_code = "INFEASIBLE"
            response_message = "Pro zadaná data neexistuje rozvrh bez tvrdého konfliktu."
        raise HTTPException(
            status_code=422,
            detail={
                "code": response_code,
                "message": response_message,
                "causes": diagnostics,
            },
        )

    fixed_rule_blocks = {f"{item.assignment_id}:{item.block_index}" for item in payload.fixed_lessons}
    locked_blocks = {f"{item.assignment_id}:{item.block_index}" for item in payload.locked_lessons}
    lessons: list[ScheduledLesson] = []
    for block in blocks:
        selected = next(candidate for candidate, variable in variables[block.id] if solver.value(variable) == 1)
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
                additional_class_ids=block.assignment.additional_class_ids,
                subject_id=block.assignment.subject_id,
                group=block.assignment.group,
                room_id=selected.room_id,
                day=selected.day,
                period=selected.period,
                duration=block.duration,
                locked=(block.id in fixed_rule_blocks or block.id in locked_blocks),
                origin=origin,
            )
        )

    lessons.sort(
        key=lambda item: (
            item.day,
            item.period,
            item.class_id,
            item.block_id,
        )
    )
    hard_issues = validate_schedule(payload, lessons)
    if hard_issues:
        raise HTTPException(
            status_code=500,
            detail={
                "code": "POST_SOLVE_VALIDATION_FAILED",
                "message": ("Výsledek solveru neprošel nezávislou kontrolou tvrdých omezení."),
                "issues": [issue.model_dump() for issue in hard_issues],
            },
        )

    score = score_schedule(payload, lessons)
    status_name = "OPTIMAL" if status == cp_model.OPTIMAL else "FEASIBLE"
    search_diagnostic = (
        {
            "code": "GUIDED_FIRST_SOLUTION_SEARCH",
            "message": (
                f"Solver použil {workers} paralelních pracovníků a pedagogické "
                "skóre jako vodítko. První platný rozvrh zachová a zbývající čas "
                "využije jen omezeně ke zlepšení kvality."
            ),
            "details": {
                "phases": search_phases,
                "seeds": search_seeds,
                "firstSolutionWallTimeSeconds": first_solution_wall_time_seconds,
                "fallbackSearchWallTimeSeconds": fallback_search_wall_time_seconds,
                "optimizationWallTimeSeconds": optimization_wall_time_seconds,
            },
        }
        if workers > 1
        else {
            "code": "DETERMINISTIC_TEST_MODE",
            "message": "Solver použil jedno vlákno a pevný random seed.",
        }
    )
    runtime_budget_diagnostic = (
        {
            "code": "RUNTIME_TIME_BUDGET_APPLIED",
            "message": (
                "Produkční výpočet byl ukončen s bezpečnou rezervou před "
                "serverovým timeoutem, aby bylo možné vrátit a uložit nejlepší "
                "nalezený návrh."
            ),
            "details": {
                "requestedTimeLimitSeconds": payload.time_limit_seconds,
                "effectiveTimeLimitSeconds": effective_time_limit_seconds,
            },
        }
        if effective_time_limit_seconds < float(payload.time_limit_seconds)
        else None
    )
    return SolveResponse(
        status=status_name,
        objective_value=float(solver.objective_value),
        lessons=lessons,
        score=score,
        diagnostics=[
            {
                "code": "HARD_CONSTRAINTS_VALIDATED",
                "message": ("Výsledek prošel nezávislou kontrolou tvrdých omezení."),
            },
            {
                "code": "CLASS_DAYS_ARE_CONTIGUOUS",
                "message": ("Pravidelné třídy mají každý den souvislou výuku od 8:00 bez vnitřních oken."),
            },
            {
                "code": "PEDAGOGICAL_AFTERNOON_PRIORITY",
                "message": (
                    "Odpolední hodiny aktivně preferují TV, PČ, VV, SVS a VKZ; "
                "HV, PřPk a PkČj jsou záložní odpolední předměty. "
                "Jádrové předměty zůstávají prioritně dříve."
                ),
            },
            search_diagnostic,
            *([runtime_budget_diagnostic] if runtime_budget_diagnostic else []),
        ],
        solver_stats={
            "solverVersion": ortools.__version__,
            "wallTimeSeconds": first_solution_wall_time_seconds + fallback_search_wall_time_seconds + optimization_wall_time_seconds,
            "branches": solver.num_branches,
            "conflicts": solver.num_conflicts,
            "bestObjectiveBound": solver.best_objective_bound,
            "randomSeed": payload.random_seed,
            "workers": workers,
            "searchPhases": search_phases,
            "searchSeeds": search_seeds,
            "firstSolutionWallTimeSeconds": first_solution_wall_time_seconds,
            "fallbackSearchWallTimeSeconds": fallback_search_wall_time_seconds,
            "optimizationWallTimeSeconds": optimization_wall_time_seconds,
            "requestedTimeLimitSeconds": payload.time_limit_seconds,
            "effectiveTimeLimitSeconds": effective_time_limit_seconds,
        },
    )
