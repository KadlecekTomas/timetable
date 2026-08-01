from pathlib import Path


def replace(path: str, old: str, new: str, count: int = -1) -> None:
    file = Path(path)
    text = file.read_text()
    if old not in text:
        raise SystemExit(f"Missing expected text in {path}: {old[:150]!r}")
    file.write_text(text.replace(old, new, count))


api = "apps/web/lib/local/api.ts"
ui = "apps/web/app/timetable/page.tsx"

replace(
    api,
    "  classId: string;\n  subjectId: string;",
    "  classId: string;\n  additionalClassIds: string[];\n  subjectId: string;",
    1,
)
replace(
    api,
    "      class_id: assignment.classId,\n      subject_id: assignment.subjectId,",
    "      class_id: assignment.classId,\n      additional_class_ids: assignment.additionalClassIds,\n      subject_id: assignment.subjectId,",
)
replace(
    api,
    "    schoolClass: project.classes.find((item) => item.id === assignment.classId),\n    subject:",
    "    schoolClass: project.classes.find((item) => item.id === assignment.classId),\n    schoolClasses: [assignment.classId, ...assignment.additionalClassIds]\n      .map((classId) => project.classes.find((item) => item.id === classId))\n      .filter(Boolean),\n    subject:",
)
replace(
    api,
    "        classId,\n        subjectId,",
    "        classId,\n        additionalClassIds: Array.isArray(body.additionalClassIds)\n          ? body.additionalClassIds.filter(\n              (item): item is string =>\n                typeof item === \"string\" &&\n                item !== classId &&\n                project.classes.some((schoolClass) => schoolClass.id === item),\n            )\n          : [],\n        subjectId,",
)
replace(
    api,
    "      project.assignments.some((item) => item.classId === id)",
    "      project.assignments.some(\n        (item) => item.classId === id || item.additionalClassIds.includes(id),\n      )",
)
replace(
    api,
    "    classId: classByCode.get(item.class_code)!,\n    subjectId:",
    "    classId: classByCode.get(item.class_code)!,\n    additionalClassIds: item.additional_class_codes.map(\n      (classCode) => classByCode.get(classCode)!,\n    ),\n    subjectId:",
)
replace(
    api,
    "      return view === \"class\"\n        ? assignment?.classId === entityId",
    "      return view === \"class\"\n        ? assignment != null &&\n            [assignment.classId, ...assignment.additionalClassIds].includes(entityId)",
)
replace(
    api,
    "      const schoolClass = project.classes.find(\n        (item) => item.id === assignment?.classId,\n      );",
    "      const schoolClass = project.classes.find(\n        (item) => item.id === assignment?.classId,\n      );\n      const schoolClasses = assignment\n        ? [assignment.classId, ...assignment.additionalClassIds]\n            .map((classId) => project.classes.find((item) => item.id === classId))\n            .filter((item): item is LocalClass => Boolean(item))\n        : [];",
)
replace(
    api,
    "        schoolClass: schoolClass\n          ? {",
    "        schoolClasses: schoolClasses.map((item) => ({\n          id: item.id,\n          code: item.code,\n          name: item.name,\n        })),\n        schoolClass: schoolClass\n          ? {",
)

replace(
    ui,
    "  schoolClass?: EntityView;\n  subject?:",
    "  schoolClass?: EntityView;\n  schoolClasses?: EntityView[];\n  subject?:",
)
replace(
    ui,
    '                                : lesson.schoolClass?.code}',
    '                                : (lesson.schoolClasses\n                                    ?.map((item) => item.code)\n                                    .join(" + ") ?? lesson.schoolClass?.code)}',
)
replace(
    ui,
    "                  {selectedLesson.schoolClass?.code} ·{\" \"}",
    "                  {(selectedLesson.schoolClasses\n                    ?.map((item) => item.code)\n                    .join(\" + \") ?? selectedLesson.schoolClass?.code)} ·{\" \"}",
)
