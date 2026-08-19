from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from enum import StrEnum
from threading import Lock
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse

from app import main as solver_main
from app import rotations, validator
from app.class_groups import class_required_weekly_periods, parallel_assignment_groups
from app.models import AvailabilityKind, SolveRequest, SolveResponse

DIAGNOSTIC_SECONDS = 6
_SOLVE_LOCK = Lock()

app = FastAPI(title="Timetable Solver", version="0.5.0")


class RelaxationOutcome(StrEnum):
    FEASIBLE = "FEASIBLE"
    INFEASIBLE = "INFEASIBLE"
    INDETERMINATE = "INDETERMINATE"


@app.get("/health", response_model=solver_main.HealthResponse)
def health() -> solver_main.HealthResponse:
    return solver_main.health()


def _class_label(payload: SolveRequest, class_id: str) -> str:
    school_class = next((item for item in payload.classes if item.id == class_id), None)
    return school_class.code if school_class is not None else class_id


def _teacher_label(payload: SolveRequest, teacher_id: str) -> str:
    # The solver contract intentionally carries only teacher ids. Keep generated
    # ids readable instead of pretending we know a person's display name.
    return teacher_id.removeprefix("teacher:") or teacher_id


def _original_causes(detail: dict[str, Any]) -> list[dict[str, Any]]:
    causes = detail.get("causes")
    if not isinstance(causes, list):
        return []
    return [item for item in causes if isinstance(item, dict)]


def _is_generic_infeasible(detail: dict[str, Any]) -> bool:
    if detail.get("code") != "INFEASIBLE":
        return False
    causes = _original_causes(detail)
    return not causes or all(item.get("code") == "INFEASIBLE_MODEL" for item in causes)


def _http_exception_code(exc: HTTPException) -> str:
    detail = exc.detail
    if not isinstance(detail, dict):
        return ""
    return str(detail.get("code") or "")


def _structural_diagnostics(payload: SolveRequest) -> list[dict[str, Any]]:
    diagnostics: list[dict[str, Any]] = []
    total_slots = sum(payload.periods_per_day)

    for class_id, required in sorted(
        class_required_weekly_periods(payload.assignments).items()
    ):
        if required <= total_slots:
            continue
        diagnostics.append(
            {
                "code": "CLASS_CAPACITY_EXCEEDED",
                "message": (
                    f"Třída {_class_label(payload, class_id)} potřebuje {required} hodin, "
                    f"ale týden má jen {total_slots} vyučovacích slotů."
                ),
                "entityIds": [class_id],
                "details": {"required": required, "available": total_slots},
            }
        )

    for group in parallel_assignment_groups(payload.assignments):
        by_teacher: dict[str, list[str]] = {}
        for assignment in group:
            by_teacher.setdefault(assignment.teacher_id, []).append(assignment.id)
        for teacher_id, assignment_ids in by_teacher.items():
            if len(assignment_ids) < 2:
                continue
            diagnostics.append(
                {
                    "code": "PARALLEL_SAME_TEACHER",
                    "message": (
                        f"Učitel {_teacher_label(payload, teacher_id)} je přiřazen do více "
                        "skupin výuky, které musí probíhat současně."
                    ),
                    "entityIds": [teacher_id, *assignment_ids],
                }
            )

    return diagnostics


@contextmanager
def _patched_solver(
    *,
    class_day_policy: bool = False,
    rotations_disabled: bool = False,
    parallel_sync_disabled: bool = False,
    room_share_disabled: bool = False,
) -> Iterator[None]:
    originals: list[tuple[Any, str, Any]] = []

    def patch(module: Any, name: str, value: Any) -> None:
        originals.append((module, name, getattr(module, name)))
        setattr(module, name, value)

    if class_day_policy:

        def no_required_periods(_assignments: Any) -> dict[str, int]:
            return {}

        patch(solver_main, "class_required_weekly_periods", no_required_periods)
        patch(rotations, "class_required_weekly_periods", no_required_periods)
        patch(validator, "class_required_weekly_periods", no_required_periods)

    if parallel_sync_disabled:
        no_parallel_groups = lambda _assignments: []
        patch(solver_main, "parallel_assignment_groups", no_parallel_groups)
        patch(validator, "parallel_assignment_groups", no_parallel_groups)

    if room_share_disabled:
        no_room_share_pairs = lambda _assignments: []
        no_room_share_groups = lambda _assignments: []
        patch(solver_main, "room_share_block_pairs", no_room_share_pairs)
        patch(validator, "room_share_block_pairs", no_room_share_pairs)
        patch(validator, "room_share_assignment_groups", no_room_share_groups)

    if rotations_disabled:

        def quality_only_rotation_constraints(
            *,
            model: Any,
            payload: SolveRequest,
            blocks_by_assignment: dict[str, list[Any]],
            variables: dict[str, list[tuple[Any, Any]]],
            objective_terms: list[Any],
        ) -> list[dict[str, Any]]:
            rotations._add_preferred_tv_sync(
                model=model,
                payload=payload,
                blocks_by_assignment=blocks_by_assignment,
                variables=variables,
                objective_terms=objective_terms,
            )
            rotations._add_school_quality_policy(
                model=model,
                payload=payload,
                blocks_by_assignment=blocks_by_assignment,
                variables=variables,
                objective_terms=objective_terms,
            )
            return []

        patch(solver_main, "add_rotation_constraints", quality_only_rotation_constraints)
        patch(validator, "validate_rotation_schedule", lambda _payload, _lessons: [])

    try:
        yield
    finally:
        for module, name, original in reversed(originals):
            setattr(module, name, original)


