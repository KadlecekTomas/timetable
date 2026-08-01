from pathlib import Path


def replace(path: str, old: str, new: str, count: int = -1) -> None:
    file = Path(path)
    text = file.read_text()
    if old not in text:
        raise SystemExit(f"Missing expected text in {path}: {old[:140]!r}")
    file.write_text(text.replace(old, new, count))


path = "apps/web/lib/domain/validation.ts"
replace(
    path,
    '} from "./contracts";\nimport {',
    '} from "./contracts";\nimport { lessonClassIds, parallelAssignmentPairs } from "./class-groups";\nimport {',
    1,
)
replace(
    path,
    "      lesson.class_id !== assignment.class_id ||\n      lesson.subject_id !== assignment.subject_id",
    "      lesson.class_id !== assignment.class_id ||\n      JSON.stringify(lesson.additional_class_ids ?? []) !==\n        JSON.stringify(assignment.additional_class_ids ?? []) ||\n      lesson.subject_id !== assignment.subject_id",
)
replace(
    path,
    "          [\"CLASS\", lesson.class_id],\n        ];",
    "          ...lessonClassIds(lesson).map(\n            (classId) => [\"CLASS\", classId] as [\"CLASS\", string],\n          ),\n        ];",
)
replace(
    path,
    "      const classKey = `${lesson.class_id}:${lesson.day}:${period}`;\n      const existingLessons = classSlots.get(classKey) ?? [];\n      for (const existing of existingLessons) {\n        if (groupsConflict(existing.group, lesson.group)) {\n          pushIssue(\n            issues,\n            \"CLASS_COLLISION\",\n            `Třída ${lesson.class_id} má současně bloky ${existing.block_id} a ${lesson.block_id}.`,\n            [lesson.class_id, existing.block_id, lesson.block_id],\n            lesson.day,\n            period,\n          );\n        }\n      }\n      classSlots.set(classKey, [...existingLessons, lesson]);",
    "      for (const classId of lessonClassIds(lesson)) {\n        const classKey = `${classId}:${lesson.day}:${period}`;\n        const existingLessons = classSlots.get(classKey) ?? [];\n        for (const existing of existingLessons) {\n          if (groupsConflict(existing.group, lesson.group)) {\n            pushIssue(\n              issues,\n              \"CLASS_COLLISION\",\n              `Třída ${classId} má současně bloky ${existing.block_id} a ${lesson.block_id}.`,\n              [classId, existing.block_id, lesson.block_id],\n              lesson.day,\n              period,\n            );\n          }\n        }\n        classSlots.set(classKey, [...existingLessons, lesson]);\n      }",
)
replace(
    path,
    "  return issues.sort((left, right) => {",
    "  const lessonsByAssignment = new Map<string, ScheduledLesson[]>();\n  for (const lesson of lessons) {\n    lessonsByAssignment.set(lesson.assignment_id, [\n      ...(lessonsByAssignment.get(lesson.assignment_id) ?? []),\n      lesson,\n    ]);\n  }\n  for (const [left, right] of parallelAssignmentPairs(snapshot.assignments)) {\n    const leftLessons = [...(lessonsByAssignment.get(left.id) ?? [])].sort(\n      (a, b) => a.block_id.localeCompare(b.block_id),\n    );\n    const rightLessons = [...(lessonsByAssignment.get(right.id) ?? [])].sort(\n      (a, b) => a.block_id.localeCompare(b.block_id),\n    );\n    if (leftLessons.length !== rightLessons.length) continue;\n    leftLessons.forEach((leftLesson, index) => {\n      const rightLesson = rightLessons[index]!;\n      if (\n        leftLesson.day !== rightLesson.day ||\n        leftLesson.period !== rightLesson.period ||\n        leftLesson.duration !== rightLesson.duration\n      ) {\n        pushIssue(\n          issues,\n          \"PARALLEL_GROUP_DESYNCHRONIZED\",\n          \"Obě poloviny dělené výuky musí probíhat současně.\",\n          [leftLesson.block_id, rightLesson.block_id],\n          leftLesson.day,\n          leftLesson.period,\n        );\n      }\n    });\n  }\n\n  return issues.sort((left, right) => {",
)
