from collections import defaultdict

from app.models import (
    AvailabilityEntityType,
    AvailabilityKind,
    ScheduledLesson,
    ScoreIncident,
    ScoreReport,
    SolveRequest,
)
from app.validator import validate_schedule

CATEGORY_MAXIMUMS = {
    "class_compactness": 25,
    "teacher_compactness": 25,
    "distribution": 15,
    "teacher_preferences": 15,
    "day_edges": 10,
    "stability_and_rooms": 10,
}

AFTERNOON_START_PERIOD = 6
ALLOWED_CLASS_AFTERNOON_DAYS = {1, 2, 3}


def _score_label(total: int) -> str:
    if total >= 95:
        return "Výborný návrh"
    if total >= 85:
        return "Velmi dobrý návrh"
    if total >= 70:
        return "Použitelný návrh s rezervami"
    if total >= 50:
        return "Vyžaduje výraznější úpravy"
    return "Slabý návrh"


def _deduct(
    categories: dict[str, int],
    incidents: list[ScoreIncident],
    *,
    category: str,
    points: int,
    code: str,
    message: str,
    entity_ids: list[str],
    day: int | None = None,
    period: int | None = None,
    suggestion: str | None = None,
) -> None:
    applied = min(points, categories[category])
    if applied <= 0:
        return
    categories[category] -= applied
    incidents.append(
        ScoreIncident(
            code=code,
            category=category,
            points=applied,
            message=message,
            entity_ids=entity_ids,
            day=day,
            period=period,
            suggestion=suggestion,
        )
    )


def _occupancy(
    lessons: list[ScheduledLesson],
    attribute: str,
) -> dict[tuple[str, int], set[int]]:
    result: dict[tuple[str, int], set[int]] = defaultdict(set)
    for lesson in lessons:
        entity_ids = (
            [lesson.class_id, *lesson.additional_class_ids]
            if attribute == "class_id"
            else [getattr(lesson, attribute)]
        )
        for entity_id in entity_ids:
            for period in range(lesson.period, lesson.period + lesson.duration):
                result[(entity_id, lesson.day)].add(period)
    return result


def _entity_occupies(
    lessons: list[ScheduledLesson],
    entity_type: AvailabilityEntityType,
    entity_id: str,
    day: int,
    period: int,
) -> bool:
    for lesson in lessons:
        if lesson.day != day or not (
            lesson.period <= period < lesson.period + lesson.duration
        ):
            continue
        if (
            entity_type == AvailabilityEntityType.TEACHER
            and lesson.teacher_id == entity_id
        ):
            return True
        if (
            entity_type == AvailabilityEntityType.CLASS
            and entity_id in [lesson.class_id, *lesson.additional_class_ids]
        ):
            return True
        if (
            entity_type == AvailabilityEntityType.ROOM
            and lesson.room_id == entity_id
        ):
            return True
    return False