def _diagnostic_payload(payload: SolveRequest) -> SolveRequest:
    copy = payload.model_copy(deep=True)
    copy.time_limit_seconds = min(DIAGNOSTIC_SECONDS, payload.time_limit_seconds)
    copy.random_seed = 1
    return copy


def _relax_fixed_lessons(payload: SolveRequest) -> SolveRequest:
    copy = _diagnostic_payload(payload)
    copy.fixed_lessons = []
    copy.locked_lessons = []
    return copy


def _relax_rooms(payload: SolveRequest) -> SolveRequest:
    copy = _diagnostic_payload(payload)
    for assignment in copy.assignments:
        assignment.required_room_id = None
        assignment.required_room_type_id = None
        assignment.room_share_key = None
    return copy


def _relax_unavailable(payload: SolveRequest) -> SolveRequest:
    copy = _diagnostic_payload(payload)
    copy.availability = [
        rule for rule in copy.availability if rule.kind != AvailabilityKind.UNAVAILABLE
    ]
    return copy


def _find_feasible_relaxation(
    payload: SolveRequest,
    *,
    candidate: SolveRequest | None = None,
    class_day_policy: bool = False,
    rotations_disabled: bool = False,
    parallel_sync_disabled: bool = False,
    room_share_disabled: bool = False,
) -> RelaxationOutcome:
    diagnostic_payload = candidate or _diagnostic_payload(payload)
    try:
        with _patched_solver(
            class_day_policy=class_day_policy,
            rotations_disabled=rotations_disabled,
            parallel_sync_disabled=parallel_sync_disabled,
            room_share_disabled=room_share_disabled,
        ):
            solver_main.solve(diagnostic_payload)
    except HTTPException as exc:
        if _http_exception_code(exc) in {"INFEASIBLE", "INFEASIBLE_INPUT"}:
            return RelaxationOutcome.INFEASIBLE
        return RelaxationOutcome.INDETERMINATE
    return RelaxationOutcome.FEASIBLE


