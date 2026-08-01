from collections import defaultdict

from app.class_groups import (
    class_required_weekly_periods,
    lesson_class_ids,
    parallel_assignment_pairs,
)
from app.models import (
    AvailabilityEntityType,
    AvailabilityKind,
    FixedLesson,
    ScheduledLesson,
    SolveRequest,
    TeachingGroup,
    ValidationIssue,
)
from app.school_day import crosses_lunch_break


def _groups_conflict(left: TeachingGroup, right: TeachingGroup) -> bool:
    return left == TeachingGroup.WHOLE or right == TeachingGroup.WHOLE or left == right


def _fixed_by_block(payload: SolveRequest) -> dict[str, FixedLesson]:
    result: dict[str, FixedLesson] = {}
    for item in [*payload.fixed_lessons, *payload.locked_lessons]:
        result[f"{item.assignment_id}:{item.block_index}"] = item
    return result


def validate_schedule(payload: SolveRequest, lessons: list[ScheduledLesson]) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    assignments = {assignment.id: assignment for assignment in payload.assignments}
    rooms = {room.id: room for room in payload.rooms}
    fixed = _fixed_by_block(payload)

    expected: dict[str, tuple[str, int]] = {}
    for assignment in payload.assignments:
        for index, duration in enumerate(assignment.block_durations()):
            expected[f"{assignment.id}:{index}"] = (assignment.id, duration)

    seen: set[str] = set()
    for lesson in lessons:
        if lesson.block_id in seen:
            issues.append(
                ValidationIssue(
                    code="DUPLICATE_BLOCK",
                    message=f"Výukový blok {lesson.block_id} je ve výsledku vícekrát.",
                    entity_ids=[lesson.block_id],
                )
            )
            continue
        seen.add(lesson.block_id)

        expected_item = expected.get(lesson.block_id)
        assignment = assignments.get(lesson.assignment_id)
        if expected_item is None or assignment is None:
            issues.append(
                ValidationIssue(
                    code="UNKNOWN_BLOCK",
                    message=f"Výsledek obsahuje neznámý blok {lesson.block_id}.",
                    entity_ids=[lesson.block_id],
                )
            )
            continue

        expected_assignment_id, expected_duration = expected_item
        if lesson.assignment_id != expected_assignment_id or lesson.duration != expected_duration:
            issues.append(
                ValidationIssue(
                    code="BLOCK_CONTRACT_MISMATCH",
                    message=f"Blok {lesson.block_id} neodpovídá vstupní vazbě.",
                    entity_ids=[lesson.block_id, lesson.assignment_id],
                )
            )

        if (
            lesson.teacher_id != assignment.teacher_id
            or lesson.class_id != assignment.class_id
            or lesson.additional_class_ids != assignment.additional_class_ids
            or lesson.subject_id != assignment.subject_id
            or lesson.group != assignment.group
        ):
            issues.append(
                ValidationIssue(
                    code="ASSIGNMENT_DATA_MISMATCH",
                    message=f"Blok {lesson.block_id} změnil učitele, třídu, předmět nebo skupinu.",
                    entity_ids=[lesson.block_id, assignment.id],
                )
            )

        if lesson.day < 0 or lesson.day >= len(payload.periods_per_day):
            issues.append(
                ValidationIssue(
                    code="DAY_OUT_OF_RANGE",
                    message=f"Blok {lesson.block_id} leží mimo pracovní týden.",
                    entity_ids=[lesson.block_id],
                    day=lesson.day,
                )
            )
            continue

        if lesson.period < 0 or lesson.period + lesson.duration > payload.periods_per_day[lesson.day]:
            issues.append(
                ValidationIssue(
                    code="PERIOD_OUT_OF_RANGE",
                    message=f"Blok {lesson.block_id} se nevejde do rozsahu dne.",
                    entity_ids=[lesson.block_id],
                    day=lesson.day,
                    period=lesson.period,
                )
            )
            continue

        if crosses_lunch_break(lesson.period, lesson.duration):
            issues.append(
                ValidationIssue(
                    code="LUNCH_BREAK_CROSSED",
                    message=(f"Blok {lesson.block_id} nesmí spojit dopolední a odpolední vyučování přes obědovou přestávku."),
                    entity_ids=[lesson.block_id, lesson.class_id],
                    day=lesson.day,
                    period=lesson.period,
                    details={"morningPeriodLimit": 6, "minimumLunchBreakMinutes": 50},
                )
            )
            continue

        if assignment.required_room_id and lesson.room_id != assignment.required_room_id:
            issues.append(
                ValidationIssue(
                    code="REQUIRED_ROOM_MISMATCH",
                    message=f"Blok {lesson.block_id} není v povinné učebně.",
                    entity_ids=[lesson.block_id, assignment.required_room_id],
                    day=lesson.day,
                    period=lesson.period,
                )
            )

        if assignment.required_room_type_id:
            room = rooms.get(lesson.room_id or "")
            if room is None or room.room_type_id != assignment.required_room_type_id:
                issues.append(
                    ValidationIssue(
                        code="REQUIRED_ROOM_TYPE_MISMATCH",
                        message=f"Blok {lesson.block_id} není v učebně požadovaného typu.",
                        entity_ids=[lesson.block_id, assignment.required_room_type_id],
                        day=lesson.day,
                        period=lesson.period,
                    )
                )

        fixed_item = fixed.get(lesson.block_id)
        if fixed_item and (
            lesson.day != fixed_item.day
            or lesson.period != fixed_item.period
            or (fixed_item.room_id is not None and lesson.room_id != fixed_item.room_id)
        ):
            issues.append(
                ValidationIssue(
                    code="FIXED_LESSON_MOVED",
                    message=f"Pevný nebo zamčený blok {lesson.block_id} změnil své umístění.",
                    entity_ids=[lesson.block_id],
                    day=lesson.day,
                    period=lesson.period,
                )
            )

    for block_id in sorted(set(expected) - seen):
        issues.append(
            ValidationIssue(
                code="MISSING_BLOCK",
                message=f"Výukový blok {block_id} ve výsledku chybí.",
                entity_ids=[block_id],
            )
        )

    unavailable = {
        (rule.entity_type, rule.entity_id, rule.day, rule.period)
        for rule in payload.availability
        if rule.kind == AvailabilityKind.UNAVAILABLE
    }
    teacher_slots: dict[tuple[str, int, int], ScheduledLesson] = {}
    room_slots: dict[tuple[str, int, int], ScheduledLesson] = {}
    class_slots: dict[tuple[str, int, int], list[ScheduledLesson]] = defaultdict(list)

    for lesson in lessons:
        if lesson.day < 0 or lesson.day >= len(payload.periods_per_day):
            continue
        for period in range(lesson.period, lesson.period + lesson.duration):
            if period < 0 or period >= payload.periods_per_day[lesson.day]:
                continue

            unavailable_entities = [
                (AvailabilityEntityType.TEACHER, lesson.teacher_id),
                *((AvailabilityEntityType.CLASS, class_id) for class_id in lesson_class_ids(lesson)),
            ]
            if lesson.room_id:
                unavailable_entities.append((AvailabilityEntityType.ROOM, lesson.room_id))
            for entity_type, entity_id in unavailable_entities:
                if (entity_type, entity_id, lesson.day, period) in unavailable:
                    issues.append(
                        ValidationIssue(
                            code="UNAVAILABLE_SLOT",
                            message=f"Blok {lesson.block_id} zasahuje do nedostupného slotu.",
                            entity_ids=[lesson.block_id, entity_id],
                            day=lesson.day,
                            period=period,
                        )
                    )

            teacher_key = (lesson.teacher_id, lesson.day, period)
            conflicting_teacher_lesson = teacher_slots.get(teacher_key)
            if conflicting_teacher_lesson:
                issues.append(
                    ValidationIssue(
                        code="TEACHER_COLLISION",
                        message=(
                            f"Učitel {lesson.teacher_id} má současně bloky {conflicting_teacher_lesson.block_id} a {lesson.block_id}."
                        ),
                        entity_ids=[
                            lesson.teacher_id,
                            conflicting_teacher_lesson.block_id,
                            lesson.block_id,
                        ],
                        day=lesson.day,
                        period=period,
                    )
                )
            else:
                teacher_slots[teacher_key] = lesson

            if lesson.room_id:
                room_key = (lesson.room_id, lesson.day, period)
                conflicting_room_lesson = room_slots.get(room_key)
                if conflicting_room_lesson:
                    issues.append(
                        ValidationIssue(
                            code="ROOM_COLLISION",
                            message=(
                                f"Učebna {lesson.room_id} je současně použita bloky {conflicting_room_lesson.block_id} a {lesson.block_id}."
                            ),
                            entity_ids=[
                                lesson.room_id,
                                conflicting_room_lesson.block_id,
                                lesson.block_id,
                            ],
                            day=lesson.day,
                            period=period,
                        )
                    )
                else:
                    room_slots[room_key] = lesson

            for class_id in lesson_class_ids(lesson):
                class_key = (class_id, lesson.day, period)
                for existing in class_slots[class_key]:
                    if _groups_conflict(existing.group, lesson.group):
                        issues.append(
                            ValidationIssue(
                                code="CLASS_COLLISION",
                                message=(f"Třída {class_id} má současně bloky {existing.block_id} a {lesson.block_id}."),
                                entity_ids=[class_id, existing.block_id, lesson.block_id],
                                day=lesson.day,
                                period=period,
                            )
                        )
                class_slots[class_key].append(lesson)

    required_periods_by_class = class_required_weekly_periods(payload.assignments)
    if len(payload.periods_per_day) >= 5:
        for class_id, weekly_periods in required_periods_by_class.items():
            if weekly_periods < len(payload.periods_per_day):
                continue
            for day, periods in enumerate(payload.periods_per_day):
                if periods <= 0:
                    continue
                if not class_slots.get((class_id, day, 0)):
                    issues.append(
                        ValidationIssue(
                            code="CLASS_DOES_NOT_START_AT_EIGHT",
                            message=f"Třída {class_id} musí každý vyučovací den začínat první hodinou v 8:00.",
                            entity_ids=[class_id],
                            day=day,
                            period=0,
                            details={"requiredStartTime": "8:00"},
                        )
                    )

                occupied_periods = [
                    period
                    for period in range(periods)
                    if class_slots.get((class_id, day, period))
                ]
                if len(occupied_periods) <= 1:
                    continue
                for period in range(1, max(occupied_periods)):
                    if class_slots.get((class_id, day, period)):
                        continue
                    issues.append(
                        ValidationIssue(
                            code="CLASS_HAS_INTERNAL_GAP",
                            message=f"Třída {class_id} má uvnitř vyučovacího dne volnou hodinu.",
                            entity_ids=[class_id],
                            day=day,
                            period=period,
                            details={"requiredShape": "continuousFromEight"},
                        )
                    )
                    break

    lessons_by_assignment: dict[str, list[ScheduledLesson]] = defaultdict(list)
    for lesson in lessons:
        lessons_by_assignment[lesson.assignment_id].append(lesson)
    for left, right in parallel_assignment_pairs(payload.assignments):
        left_lessons = sorted(lessons_by_assignment[left.id], key=lambda item: item.block_id)
        right_lessons = sorted(lessons_by_assignment[right.id], key=lambda item: item.block_id)
        if len(left_lessons) != len(right_lessons):
            continue
        for left_lesson, right_lesson in zip(left_lessons, right_lessons, strict=True):
            if (
                left_lesson.day != right_lesson.day
                or left_lesson.period != right_lesson.period
                or left_lesson.duration != right_lesson.duration
            ):
                issues.append(
                    ValidationIssue(
                        code="PARALLEL_GROUP_DESYNCHRONIZED",
                        message="Obě poloviny dělené výuky musí probíhat současně.",
                        entity_ids=[left_lesson.block_id, right_lesson.block_id],
                        day=left_lesson.day,
                        period=left_lesson.period,
                    )
                )

    return sorted(
        issues,
        key=lambda issue: (
            issue.code,
            -1 if issue.day is None else issue.day,
            -1 if issue.period is None else issue.period,
            issue.message,
        ),
    )
