from collections import defaultdict

from app.class_groups import (
    class_required_weekly_periods,
    lesson_class_ids,
    parallel_assignment_groups,
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
from app.room_sharing import (
    room_share_assignment_groups,
    room_share_block_pair_key,
    room_share_block_pairs,
    shared_room_block_durations,
)
from app.rotations import validate_rotation_schedule
from app.school_day import (
    HISTORY_SUBJECT_CODE,
    TEACHER_BREAK_PERIODS,
    crosses_lunch_break,
    is_forbidden_friday_lesson,
)


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
    shared_room_pairs = {
        room_share_block_pair_key(left, right)
        for left, right in room_share_block_pairs(payload.assignments)
    }
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

        if is_forbidden_friday_lesson(
            lesson.day, lesson.period, lesson.duration
        ):
            issues.append(
                ValidationIssue(
                    code="FRIDAY_AFTERNOON_FORBIDDEN",
                    message="V pátek nesmí výuka pokračovat sedmou ani pozdější hodinou.",
                    entity_ids=[lesson.block_id],
                    day=lesson.day,
                    period=lesson.period,
                    details={"latestAllowedPeriod": 6},
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
                if (
                    conflicting_room_lesson
                    and room_share_block_pair_key(
                        conflicting_room_lesson.block_id, lesson.block_id
                    )
                    not in shared_room_pairs
                ):
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
                elif conflicting_room_lesson is None:
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

    teacher_ids = {lesson.teacher_id for lesson in lessons}
    for teacher_id in sorted(teacher_ids):
        for day, periods in enumerate(payload.periods_per_day):
            if all(
                period < periods and (teacher_id, day, period) in teacher_slots
                for period in TEACHER_BREAK_PERIODS
            ):
                issues.append(
                    ValidationIssue(
                        code="TEACHER_BREAK_MISSING",
                        message=(
                            f"Učitel {teacher_id} musí mít mezi 4.–6. hodinou "
                            "alespoň jednu volnou hodinu."
                        ),
                        entity_ids=[teacher_id],
                        day=day,
                        period=TEACHER_BREAK_PERIODS[0],
                        details={"periods": [4, 5, 6], "maximumTaught": 2},
                    )
                )

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

                occupied_periods = [period for period in range(periods) if class_slots.get((class_id, day, period))]
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
    for assignment in payload.assignments:
        if assignment.max_per_day is None:
            continue
        daily_periods: dict[int, int] = defaultdict(int)
        for lesson in lessons_by_assignment[assignment.id]:
            daily_periods[lesson.day] += lesson.duration
        for day, period_count in daily_periods.items():
            if period_count <= assignment.max_per_day:
                continue
            issues.append(
                ValidationIssue(
                    code="MAX_PER_DAY_EXCEEDED",
                    message=(
                        f"Výuková vazba {assignment.id} překročila denní limit "
                        f"{assignment.max_per_day} hodin."
                    ),
                    entity_ids=[assignment.id],
                    day=day,
                    details={
                        "maximum": assignment.max_per_day,
                        "actual": period_count,
                    },
                )
            )

    history_subject_ids = {
        subject.id
        for subject in payload.subjects
        if subject.code.strip().upper() == HISTORY_SUBJECT_CODE
    }
    history_occupancy: dict[tuple[str, int], set[int]] = defaultdict(set)
    for lesson in lessons:
        if lesson.subject_id not in history_subject_ids:
            continue
        for class_id in lesson_class_ids(lesson):
            history_occupancy[(class_id, lesson.day)].update(
                range(lesson.period, lesson.period + lesson.duration)
            )
    for (class_id, day), periods in history_occupancy.items():
        for period in sorted(periods):
            if period + 1 not in periods:
                continue
            issues.append(
                ValidationIssue(
                    code="CONSECUTIVE_HISTORY_LESSONS",
                    message=(
                        f"Třída {class_id} nesmí mít dějepis ve dvou "
                        "bezprostředně následujících hodinách."
                    ),
                    entity_ids=[class_id, *sorted(history_subject_ids)],
                    day=day,
                    period=period,
                )
            )
            break
    for _key, group in room_share_assignment_groups(payload.assignments):
        if len(group) != 2:
            continue
        shared_durations = shared_room_block_durations(group)
        left_assignment, right_assignment = group
        for index in range(len(shared_durations)):
            left = next(
                (
                    lesson
                    for lesson in lessons_by_assignment[left_assignment.id]
                    if lesson.block_id == f"{left_assignment.id}:{index}"
                ),
                None,
            )
            right = next(
                (
                    lesson
                    for lesson in lessons_by_assignment[right_assignment.id]
                    if lesson.block_id == f"{right_assignment.id}:{index}"
                ),
                None,
            )
            if left is None or right is None:
                continue
            if (
                left.day != right.day
                or left.period != right.period
                or left.duration != right.duration
                or left.room_id != right.room_id
            ):
                issues.append(
                    ValidationIssue(
                        code="ROOM_SHARE_DESYNCHRONIZED",
                        message=(
                            "Co-teaching ve sdíleném prostoru musí probíhat současně a ve stejné místnosti."
                        ),
                        entity_ids=[left.block_id, right.block_id],
                        day=left.day,
                        period=left.period,
                    )
                )

    for parallel_group in parallel_assignment_groups(payload.assignments):
        grouped_lessons = [
            sorted(lessons_by_assignment[item.id], key=lambda lesson: lesson.block_id)
            for item in parallel_group
        ]
        expected_length = len(grouped_lessons[0])
        if any(len(items) != expected_length for items in grouped_lessons[1:]):
            continue
        for index in range(expected_length):
            reference = grouped_lessons[0][index]
            for candidate_group in grouped_lessons[1:]:
                candidate = candidate_group[index]
                if (
                    reference.day != candidate.day
                    or reference.period != candidate.period
                    or reference.duration != candidate.duration
                ):
                    issues.append(
                        ValidationIssue(
                            code="PARALLEL_GROUP_DESYNCHRONIZED",
                            message="Všechny paralelní skupiny dělené výuky musí probíhat současně.",
                            entity_ids=[reference.block_id, candidate.block_id],
                            day=reference.day,
                            period=reference.period,
                        )
                    )

    issues.extend(validate_rotation_schedule(payload, lessons_by_assignment))

    return sorted(
        issues,
        key=lambda issue: (
            issue.code,
            -1 if issue.day is None else issue.day,
            -1 if issue.period is None else issue.period,
            issue.message,
        ),
    )
