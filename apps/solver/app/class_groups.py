import re
from collections import defaultdict

from app.models import Assignment, ScheduledLesson, TeachingGroup


def assignment_class_ids(assignment: Assignment) -> tuple[str, ...]:
    return tuple(dict.fromkeys([assignment.class_id, *assignment.additional_class_ids]))


def lesson_class_ids(lesson: ScheduledLesson) -> tuple[str, ...]:
    return tuple(dict.fromkeys([lesson.class_id, *lesson.additional_class_ids]))


def _parallel_key(assignment: Assignment) -> str:
    if assignment.parallel_key:
        return assignment.parallel_key

    # Local projects created by older web clients do not persist parallel_key yet.
    # Rotation assignment codes deliberately end in -G1/-G2, so both halves can
    # still be paired after backup/restore and after passing through IndexedDB.
    normalized_id = assignment.id.lower()
    if "-rot-" in normalized_id or "-rotation-" in normalized_id:
        return f"rotation-id:{re.sub(r'-(g1|g2)$', '', normalized_id)}"

    return f"subject:{assignment.subject_id}"


def parallel_assignment_pairs(
    assignments: list[Assignment],
) -> list[tuple[Assignment, Assignment]]:
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

    pairs: list[tuple[Assignment, Assignment]] = []
    for groups in grouped.values():
        left = sorted(groups.get(TeachingGroup.GROUP_1, []), key=lambda item: item.id)
        right = sorted(groups.get(TeachingGroup.GROUP_2, []), key=lambda item: item.id)
        if len(left) == 1 and len(right) == 1:
            pairs.append((left[0], right[0]))
    return pairs


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
    paired_ids: set[str] = set()

    for left, right in parallel_assignment_pairs(assignments):
        paired_ids.update((left.id, right.id))
        weekly_periods = max(left.weekly_periods, right.weekly_periods)
        for class_id in assignment_class_ids(left):
            totals[class_id] += weekly_periods

    for assignment in assignments:
        if assignment.id in paired_ids:
            continue
        for class_id in assignment_class_ids(assignment):
            totals[class_id] += assignment.weekly_periods

    return dict(totals)
