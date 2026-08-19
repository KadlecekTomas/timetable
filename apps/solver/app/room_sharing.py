from collections import defaultdict

from app.models import Assignment


def room_share_assignment_groups(
    assignments: list[Assignment],
) -> list[tuple[str, list[Assignment]]]:
    grouped: dict[str, list[Assignment]] = defaultdict(list)
    for assignment in assignments:
        if assignment.room_share_key:
            grouped[assignment.room_share_key].append(assignment)
    return [
        (key, sorted(items, key=lambda item: item.id))
        for key, items in sorted(grouped.items())
    ]


def shared_room_block_durations(assignments: list[Assignment]) -> list[int]:
    if len(assignments) < 2:
        return []
    durations = [assignment.block_durations() for assignment in assignments]
    shared: list[int] = []
    for index in range(min(len(items) for items in durations)):
        duration = durations[0][index]
        if any(items[index] != duration for items in durations[1:]):
            break
        shared.append(duration)
    return shared


def room_share_block_pairs(assignments: list[Assignment]) -> list[tuple[str, str]]:
    pairs: list[tuple[str, str]] = []
    for _key, group in room_share_assignment_groups(assignments):
        if len(group) < 2:
            continue
        shared = shared_room_block_durations(group)
        leader = group[0]
        for follower in group[1:]:
            # A room-share pair means both lessons must run in the same room at the
            # same time. One teacher cannot teach both lessons simultaneously, so a
            # same-teacher pair is an invalid co-teaching constraint. Ignore that
            # derived room-share link and let the normal teacher/room constraints
            # place the lessons independently instead of making the whole model UNSAT.
            if leader.teacher_id == follower.teacher_id:
                continue
            for index in range(len(shared)):
                pairs.append((f"{leader.id}:{index}", f"{follower.id}:{index}"))
    return pairs


def room_share_block_pair_key(left_block_id: str, right_block_id: str) -> tuple[str, str]:
    return tuple(sorted((left_block_id, right_block_id)))