def _diagnose_infeasibility(payload: SolveRequest) -> list[dict[str, Any]]:
    structural = _structural_diagnostics(payload)
    if structural:
        return structural

    attempts = [
        (
            {
                "code": "CLASS_DAY_POLICY_CONFLICT",
                "message": (
                    "Konflikt obsahuje pravidla denní struktury tříd: souvislá výuka "
                    "od 1. hodiny, minimální denní zátěž nebo omezení odpolední výuky. "
                    "Po jejich diagnostickém uvolnění solver řešení našel."
                ),
                "entityIds": [],
                "details": {"relaxedConstraintGroup": "CLASS_DAY_POLICY"},
            },
            lambda: _find_feasible_relaxation(payload, class_day_policy=True),
        ),
        (
            {
                "code": "FIXED_LESSON_POLICY_CONFLICT",
                "message": (
                    "Konflikt obsahuje pevně umístěné nebo ručně uzamčené hodiny. "
                    "Bez nich solver řešení našel."
                ),
                "entityIds": [
                    *[item.assignment_id for item in payload.fixed_lessons],
                    *[item.assignment_id for item in payload.locked_lessons],
                ],
                "details": {"relaxedConstraintGroup": "FIXED_LESSONS"},
            },
            lambda: _find_feasible_relaxation(
                payload,
                candidate=_relax_fixed_lessons(payload),
            ),
        ),
        (
            {
                "code": "ROTATION_POLICY_CONFLICT",
                "message": (
                    "Konflikt obsahuje pravidlo výměny/rotace předmětů. Po vypnutí "
                    "pouze vazby mezi rameny rotace solver řešení našel."
                ),
                "entityIds": sorted(
                    {
                        assignment.rotation_key
                        for assignment in payload.assignments
                        if assignment.rotation_key
                    }
                ),
                "details": {"relaxedConstraintGroup": "ROTATIONS"},
            },
            lambda: _find_feasible_relaxation(payload, rotations_disabled=True),
        ),
        (
            {
                "code": "PARALLEL_POLICY_CONFLICT",
                "message": (
                    "Konflikt obsahuje požadavek, aby dělené/paralelní skupiny běžely "
                    "ve stejném čase. Bez této synchronizace solver řešení našel."
                ),
                "entityIds": [],
                "details": {"relaxedConstraintGroup": "PARALLEL_SYNC"},
            },
            lambda: _find_feasible_relaxation(payload, parallel_sync_disabled=True),
        ),
        (
            {
                "code": "ROOM_POLICY_CONFLICT",
                "message": (
                    "Konflikt obsahuje kapacitu nebo povinné typy učeben/sportovních "
                    "prostorů. Bez místnostních omezení solver řešení našel."
                ),
                "entityIds": [],
                "details": {"relaxedConstraintGroup": "ROOMS"},
            },
            lambda: _find_feasible_relaxation(
                payload,
                candidate=_relax_rooms(payload),
                room_share_disabled=True,
            ),
        ),
        (
            {
                "code": "AVAILABILITY_POLICY_CONFLICT",
                "message": (
                    "Konflikt obsahuje některou tvrdou nedostupnost učitele, třídy nebo "
                    "místnosti. Bez pravidel NEDOSTUPNÉ solver řešení našel."
                ),
                "entityIds": sorted(
                    {
                        rule.entity_id
                        for rule in payload.availability
                        if rule.kind == AvailabilityKind.UNAVAILABLE
                    }
                ),
                "details": {"relaxedConstraintGroup": "UNAVAILABLE"},
            },
            lambda: _find_feasible_relaxation(
                payload,
                candidate=_relax_unavailable(payload),
            ),
        ),
    ]

    indeterminate_groups: list[str] = []
    for diagnostic, attempt in attempts:
        outcome = attempt()
        if outcome == RelaxationOutcome.FEASIBLE:
            return [diagnostic]
        if outcome == RelaxationOutcome.INDETERMINATE:
            group = diagnostic.get("details", {}).get("relaxedConstraintGroup")
            if isinstance(group, str):
                indeterminate_groups.append(group)

    combined = _relax_unavailable(_relax_rooms(_relax_fixed_lessons(payload)))
    combined_outcome = _find_feasible_relaxation(
        payload,
        candidate=combined,
        class_day_policy=True,
        rotations_disabled=True,
        parallel_sync_disabled=True,
        room_share_disabled=True,
    )
    if combined_outcome == RelaxationOutcome.FEASIBLE:
        return [
            {
                "code": "COMBINED_HARD_CONSTRAINT_CONFLICT",
                "message": (
                    "Neproveditelnost vzniká kombinací více tvrdých pravidel; žádná "
                    "jedna testovaná skupina omezení sama o sobě konflikt neodstranila."
                ),
                "entityIds": [],
                "details": {"relaxedConstraintGroup": "COMBINED"},
            }
        ]

    if combined_outcome == RelaxationOutcome.INDETERMINATE:
        indeterminate_groups.append("COMBINED")

    if indeterminate_groups:
        return [
            {
                "code": "DIAGNOSTIC_SEARCH_LIMIT",
                "message": (
                    "Původní rozvrh je neproveditelný, ale některé diagnostické běhy "
                    "skončily časovým limitem dřív, než stihly prokázat příčinu. "
                    "Tento výsledek proto neznamená, že jsou chybně zadané úvazky."
                ),
                "entityIds": [],
                "details": {
                    "diagnosticSeconds": DIAGNOSTIC_SECONDS,
                    "indeterminateConstraintGroups": sorted(
                        set(indeterminate_groups)
                    ),
                },
            }
        ]

    return [
        {
            "code": "UNRESOLVED_INFEASIBLE_CORE",
            "message": (
                "Konflikt zůstává prokazatelně neproveditelný i po diagnostickém "
                "uvolnění provozních pravidel. Jde tedy o základní kolizi výukových "
                "vazeb nebo zdrojů, ne o pouhý diagnostický timeout."
            ),
            "entityIds": [],
        }
    ]


def _error_response(exc: HTTPException, payload: SolveRequest) -> JSONResponse:
    raw_detail = exc.detail
    detail = raw_detail if isinstance(raw_detail, dict) else {"message": str(raw_detail)}
    code = str(detail.get("code") or "SOLVER_REQUEST_FAILED")
    message = str(detail.get("message") or "Výpočet se nepodařilo dokončit.")
    causes = _original_causes(detail)

    if _is_generic_infeasible(detail):
        causes = _diagnose_infeasibility(payload)
        first = causes[0]["message"] if causes else ""
        if first:
            message = f"Rozvrh je neproveditelný. {first}"

    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "code": code,
                "message": message,
                "details": {
                    "causes": causes,
                    "original": detail,
                },
            }
        },
    )


@app.post("/solve", response_model=SolveResponse)
def solve(payload: SolveRequest) -> SolveResponse | JSONResponse:
    # CP-SAT already consumes the machine aggressively. Serializing local/runtime
    # solves also makes temporary diagnostic relaxations race-free.
    with _SOLVE_LOCK:
        try:
            return solver_main.solve(payload)
        except HTTPException as exc:
            return _error_response(exc, payload)