def score_schedule(
    payload: SolveRequest,
    lessons: list[ScheduledLesson],
) -> ScoreReport:
    hard_issues = validate_schedule(payload, lessons)
    if hard_issues:
        return ScoreReport(
            valid=False,
            total=None,
            label=None,
            categories={},
            incidents=[],
            hard_issues=hard_issues,
        )

    categories = dict(CATEGORY_MAXIMUMS)
    incidents: list[ScoreIncident] = []

    for category, attribute, code, noun in (
        ("class_compactness", "class_id", "CLASS_GAP", "Třída"),
        ("teacher_compactness", "teacher_id", "TEACHER_GAP", "Učitel"),
    ):
        for (entity_id, day), occupied in sorted(
            _occupancy(lessons, attribute).items()
        ):
            if len(occupied) < 2:
                continue
            gaps = [
                period
                for period in range(min(occupied), max(occupied) + 1)
                if period not in occupied
            ]
            for index, period in enumerate(gaps):
                points = 1 if index == 0 else 2 if index == 1 else 3
                _deduct(
                    categories,
                    incidents,
                    category=category,
                    points=points,
                    code=code,
                    message=(
                        f"{noun} {entity_id} má v rozvrhu vnitřní volnou hodinu."
                    ),
                    entity_ids=[entity_id],
                    day=day,
                    period=period,
                    suggestion=(
                        "Přesuňte sousední výuku blíže k sobě, "
                        "pokud to ostatní omezení dovolí."
                    ),
                )

    assignments = {
        assignment.id: assignment for assignment in payload.assignments
    }
    assignment_days: dict[
        tuple[str, int],
        list[ScheduledLesson],
    ] = defaultdict(list)
    subject_days: dict[tuple[str, str, int], set[int]] = defaultdict(set)
    for lesson in lessons:
        assignment_days[(lesson.assignment_id, lesson.day)].append(lesson)
        for class_id in [lesson.class_id, *lesson.additional_class_ids]:
            for period in range(
                lesson.period,
                lesson.period + lesson.duration,
            ):
                subject_days[(class_id, lesson.subject_id, lesson.day)].add(
                    period
                )

    for (assignment_id, day), day_lessons in sorted(assignment_days.items()):
        assignment = assignments[assignment_id]
        if (
            len(day_lessons) > 1
            and assignment.lesson_shape.value != "DOUBLE"
        ):
            _deduct(
                categories,
                incidents,
                category="distribution",
                points=len(day_lessons) - 1,
                code="ASSIGNMENT_SAME_DAY_CONCENTRATION",
                message=(
                    f"Vazba {assignment_id} má více samostatných bloků v jednom dni."
                ),
                entity_ids=[assignment_id],
                day=day,
                suggestion="Rozložte výuku do více dnů.",
            )

    for (class_id, subject_id, day), occupied_periods in sorted(
        subject_days.items()
    ):
        periods = len(occupied_periods)
        if periods > 2:
            _deduct(
                categories,
                incidents,
                category="distribution",
                points=periods - 2,
                code="SUBJECT_SAME_DAY_CONCENTRATION",
                message=(
                    f"Třída {class_id} má předmět {subject_id} soustředěný do jednoho dne."
                ),
                entity_ids=[class_id, subject_id],
                day=day,
                suggestion="Rozložte předmět do více pracovních dnů.",
            )

    for rule in sorted(
        payload.availability,
        key=lambda item: (
            item.entity_type.value,
            item.entity_id,
            item.day,
            item.period,
            item.kind.value,
        ),
    ):
        occupied = _entity_occupies(
            lessons,
            rule.entity_type,
            rule.entity_id,
            rule.day,
            rule.period,
        )
        if rule.kind == AvailabilityKind.DISCOURAGED and occupied:
            _deduct(
                categories,
                incidents,
                category="teacher_preferences",
                points=max(1, (rule.weight or 25) // 25),
                code="DISCOURAGED_SLOT",
                message=(
                    "Výuka zasahuje do nedoporučeného slotu entity "
                    f"{rule.entity_id}."
                ),
                entity_ids=[rule.entity_id],
                day=rule.day,
                period=rule.period,
                suggestion=(
                    rule.reason or "Zvažte přesun do vhodnějšího slotu."
                ),
            )
        elif rule.kind == AvailabilityKind.PREFERRED and not occupied:
            _deduct(
                categories,
                incidents,
                category="teacher_preferences",
                points=1,
                code="PREFERRED_SLOT_UNUSED",
                message=(
                    f"Preferovaný slot entity {rule.entity_id} nebyl využit."
                ),
                entity_ids=[rule.entity_id],
                day=rule.day,
                period=rule.period,
                suggestion=(
                    rule.reason
                    or "Při další optimalizaci zkuste preferovaný slot využít."
                ),
            )

    teacher_occupancy = _occupancy(lessons, "teacher_id")
    for (teacher_id, day), occupied in sorted(teacher_occupancy.items()):
        if len(occupied) == 1:
            period = next(iter(occupied))
            if period == 0 or period == payload.periods_per_day[day] - 1:
                _deduct(
                    categories,
                    incidents,
                    category="day_edges",
                    points=1,
                    code="ISOLATED_EDGE_LESSON",
                    message=(
                        f"Učitel {teacher_id} má v daný den jedinou hodinu na okraji dne."
                    ),
                    entity_ids=[teacher_id],
                    day=day,
                    period=period,
                    suggestion=(
                        "Zvažte spojení této hodiny s další výukou stejného dne."
                    ),
                )

    class_occupancy = _occupancy(lessons, "class_id")
    class_ids = sorted({class_id for class_id, _day in class_occupancy})
    if len(payload.periods_per_day) == 5:
        for class_id in class_ids:
            loads = [
                len(class_occupancy.get((class_id, day), set()))
                for day in range(5)
            ]
            weekly_periods = sum(loads)
            if weekly_periods < 5:
                continue

            minimum_daily_load = max(
                1,
                ((weekly_periods + 4) // 5) - 1,
            )
            afternoon_days: set[int] = set()
            for day, load in enumerate(loads):
                occupied = class_occupancy.get((class_id, day), set())
                if load < minimum_daily_load:
                    _deduct(
                        categories,
                        incidents,
                        category="day_edges",
                        points=2,
                        code="CLASS_DAY_TOO_SHORT",
                        message=(
                            f"Třída {class_id} má nepřiměřeně krátký vyučovací den."
                        ),
                        entity_ids=[class_id],
                        day=day,
                        suggestion=(
                            "Rozložte týdenní výuku rovnoměrněji mezi pracovní dny."
                        ),
                    )
                if any(period >= AFTERNOON_START_PERIOD for period in occupied):
                    afternoon_days.add(day)
                    if day not in ALLOWED_CLASS_AFTERNOON_DAYS:
                        _deduct(
                            categories,
                            incidents,
                            category="day_edges",
                            points=3,
                            code="CLASS_AFTERNOON_FORBIDDEN_DAY",
                            message=(
                                f"Třída {class_id} má odpolední výuku v nevhodný den."
                            ),
                            entity_ids=[class_id],
                            day=day,
                            suggestion=(
                                "Odpolední výuku plánujte pouze na úterý, "
                                "středu nebo čtvrtek."
                            ),
                        )

            for day in range(4):
                if day in afternoon_days and day + 1 in afternoon_days:
                    _deduct(
                        categories,
                        incidents,
                        category="day_edges",
                        points=2,
                        code="CONSECUTIVE_CLASS_AFTERNOONS",
                        message=(
                            f"Třída {class_id} má odpolední výuku dva dny po sobě."
                        ),
                        entity_ids=[class_id],
                        day=day + 1,
                        suggestion=(
                            "Oddělte odpolední dny alespoň jedním dnem "
                            "bez 7.–8. hodiny."
                        ),
                    )

            spread = max(loads) - min(loads)
            if spread > 2:
                _deduct(
                    categories,
                    incidents,
                    category="day_edges",
                    points=min(3, spread - 2),
                    code="CLASS_DAY_LOAD_IMBALANCE",
                    message=(
                        f"Třída {class_id} má výrazně nevyrovnanou délku vyučovacích dnů."
                    ),
                    entity_ids=[class_id],
                    suggestion="Vyrovnejte počet hodin mezi jednotlivými dny.",
                )

    total = sum(categories.values())
    return ScoreReport(
        valid=True,
        total=total,
        label=_score_label(total),
        categories=categories,
        incidents=sorted(
            incidents,
            key=lambda item: (
                item.category,
                item.code,
                -1 if item.day is None else item.day,
                -1 if item.period is None else item.period,
                item.message,
            ),
        ),
    )
