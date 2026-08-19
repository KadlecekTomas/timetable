from __future__ import annotations

from contextvars import ContextVar
from typing import Any

from app import main as solver_main
from app import rotations, scoring, validator
from app.policy import (
    candidate_exceeds_day_boundary,
    candidate_violates_subject_window,
)
from app.policy_constraints import add_policy_constraints
from app.policy_validation import validate_policy_schedule

_CURRENT_PAYLOAD: ContextVar[Any | None] = ContextVar("solver_policy_payload", default=None)
_INSTALLED = False
POLICY_FIRST_SOLUTION_BUDGET_SECONDS = 240


def install_policy_adapter() -> None:
    """Make the existing OR-Tools engine consume optional SolverPolicy data.

    Every wrapper is a no-op when payload.policy is absent, preserving legacy
    requests and fixtures. Product runtime installs this adapter before exposing
    the FastAPI application.
    """

    global _INSTALLED
    if _INSTALLED:
        return
    _INSTALLED = True

    original_solve = solver_main.solve
    original_candidate_keys = solver_main._candidate_keys
    original_forbid_class_gaps = solver_main._forbid_regular_class_gaps
    original_class_required = solver_main.class_required_weekly_periods
    original_add_rotation_constraints = solver_main.add_rotation_constraints
    original_validate_schedule = validator.validate_schedule
    original_school_quality = rotations._add_school_quality_policy
    original_availability_cost = solver_main._availability_cost
    original_add_gap_objective = solver_main._add_gap_objective

    def solve_with_policy(payload: Any) -> Any:
        token = _CURRENT_PAYLOAD.set(payload)
        if payload.policy is None:
            try:
                return original_solve(payload)
            finally:
                _CURRENT_PAYLOAD.reset(token)

        original_time_limit = payload.time_limit_seconds
        original_weights = payload.weights.model_copy(deep=True)
        original_quality = payload.policy.quality.model_copy(deep=True)
        try:
            payload.time_limit_seconds = min(
                original_time_limit,
                POLICY_FIRST_SOLUTION_BUDGET_SECONDS,
            )
            payload.weights.teacher_gap = 0
            payload.weights.class_gap = 0
            payload.weights.discouraged_slot = 0
            payload.weights.preferred_slot_bonus = 0
            payload.weights.same_day_concentration = 0
            payload.weights.late_period = 0
            payload.weights.rotation_spread = 0

            payload.policy.quality.class_afternoon_weight = 0
            payload.policy.quality.afternoon_day_weights = [
                0 for _unused in payload.policy.quality.afternoon_day_weights
            ]
            payload.policy.quality.subject_late_weights = {}
            payload.policy.quality.subject_afternoon_bonuses = {}
            return original_solve(payload)
        finally:
            payload.time_limit_seconds = original_time_limit
            payload.weights = original_weights
            payload.policy.quality = original_quality
            _CURRENT_PAYLOAD.reset(token)

    def availability_cost_with_policy(
        payload: Any,
        assignment: Any,
        candidate: Any,
        duration: int,
    ) -> int:
        if payload.policy is not None:
            return 0
        return original_availability_cost(payload, assignment, candidate, duration)

    def add_gap_objective_with_policy(
        model: Any,
        objective_terms: Any,
        occupancy_sources: Any,
        entity_ids: Any,
        periods_per_day: Any,
        weight: int,
        prefix: str,
    ) -> None:
        payload = _CURRENT_PAYLOAD.get()
        if payload is not None and payload.policy is not None:
            return
        original_add_gap_objective(
            model,
            objective_terms,
            occupancy_sources,
            entity_ids,
            periods_per_day,
            weight,
            prefix,
        )

    def candidate_keys_with_policy(payload: Any, block: Any, fixed: Any) -> list[Any]:
        if payload.policy is None:
            return original_candidate_keys(payload, block, fixed)

        room_ids = solver_main._room_candidates(payload, block.assignment)
        if fixed and fixed.room_id is not None:
            room_ids = [room_id for room_id in room_ids if room_id == fixed.room_id]
            has_no_room_requirement = (
                block.assignment.required_room_id is None
                and block.assignment.required_room_type_id is None
            )
            if not room_ids and has_no_room_requirement:
                known_room_ids = {room.id for room in payload.rooms}
                room_ids = [fixed.room_id] if fixed.room_id in known_room_ids else []

        candidates: list[Any] = []
        for day, periods in enumerate(payload.periods_per_day):
            if fixed and day != fixed.day:
                continue
            for period in range(0, periods - block.duration + 1):
                if fixed and period != fixed.period:
                    continue
                if candidate_exceeds_day_boundary(
                    payload,
                    day=day,
                    period=period,
                    duration=block.duration,
                ):
                    continue
                if candidate_violates_subject_window(
                    payload,
                    block.assignment,
                    day=day,
                    period=period,
                    duration=block.duration,
                ):
                    continue
                for room_id in room_ids:
                    if solver_main._matches_unavailable(
                        payload,
                        block.assignment,
                        room_id=room_id,
                        day=day,
                        period=period,
                        duration=block.duration,
                    ):
                        continue
                    candidates.append(
                        solver_main.CandidateKey(
                            day=day,
                            period=period,
                            room_id=room_id,
                        )
                    )
        return candidates

    def class_required_with_policy(assignments: Any) -> dict[str, int]:
        payload = _CURRENT_PAYLOAD.get()
        if (
            payload is not None
            and payload.policy is not None
            and not payload.policy.class_day.require_first_period
        ):
            return {}
        return original_class_required(assignments)

    def forbid_class_gaps_with_policy(
        model: Any,
        class_slots: Any,
        required_periods_by_class: Any,
        periods_per_day: Any,
    ) -> None:
        payload = _CURRENT_PAYLOAD.get()
        if payload is not None and payload.policy is not None:
            return
        original_forbid_class_gaps(
            model,
            class_slots,
            required_periods_by_class,
            periods_per_day,
        )

    def school_quality_with_policy(**kwargs: Any) -> None:
        payload = kwargs.get("payload")
        if payload is not None and payload.policy is not None:
            return
        original_school_quality(**kwargs)

    def add_rotation_constraints_with_policy(**kwargs: Any) -> list[dict[str, Any]]:
        diagnostics = original_add_rotation_constraints(**kwargs)
        payload = kwargs["payload"]
        if payload.policy is not None:
            add_policy_constraints(
                model=kwargs["model"],
                payload=payload,
                blocks_by_assignment=kwargs["blocks_by_assignment"],
                variables=kwargs["variables"],
                objective_terms=kwargs["objective_terms"],
            )
        return diagnostics

    def validate_schedule_with_policy(payload: Any, lessons: Any) -> list[Any]:
        issues = original_validate_schedule(payload, lessons)
        if payload.policy is None:
            return issues

        ignored_legacy_codes = {
            "LUNCH_BREAK_CROSSED",
            "CLASS_HAS_INTERNAL_GAP",
            "CONSECUTIVE_CLASS_AFTERNOONS",
        }
        if not payload.policy.class_day.require_first_period:
            ignored_legacy_codes.add("CLASS_DOES_NOT_START_AT_EIGHT")
        filtered = [issue for issue in issues if issue.code not in ignored_legacy_codes]
        return [*filtered, *validate_policy_schedule(payload, lessons)]

    solver_main.solve = solve_with_policy
    solver_main._candidate_keys = candidate_keys_with_policy
    solver_main._availability_cost = availability_cost_with_policy
    solver_main._add_gap_objective = add_gap_objective_with_policy
    solver_main.class_required_weekly_periods = class_required_with_policy
    solver_main._forbid_regular_class_gaps = forbid_class_gaps_with_policy
    rotations._add_school_quality_policy = school_quality_with_policy
    solver_main.add_rotation_constraints = add_rotation_constraints_with_policy

    solver_main.validate_schedule = validate_schedule_with_policy
    validator.validate_schedule = validate_schedule_with_policy
    scoring.validate_schedule = validate_schedule_with_policy
