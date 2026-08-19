from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field, model_validator


class TeachingGroup(StrEnum):
    WHOLE = "WHOLE"
    GROUP_1 = "GROUP_1"
    GROUP_2 = "GROUP_2"
    GROUP_3 = "GROUP_3"


class LessonShape(StrEnum):
    SINGLE = "SINGLE"
    DOUBLE = "DOUBLE"
    MIXED = "MIXED"


class ClassProfile(StrEnum):
    REGULAR = "REGULAR"
    SPORTS = "SPORTS"
    CUSTOM = "CUSTOM"


class RotationPlacement(StrEnum):
    ADJACENT = "ADJACENT"
    SAME_DAY = "SAME_DAY"
    FLEXIBLE = "FLEXIBLE"


class AvailabilityEntityType(StrEnum):
    TEACHER = "TEACHER"
    CLASS = "CLASS"
    ROOM = "ROOM"


class AvailabilityKind(StrEnum):
    UNAVAILABLE = "UNAVAILABLE"
    PREFERRED = "PREFERRED"
    DISCOURAGED = "DISCOURAGED"


class SubjectWindowRule(BaseModel):
    subject_codes: list[str] = Field(min_length=1)
    periods: list[int] = Field(min_length=1)
    days: list[int] | None = None

    @model_validator(mode="after")
    def validate_window(self) -> "SubjectWindowRule":
        self.subject_codes = sorted(
            {code.strip().upper() for code in self.subject_codes if code.strip()}
        )
        if not self.subject_codes:
            raise ValueError("subject_codes must contain at least one code")
        if any(period < 0 or period > 15 for period in self.periods):
            raise ValueError("policy periods must be between 0 and 15")
        self.periods = sorted(set(self.periods))
        if self.days is not None:
            if any(day < 0 or day > 6 for day in self.days):
                raise ValueError("policy days must be between 0 and 6")
            self.days = sorted(set(self.days))
        return self


class SubjectDailyLimit(BaseModel):
    subject_codes: list[str] = Field(min_length=1)
    max_periods_per_day: int = Field(ge=1, le=12)

    @model_validator(mode="after")
    def normalize_codes(self) -> "SubjectDailyLimit":
        self.subject_codes = sorted(
            {code.strip().upper() for code in self.subject_codes if code.strip()}
        )
        if not self.subject_codes:
            raise ValueError("subject_codes must contain at least one code")
        return self


class ClassDayPolicy(BaseModel):
    require_first_period: bool = True
    allowed_afternoon_patterns: list[list[int]] = Field(default_factory=list)
    latest_period_by_day: list[int | None] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_patterns(self) -> "ClassDayPolicy":
        normalized: list[list[int]] = []
        for pattern in self.allowed_afternoon_patterns:
            if any(period < 0 or period > 15 for period in pattern):
                raise ValueError("afternoon pattern periods must be between 0 and 15")
            item = sorted(set(pattern))
            if item and item not in normalized:
                normalized.append(item)
        self.allowed_afternoon_patterns = normalized
        if any(
            period is not None and (period < 0 or period > 15)
            for period in self.latest_period_by_day
        ):
            raise ValueError("latest_period_by_day values must be null or 0..15")
        return self


class TeacherAfternoonBreakPolicy(BaseModel):
    enabled: bool = False
    afternoon_start_period: int = Field(default=6, ge=0, le=15)
    break_periods: list[int] = Field(default_factory=list)
    minimum_free_periods: int = Field(default=1, ge=1, le=12)

    @model_validator(mode="after")
    def validate_break(self) -> "TeacherAfternoonBreakPolicy":
        if any(period < 0 or period > 15 for period in self.break_periods):
            raise ValueError("teacher break periods must be between 0 and 15")
        self.break_periods = sorted(set(self.break_periods))
        if self.enabled and not self.break_periods:
            raise ValueError("enabled teacher afternoon break requires break_periods")
        if self.enabled and self.minimum_free_periods > len(self.break_periods):
            raise ValueError("minimum_free_periods cannot exceed break_periods")
        return self


class QualityPolicy(BaseModel):
    class_daily_balance_weight: int = Field(default=0, ge=0, le=1_000_000)
    class_afternoon_weight: int = Field(default=0, ge=0, le=1_000_000)
    afternoon_day_weights: list[int] = Field(default_factory=list)
    subject_late_weights: dict[str, int] = Field(default_factory=dict)
    subject_afternoon_bonuses: dict[str, int] = Field(default_factory=dict)

    @model_validator(mode="after")
    def normalize_quality(self) -> "QualityPolicy":
        if any(weight < 0 or weight > 1_000_000 for weight in self.afternoon_day_weights):
            raise ValueError("afternoon_day_weights must be between 0 and 1000000")
        self.subject_late_weights = {
            code.strip().upper(): weight
            for code, weight in self.subject_late_weights.items()
            if code.strip()
        }
        self.subject_afternoon_bonuses = {
            code.strip().upper(): weight
            for code, weight in self.subject_afternoon_bonuses.items()
            if code.strip()
        }
        if any(
            weight < 0 or weight > 1_000_000
            for weight in [
                *self.subject_late_weights.values(),
                *self.subject_afternoon_bonuses.values(),
            ]
        ):
            raise ValueError("subject policy weights must be between 0 and 1000000")
        return self


