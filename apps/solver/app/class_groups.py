import re
from collections import defaultdict

from app.models import Assignment, ScheduledLesson, TeachingGroup

PARALLEL_GROUP_ORDER = (
    TeachingGroup.GROUP_1,
    TeachingGroup.GROUP_2,
    TeachingGroup.GROUP_3,
)


def assignment_class_ids(assignment: Assignment) -> tuple[str, ...]:
    return tuple(dict.fromkeys([assignment.class_id, *assignment.additional_class_ids]))


def lesson_class_ids(lesson: ScheduledLesson) -> tuple[str, ...]:
    return tuple(dict.fromkeys([lesson.class_id, *lesson.additional_class_ids]))


def _parallel_key(assignment: Assignment) -> str:
    if assignment.parallel_key:
        return assignment.parallel_key

    normalized_id = assignment.id.lower()
    if "-rot-" in normalized_id or "-rotation-" in normalized_id:
        return f"rotation-id:{re.sub(r'-(g1|g2)$', '', normalized_id)}"

    return f"subject:{assignment.subject_id}"


def parallel_assignment_groups(assignments: list[Assignment]) -> list[list[Assignment]]:
    grouped: dict[
        tuple[tuple[str, ...], str],
        dict[TeachingGroup, list[Assignment]],
    ] = defaultdict(lambda: defaultdict(list))

    for assignment in assignments:
        if assignment.group == TeachingGroup.WHOLE:
            continue
        key = (
            tuple(sorted(assignment_class_ids(assignment))),
            _parallel_key(assignment),
        )
        grouped[key][assignment.group].append(assignment)

    result: list[list[Assignment]] = []
    for groups in grouped.values():
        present: list[Assignment] = []
        raw_count = 0
        for group in PARALLEL_GROUP_ORDER:
            items = sorted(groups.get(group, []), key=lambda item: item.id)
            raw_count += len(items)
            if len(items) == 1:
                present.append(items[0])
        if len(present) >= 2 and len(present) == raw_count:
            result.append(present)
    return result


def parallel_assignment_pairs(
    assignments: list[Assignment],
) -> list[tuple[Assignment, Assignment]]:
    result: list[tuple[Assignment, Assignment]] = []
    for group in parallel_assignment_groups(assignments):
        if (
            len(group) == 2
            and group[0].group == TeachingGroup.GROUP_1
            and group[1].group == TeachingGroup.GROUP_2
        ):
            result.append((group[0], group[1]))
    return result


def rotation_assignment_legs(
    assignments: list[Assignment],
) -> list[tuple[str, tuple[Assignment, Assignment], tuple[Assignment, Assignment]]]:
    by_rotation: dict[str, dict[int, tuple[Assignment, Assignment]]] = defaultdict(dict)
    for left, right in parallel_assignment_pairs(assignments):
        if (
            left.rotation_key
            and left.rotation_key == right.rotation_key
            and left.rotation_leg is not None
            and left.rotation_leg == right.rotation_leg
        ):
            by_rotation[left.rotation_key][left.rotation_leg] = (left, right)

    result: list[tuple[str, tuple[Assignment, Assignment], tuple[Assignment, Assignment]]] = []
    for rotation_key, legs in sorted(by_rotation.items()):
        if 1 in legs and 2 in legs:
            result.append((rotation_key, legs[1], legs[2]))
    return result


def class_required_weekly_periods(assignments: list[Assignment]) -> dict[str, int]:
    totals: dict[str, int] = defaultdict(int)
    grouped_ids: set[str] = set()

    for group in parallel_assignment_groups(assignments):
        grouped_ids.update(item.id for item in group)
        weekly_periods = max(item.weekly_periods for item in group)
        for class_id in assignment_class_ids(group[0]):
            totals[class_id] += weekly_periods

    for assignment in assignments:
        if assignment.id in grouped_ids:
            continue
        for class_id in assignment_class_ids(assignment):
            totals[class_id] += assignment.weekly_periods

    return dict(totals)
