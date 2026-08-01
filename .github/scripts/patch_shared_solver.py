from pathlib import Path


def replace(path: str, old: str, new: str, count: int = -1) -> None:
    file = Path(path)
    text = file.read_text()
    if old not in text:
        raise SystemExit(f"Missing expected text in {path}: {old[:140]!r}")
    file.write_text(text.replace(old, new, count))


main = "apps/solver/app/main.py"
validator = "apps/solver/app/validator.py"

replace(
    main,
    "from app.models import (",
    "from app.class_groups import assignment_class_ids, parallel_assignment_pairs\nfrom app.models import (",
)
replace(
    main,
    "            (AvailabilityEntityType.CLASS, assignment.class_id),\n        ]",
    "            *(\n                (AvailabilityEntityType.CLASS, class_id)\n                for class_id in assignment_class_ids(assignment)\n            ),\n        ]",
)
replace(
    main,
    "            class_conflict = left_assignment.class_id == right_assignment.class_id and (\n                left_assignment.group == TeachingGroup.WHOLE\n                or right_assignment.group == TeachingGroup.WHOLE\n                or left_assignment.group == right_assignment.group\n            )",
    "            class_conflict = bool(\n                set(assignment_class_ids(left_assignment))\n                & set(assignment_class_ids(right_assignment))\n            ) and (\n                left_assignment.group == TeachingGroup.WHOLE\n                or right_assignment.group == TeachingGroup.WHOLE\n                or left_assignment.group == right_assignment.group\n            )",
)
replace(
    main,
    "                class_all_slots[\n                    (block.assignment.class_id, candidate.day, period)\n                ].append(variable)\n                if block.assignment.group == TeachingGroup.WHOLE:\n                    class_whole_slots[\n                        (block.assignment.class_id, candidate.day, period)\n                    ].append(variable)\n                elif block.assignment.group == TeachingGroup.GROUP_1:\n                    class_group_1_slots[\n                        (block.assignment.class_id, candidate.day, period)\n                    ].append(variable)\n                else:\n                    class_group_2_slots[\n                        (block.assignment.class_id, candidate.day, period)\n                    ].append(variable)",
    "                for class_id in assignment_class_ids(block.assignment):\n                    class_all_slots[(class_id, candidate.day, period)].append(variable)\n                    if block.assignment.group == TeachingGroup.WHOLE:\n                        class_whole_slots[(class_id, candidate.day, period)].append(variable)\n                    elif block.assignment.group == TeachingGroup.GROUP_1:\n                        class_group_1_slots[(class_id, candidate.day, period)].append(variable)\n                    else:\n                        class_group_2_slots[(class_id, candidate.day, period)].append(variable)",
)
replace(
    main,
    "    for assignment in payload.assignments:\n        assignment_blocks = blocks_by_assignment[assignment.id]",
    "    for left, right in parallel_assignment_pairs(payload.assignments):\n        left_blocks = sorted(blocks_by_assignment[left.id], key=lambda item: item.index)\n        right_blocks = sorted(blocks_by_assignment[right.id], key=lambda item: item.index)\n        if [item.duration for item in left_blocks] != [item.duration for item in right_blocks]:\n            raise HTTPException(\n                status_code=422,\n                detail={\n                    \"code\": \"PARALLEL_GROUP_SHAPE_MISMATCH\",\n                    \"message\": \"Dvě poloviny stejné výuky musí mít stejné rozložení hodin.\",\n                    \"causes\": [{\"entityIds\": [left.id, right.id]}],\n                },\n            )\n        for left_block, right_block in zip(left_blocks, right_blocks, strict=True):\n            positions = {\n                (candidate.day, candidate.period)\n                for candidate, _variable in variables[left_block.id]\n            } | {\n                (candidate.day, candidate.period)\n                for candidate, _variable in variables[right_block.id]\n            }\n            for day, period in positions:\n                left_at_position = [\n                    variable\n                    for candidate, variable in variables[left_block.id]\n                    if candidate.day == day and candidate.period == period\n                ]\n                right_at_position = [\n                    variable\n                    for candidate, variable in variables[right_block.id]\n                    if candidate.day == day and candidate.period == period\n                ]\n                model.add(sum(left_at_position) == sum(right_at_position))\n\n    for assignment in payload.assignments:\n        assignment_blocks = blocks_by_assignment[assignment.id]",
)
replace(
    main,
    "        {assignment.class_id for assignment in payload.assignments},",
    "        {\n            class_id\n            for assignment in payload.assignments\n            for class_id in assignment_class_ids(assignment)\n        },",
)
replace(
    main,
    "                class_id=block.assignment.class_id,\n                subject_id=block.assignment.subject_id,",
    "                class_id=block.assignment.class_id,\n                additional_class_ids=block.assignment.additional_class_ids,\n                subject_id=block.assignment.subject_id,",
)