class SolverPolicy(BaseModel):
    version: str = "1"
    forbidden_subject_windows: list[SubjectWindowRule] = Field(default_factory=list)
    subject_daily_limits: list[SubjectDailyLimit] = Field(default_factory=list)
    class_day: ClassDayPolicy = Field(default_factory=ClassDayPolicy)
    teacher_afternoon_break: TeacherAfternoonBreakPolicy = Field(
        default_factory=TeacherAfternoonBreakPolicy
    )
    quality: QualityPolicy = Field(default_factory=QualityPolicy)

    @model_validator(mode="after")
    def validate_version(self) -> "SolverPolicy":
        if self.version != "1":
            raise ValueError("Unsupported solver policy version")
        return self


class Subject(BaseModel):
    id: str
    code: str


class SchoolClass(BaseModel):
    id: str
    code: str
    profile: ClassProfile = ClassProfile.REGULAR


class Room(BaseModel):
    id: str
    room_type_id: str | None = None


class AvailabilityRule(BaseModel):
    entity_type: AvailabilityEntityType
    entity_id: str
    day: int = Field(ge=0, le=6)
    period: int = Field(ge=0, le=15)
    kind: AvailabilityKind
    weight: int | None = Field(default=None, ge=1, le=100)
    reason: str | None = None


