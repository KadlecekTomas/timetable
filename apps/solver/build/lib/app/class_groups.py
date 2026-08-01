from collections import defaultdict

from app.models import Assignment, ScheduledLesson, TeachingGroup


def assignment_class_ids(assignment: Assignment) -> tuple[str, ...]:
    return tuple(dict.fromkeys([assignment.class_id, *assignment.additional_class_ids]))


def lesson_class_ids(lesson: ScheduledLesson) -> tuple[str, ...]:
    return tuple(dict.fromkeys([lesson.class_id, *lesson.additional_class_ids]))


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
        key = (tuple(sorted(assignment_class_ids(assignment))), assignment.subject_id)
        grouped[key][assignment.group].append(assignment)

    pairs: list[tuple[Assignment, Assignment]] = []
    for groups in grouped.values():
        left = sorted(groups.get(TeachingGroup.GROUP_1, []), key=lambda item: item.id)
        right = sorted(groups.get(TeachingGroup.GROUP_2, []), key=lambda item: item.id)
        if len(left) == 1 and len(right) == 1:
            pairs.append((left[0], right[0]))
    return pairs