replace(
    validator,
    "from app.models import (",
    "from app.class_groups import (\n    lesson_class_ids,\n    parallel_assignment_pairs,\n)\nfrom app.models import (",
)
replace(
    validator,
    "            or lesson.class_id != assignment.class_id\n            or lesson.subject_id != assignment.subject_id",
    "            or lesson.class_id != assignment.class_id\n            or lesson.additional_class_ids != assignment.additional_class_ids\n            or lesson.subject_id != assignment.subject_id",
)
replace(
    validator,
    "                (AvailabilityEntityType.CLASS, lesson.class_id),\n            ]",
    "                *(\n                    (AvailabilityEntityType.CLASS, class_id)\n                    for class_id in lesson_class_ids(lesson)\n                ),\n            ]",
)
replace(
    validator,
    "            class_key = (lesson.class_id, lesson.day, period)\n            for existing in class_slots[class_key]:\n                if _groups_conflict(existing.group, lesson.group):\n                    issues.append(\n                        ValidationIssue(\n                            code=\"CLASS_COLLISION\",\n                            message=(\n                                f\"Třída {lesson.class_id} má současně bloky \"\n                                f\"{existing.block_id} a {lesson.block_id}.\"\n                            ),\n                            entity_ids=[lesson.class_id, existing.block_id, lesson.block_id],\n                            day=lesson.day,\n                            period=period,\n                        )\n                    )\n            class_slots[class_key].append(lesson)",
    "            for class_id in lesson_class_ids(lesson):\n                class_key = (class_id, lesson.day, period)\n                for existing in class_slots[class_key]:\n                    if _groups_conflict(existing.group, lesson.group):\n                        issues.append(\n                            ValidationIssue(\n                                code=\"CLASS_COLLISION\",\n                                message=(\n                                    f\"Třída {class_id} má současně bloky \"\n                                    f\"{existing.block_id} a {lesson.block_id}.\"\n                                ),\n                                entity_ids=[class_id, existing.block_id, lesson.block_id],\n                                day=lesson.day,\n                                period=period,\n                            )\n                        )\n                class_slots[class_key].append(lesson)",
)
replace(
    validator,
    "    return sorted(\n        issues,",
    "    lessons_by_assignment: dict[str, list[ScheduledLesson]] = defaultdict(list)\n    for lesson in lessons:\n        lessons_by_assignment[lesson.assignment_id].append(lesson)\n    for left, right in parallel_assignment_pairs(payload.assignments):\n        left_lessons = sorted(\n            lessons_by_assignment[left.id], key=lambda item: item.block_id\n        )\n        right_lessons = sorted(\n            lessons_by_assignment[right.id], key=lambda item: item.block_id\n        )\n        if len(left_lessons) != len(right_lessons):\n            continue\n        for left_lesson, right_lesson in zip(left_lessons, right_lessons, strict=True):\n            if (\n                left_lesson.day != right_lesson.day\n                or left_lesson.period != right_lesson.period\n                or left_lesson.duration != right_lesson.duration\n            ):\n                issues.append(\n                    ValidationIssue(\n                        code=\"PARALLEL_GROUP_DESYNCHRONIZED\",\n                        message=\"Obě poloviny dělené výuky musí probíhat současně.\",\n                        entity_ids=[left_lesson.block_id, right_lesson.block_id],\n                        day=left_lesson.day,\n                        period=left_lesson.period,\n                    )\n                )\n\n    return sorted(\n        issues,",
)