class Assignment(BaseModel):
    id: str
    teacher_id: str
    class_id: str
    additional_class_ids: list[str] = Field(default_factory=list)
    subject_id: str
    group: TeachingGroup = TeachingGroup.WHOLE
    weekly_periods: int = Field(ge=1, le=40)
    lesson_shape: LessonShape = LessonShape.SINGLE
    double_periods_count: int = Field(default=0, ge=0, le=20)
    required_room_id: str | None = None
    required_room_type_id: str | None = None
    max_per_day: int | None = Field(default=None, ge=1, le=12)
    min_day_gap: int | None = Field(default=None, ge=0, le=6)
    parallel_key: str | None = None
    room_share_key: str | None = None
    rotation_key: str | None = None
    rotation_leg: int | None = Field(default=None, ge=1, le=2)
    rotation_placement: RotationPlacement | None = None

    @model_validator(mode="after")
    def validate_shape(self) -> "Assignment":
        if self.class_id in self.additional_class_ids:
            raise ValueError("Primary class cannot also be an additional class")
        if len(self.additional_class_ids) != len(set(self.additional_class_ids)):
            raise ValueError("Additional class ids must be unique")
        if self.double_periods_count * 2 > self.weekly_periods:
            raise ValueError("double_periods_count * 2 cannot exceed weekly_periods")
        if self.lesson_shape == LessonShape.SINGLE and self.double_periods_count != 0:
            raise ValueError("SINGLE assignments cannot define double periods")
        if self.lesson_shape == LessonShape.DOUBLE and self.weekly_periods % 2 != 0:
            raise ValueError("DOUBLE assignments require an even weekly_periods value")
        if self.group == TeachingGroup.WHOLE and self.parallel_key:
            raise ValueError("WHOLE assignments cannot define a parallel_key")
        if (self.rotation_key is None) != (self.rotation_leg is None):
            raise ValueError("rotation_key and rotation_leg must be defined together")
        if self.rotation_key and self.group == TeachingGroup.WHOLE:
            raise ValueError("Rotations require GROUP_1 or GROUP_2 assignments")
        if self.rotation_key and not self.parallel_key:
            raise ValueError("Rotation assignments require a parallel_key")
        if self.rotation_placement is not None and not self.rotation_key:
            raise ValueError("rotation_placement requires a rotation_key")
        return self

    def block_durations(self) -> list[int]:
        if self.lesson_shape == LessonShape.SINGLE:
            return [1] * self.weekly_periods
        if self.lesson_shape == LessonShape.DOUBLE:
            return [2] * (self.weekly_periods // 2)
        singles = self.weekly_periods - (self.double_periods_count * 2)
        return ([2] * self.double_periods_count) + ([1] * singles)


class FixedLesson(BaseModel):
    assignment_id: str
    block_index: int = Field(default=0, ge=0)
    day: int = Field(ge=0, le=6)
    period: int = Field(ge=0, le=15)
    room_id: str | None = None
    locked: bool = True


COMPACTNESS_MINIMUMS = {
    "teacher_gap": 1_000,
    "class_gap": 2_000,
    "discouraged_slot": 25,
    "preferred_slot_bonus": 3,
    "same_day_concentration": 50,
    "late_period": 10,
    "rotation_spread": 75,
}


class SolverWeights(BaseModel):
    teacher_gap: int = Field(default=1_000, ge=0, le=10_000)
    class_gap: int = Field(default=2_000, ge=0, le=10_000)
    discouraged_slot: int = Field(default=25, ge=0, le=10_000)
    preferred_slot_bonus: int = Field(default=3, ge=0, le=10_000)
    same_day_concentration: int = Field(default=50, ge=0, le=10_000)
    late_period: int = Field(default=10, ge=0, le=10_000)
    rotation_spread: int = Field(default=75, ge=0, le=10_000)

    @model_validator(mode="after")
    def enforce_compactness_first_profile(self) -> "SolverWeights":
        """Prevent weak client defaults from trading timetable gaps for small bonuses."""
        for field_name, minimum in COMPACTNESS_MINIMUMS.items():
            current = getattr(self, field_name)
            if current < minimum:
                setattr(self, field_name, minimum)
        return self


class SolveRequest(BaseModel):
    contract_version: str = "1.0"
    periods_per_day: list[int] = Field(default_factory=lambda: [8, 8, 8, 8, 7], min_length=1, max_length=7)
    classes: list[SchoolClass] = Field(default_factory=list)
    subjects: list[Subject] = Field(default_factory=list)
    assignments: list[Assignment]
    rooms: list[Room] = Field(default_factory=list)
    availability: list[AvailabilityRule] = Field(default_factory=list)
    fixed_lessons: list[FixedLesson] = Field(default_factory=list)
    locked_lessons: list[FixedLesson] = Field(default_factory=list)
    policy: SolverPolicy | None = None
    weights: SolverWeights = Field(default_factory=SolverWeights)
    random_seed: int = 1
    time_limit_seconds: int = Field(default=30, ge=1, le=1800)

    @model_validator(mode="after")
    def validate_contract(self) -> "SolveRequest":
        if self.contract_version != "1.0":
            raise ValueError("Unsupported contract version")
        if any(periods < 1 or periods > 12 for periods in self.periods_per_day):
            raise ValueError("periods_per_day values must be between 1 and 12")

        class_ids = [school_class.id for school_class in self.classes]
        if len(class_ids) != len(set(class_ids)):
            raise ValueError("Class ids must be unique")

        subject_ids = [subject.id for subject in self.subjects]
        if len(subject_ids) != len(set(subject_ids)):
            raise ValueError("Subject ids must be unique")

        assignment_ids = [assignment.id for assignment in self.assignments]
        if len(assignment_ids) != len(set(assignment_ids)):
            raise ValueError("Assignment ids must be unique")

        room_ids = [room.id for room in self.rooms]
        if len(room_ids) != len(set(room_ids)):
            raise ValueError("Room ids must be unique")

        assignments_by_id = {assignment.id: assignment for assignment in self.assignments}
        fixed_keys: set[tuple[str, int]] = set()
        for item in [*self.fixed_lessons, *self.locked_lessons]:
            assignment = assignments_by_id.get(item.assignment_id)
            if assignment is None:
                raise ValueError(f"Fixed lesson references unknown assignment {item.assignment_id}")
            if item.block_index >= len(assignment.block_durations()):
                raise ValueError(f"Fixed lesson block index {item.block_index} is outside assignment {item.assignment_id}")
            key = (item.assignment_id, item.block_index)
            if key in fixed_keys:
                raise ValueError(f"Block {item.assignment_id}:{item.block_index} is fixed more than once")
            fixed_keys.add(key)

        room_shares: dict[str, list[Assignment]] = {}
        for assignment in self.assignments:
            if assignment.room_share_key:
                room_shares.setdefault(assignment.room_share_key, []).append(assignment)
        for room_share_key, assignments in room_shares.items():
            if len(assignments) != 2:
                raise ValueError(
                    f"Room share {room_share_key} must contain exactly two assignments"
                )
            if len({assignment.subject_id for assignment in assignments}) != 1:
                raise ValueError(
                    f"Room share {room_share_key} must contain the same subject"
                )
            room_requirements = {
                (assignment.required_room_id, assignment.required_room_type_id)
                for assignment in assignments
            }
            if len(room_requirements) != 1 or room_requirements == {(None, None)}:
                raise ValueError(
                    f"Room share {room_share_key} must use the same required room or room type"
                )
            durations = [assignment.block_durations() for assignment in assignments]
            shared_blocks = 0
            for index in range(min(len(items) for items in durations)):
                if len({items[index] for items in durations}) != 1:
                    break
                shared_blocks += 1
            if shared_blocks == 0:
                raise ValueError(
                    f"Room share {room_share_key} has no compatible shared block"
                )

        rotations: dict[str, list[Assignment]] = {}
        for assignment in self.assignments:
            if assignment.rotation_key:
                rotations.setdefault(assignment.rotation_key, []).append(assignment)
        for rotation_key, assignments in rotations.items():
            by_leg_group = {(item.rotation_leg, item.group): item for item in assignments}
            required_keys = {
                (1, TeachingGroup.GROUP_1),
                (1, TeachingGroup.GROUP_2),
                (2, TeachingGroup.GROUP_1),
                (2, TeachingGroup.GROUP_2),
            }
            if set(by_leg_group) != required_keys or len(assignments) != 4:
                raise ValueError(f"Rotation {rotation_key} must contain exactly two groups in both legs")
            leg_1_group_1 = by_leg_group[(1, TeachingGroup.GROUP_1)]
            leg_1_group_2 = by_leg_group[(1, TeachingGroup.GROUP_2)]
            leg_2_group_1 = by_leg_group[(2, TeachingGroup.GROUP_1)]
            leg_2_group_2 = by_leg_group[(2, TeachingGroup.GROUP_2)]
            if (
                leg_1_group_1.subject_id != leg_2_group_2.subject_id
                or leg_1_group_1.teacher_id != leg_2_group_2.teacher_id
                or leg_1_group_2.subject_id != leg_2_group_1.subject_id
                or leg_1_group_2.teacher_id != leg_2_group_1.teacher_id
            ):
                raise ValueError(f"Rotation {rotation_key} must swap both subjects and teachers between groups")
            shapes = {
                (
                    item.weekly_periods,
                    item.lesson_shape,
                    item.double_periods_count,
                )
                for item in assignments
            }
            if len(shapes) != 1:
                raise ValueError(f"All assignments in rotation {rotation_key} must have the same lesson shape")
            class_sets = {tuple(sorted([item.class_id, *item.additional_class_ids])) for item in assignments}
            if len(class_sets) != 1:
                raise ValueError(f"All assignments in rotation {rotation_key} must target the same classes")
            leg_1_parallel_keys = {item.parallel_key for item in assignments if item.rotation_leg == 1}
            leg_2_parallel_keys = {item.parallel_key for item in assignments if item.rotation_leg == 2}
            if len(leg_1_parallel_keys) != 1 or len(leg_2_parallel_keys) != 1:
                raise ValueError(f"Each leg in rotation {rotation_key} must share one parallel_key")
            if leg_1_parallel_keys == leg_2_parallel_keys:
                raise ValueError(f"Rotation {rotation_key} must use a different parallel_key for each leg")
            placements = {item.rotation_placement or RotationPlacement.SAME_DAY for item in assignments}
            if len(placements) != 1:
                raise ValueError(f"All assignments in rotation {rotation_key} must share rotation_placement")
            if leg_1_group_1.subject_id == leg_1_group_2.subject_id:
                raise ValueError(f"Rotation {rotation_key} must contain two different subjects")
            if leg_1_group_1.teacher_id == leg_1_group_2.teacher_id:
                raise ValueError(f"Rotation {rotation_key} must contain two different teachers")
        return self


class ScheduledLesson(BaseModel):
    block_id: str
    assignment_id: str
    teacher_id: str
    class_id: str
    additional_class_ids: list[str] = Field(default_factory=list)
    subject_id: str
    group: TeachingGroup
    room_id: str | None
    day: int
    period: int
    duration: int
    locked: bool = False
    origin: str = "SOLVER"


class ValidationIssue(BaseModel):
    code: str
    message: str
    entity_ids: list[str] = Field(default_factory=list)
    day: int | None = None
    period: int | None = None
    details: dict[str, Any] = Field(default_factory=dict)


class ScoreIncident(BaseModel):
    code: str
    category: str
    points: int
    message: str
    entity_ids: list[str] = Field(default_factory=list)
    day: int | None = None
    period: int | None = None
    suggestion: str | None = None


class ScoreReport(BaseModel):
    valid: bool
    total: int | None
    label: str | None
    categories: dict[str, int]
    incidents: list[ScoreIncident]
    hard_issues: list[ValidationIssue] = Field(default_factory=list)


class SolveResponse(BaseModel):
    contract_version: str = "1.0"
    status: str
    objective_value: float
    lessons: list[ScheduledLesson]
    score: ScoreReport
    diagnostics: list[dict[str, Any]]
    solver_stats: dict[str, Any]
