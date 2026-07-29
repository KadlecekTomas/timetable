from datetime import UTC, datetime

import ortools
from fastapi import FastAPI, HTTPException
from ortools.sat.python import cp_model
from pydantic import BaseModel, Field, model_validator

app = FastAPI(title="Timetable Solver", version="0.2.0")


class HealthResponse(BaseModel):
    service: str
    status: str
    ortools_version: str
    timestamp: datetime


class Assignment(BaseModel):
    id: str
    teacher_id: str
    class_id: str
    subject_id: str
    room_id: str | None = None
    lessons_per_week: int = Field(ge=1, le=20)
    duration: int = Field(default=1, ge=1, le=2)
    group_code: str | None = None


class LockedLesson(BaseModel):
    assignment_id: str
    day: int = Field(ge=0, le=4)
    period: int = Field(ge=0, le=9)


class SolveRequest(BaseModel):
    contract_version: str = "1.0"
    days: int = Field(default=5, ge=1, le=7)
    periods_per_day: int = Field(default=8, ge=1, le=12)
    assignments: list[Assignment]
    locked_lessons: list[LockedLesson] = []

    @model_validator(mode="after")
    def validate_contract(self) -> "SolveRequest":
        if self.contract_version != "1.0":
            raise ValueError("Unsupported contract version")
        assignment_ids = {assignment.id for assignment in self.assignments}
        unknown = [item.assignment_id for item in self.locked_lessons if item.assignment_id not in assignment_ids]
        if unknown:
            raise ValueError(f"Locked lessons reference unknown assignments: {unknown}")
        return self


class ScheduledLesson(BaseModel):
    assignment_id: str
    teacher_id: str
    class_id: str
    subject_id: str
    room_id: str | None
    group_code: str | None
    day: int
    period: int
    duration: int
    locked: bool


class SolveResponse(BaseModel):
    status: str
    score: int
    lessons: list[ScheduledLesson]
    diagnostics: list[str]


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(
        service="solver",
        status="ok",
        ortools_version=ortools.__version__,
        timestamp=datetime.now(UTC),
    )


@app.post("/solve", response_model=SolveResponse)
def solve(payload: SolveRequest) -> SolveResponse:
    model = cp_model.CpModel()
    lesson_variables: list[tuple[Assignment, int, cp_model.IntVar, cp_model.IntVar]] = []
    horizon = payload.days * payload.periods_per_day

    for assignment in payload.assignments:
        for occurrence in range(assignment.lessons_per_week):
            start = model.new_int_var(0, horizon - assignment.duration, f"start_{assignment.id}_{occurrence}")
            day = model.new_int_var(0, payload.days - 1, f"day_{assignment.id}_{occurrence}")
            period = model.new_int_var(0, payload.periods_per_day - assignment.duration, f"period_{assignment.id}_{occurrence}")
            model.add(start == day * payload.periods_per_day + period)
            lesson_variables.append((assignment, occurrence, start, period))

    locked_by_assignment: dict[str, list[LockedLesson]] = {}
    for locked in payload.locked_lessons:
        locked_by_assignment.setdefault(locked.assignment_id, []).append(locked)

    for assignment, occurrence, start, _period in lesson_variables:
        locked_items = locked_by_assignment.get(assignment.id, [])
        if occurrence < len(locked_items):
            locked = locked_items[occurrence]
            model.add(start == locked.day * payload.periods_per_day + locked.period)

    for index, (left, _, left_start, _) in enumerate(lesson_variables):
        for right, _, right_start, _ in lesson_variables[index + 1 :]:
            shares_resource = (
                left.teacher_id == right.teacher_id
                or left.class_id == right.class_id
                or (left.room_id is not None and left.room_id == right.room_id)
            )
            split_pair = (
                left.class_id == right.class_id
                and left.group_code is not None
                and right.group_code is not None
                and left.group_code != right.group_code
            )
            if shares_resource and not split_pair:
                before = model.new_bool_var(f"before_{left.id}_{right.id}_{index}")
                model.add(left_start + left.duration <= right_start).only_enforce_if(before)
                model.add(right_start + right.duration <= left_start).only_enforce_if(before.not_())

    objective_terms: list[cp_model.LinearExpr] = []
    for _assignment, _occurrence, _start, period in lesson_variables:
        objective_terms.append(period)
    model.minimize(sum(objective_terms))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 10.0
    solver.parameters.num_search_workers = 1
    solver.parameters.random_seed = 1
    status = solver.solve(model)

    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        raise HTTPException(
            status_code=422,
            detail={
                "code": "INFEASIBLE",
                "message": "Pro zadaná data nebyl nalezen rozvrh bez tvrdého konfliktu.",
            },
        )

    lessons: list[ScheduledLesson] = []
    for assignment, occurrence, start, _period in lesson_variables:
        start_value = solver.value(start)
        day = start_value // payload.periods_per_day
        period = start_value % payload.periods_per_day
        lessons.append(
            ScheduledLesson(
                assignment_id=assignment.id,
                teacher_id=assignment.teacher_id,
                class_id=assignment.class_id,
                subject_id=assignment.subject_id,
                room_id=assignment.room_id,
                group_code=assignment.group_code,
                day=day,
                period=period,
                duration=assignment.duration,
                locked=occurrence < len(locked_by_assignment.get(assignment.id, [])),
            )
        )

    penalty = int(solver.objective_value)
    score = max(0, 100 - min(100, penalty))
    diagnostics = [
        "Všechny tvrdé kolize učitelů, tříd a učeben byly ověřeny.",
        "Skóre v MVP zvýhodňuje dřívější a kompaktnější umístění hodin.",
    ]
    return SolveResponse(status="FEASIBLE", score=score, lessons=lessons, diagnostics=diagnostics)
