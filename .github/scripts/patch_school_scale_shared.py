from pathlib import Path


def replace(path: str, old: str, new: str, count: int = -1) -> None:
    file = Path(path)
    text = file.read_text()
    if old not in text:
        raise SystemExit(f"Missing expected text in {path}: {old[:170]!r}")
    file.write_text(text.replace(old, new, count))


path = "apps/web/e2e/school-scale.spec.ts"

replace(
    path,
    '  ["PRI", "Přírodopis", ""],\n  ["OV",',
    '  ["PRI", "Přírodopis", ""],\n  ["CH", "Chemie", ""],\n  ["OV",',
)
replace(
    path,
    "  classCode: string;\n  subjectCode: string;",
    "  classCode: string;\n  additionalClassCodes: string[];\n  subjectCode: string;",
)
replace(
    path,
    "  classId: string;\n  subjectId: string;",
    "  classId: string;\n  additionalClassIds: string[];\n  subjectId: string;",
)
replace(
    path,
    "  PRI: TEACHERS.filter((teacher) => teacher.code.startsWith(\"PR\")).map(\n    (teacher) => teacher.code,\n  ),\n  OV:",
    "  PRI: TEACHERS.filter((teacher) => teacher.code.startsWith(\"PR\")).map(\n    (teacher) => teacher.code,\n  ),\n  CH: TEACHERS.filter((teacher) => teacher.code.startsWith(\"FY\")).map(\n    (teacher) => teacher.code,\n  ),\n  OV:",
)
replace(
    path,
    '  "PRI",\n  "OV",',
    '  "PRI",\n  "CH",\n  "OV",',
)
replace(
    path,
    "  CLASSES.forEach(([classCode], classIndex) => {",
    "  CLASSES.forEach(([classCode, grade], classIndex) => {",
)
replace(
    path,
    "          classCode,\n          subjectCode,",
    "          classCode,\n          additionalClassCodes: [],\n          subjectCode,",
)
replace(
    path,
    "      classCode,\n      subjectCode: \"INF\",",
    "      classCode,\n      additionalClassCodes: [],\n      subjectCode: \"INF\",",
)
old_pe = '''    const kadTeachesPe = classCode === "9A" || classCode === "9C";
    assignments.push({
      code: `${classCode}-TV`,
      classCode,
      subjectCode: "TV",
      teacherCode: kadTeachesPe
        ? "KAD"
        : TEACHER_POOLS.TV[classIndex % TEACHER_POOLS.TV.length]!,
      group: "Celá třída",
      weeklyPeriods: 2,
      shape: kadTeachesPe ? "Dvojhodiny" : "Jednotlivé hodiny",
      doublePeriodsCount: 0,
      requiredRoom: null,
      requiredRoomType: "TĚLOCVIČNA",
      maxPerDay: 2,
      minDayGap: 0,
    });'''
new_pe = '''    if (classCode !== "9C") {
      const sharedKadPe = classCode === "9A";
      assignments.push({
        code: sharedKadPe ? "9A-9C-TV-KAD" : `${classCode}-TV`,
        classCode,
        additionalClassCodes: sharedKadPe ? ["9C"] : [],
        subjectCode: "TV",
        teacherCode: sharedKadPe
          ? "KAD"
          : TEACHER_POOLS.TV[classIndex % TEACHER_POOLS.TV.length]!,
        group: "Celá třída",
        weeklyPeriods: sharedKadPe ? 4 : 2,
        shape: sharedKadPe ? "Dvojhodiny" : "Jednotlivé hodiny",
        doublePeriodsCount: 0,
        requiredRoom: null,
        requiredRoomType: "TĚLOCVIČNA",
        maxPerDay: 2,
        minDayGap: 0,
      });
    }'''
replace(path, old_pe, new_pe)
replace(
    path,
    "    GENERAL_SUBJECTS.forEach((subjectCode) => {\n      const pool = TEACHER_POOLS[subjectCode];",
    "    GENERAL_SUBJECTS.forEach((subjectCode) => {\n      if (subjectCode === \"CH\" && grade < 8) return;\n      const pool = TEACHER_POOLS[subjectCode];",
)
replace(
    path,
    "        classCode,\n        subjectCode,",
    "        classCode,\n        additionalClassCodes: [],\n        subjectCode,",
)
replace(
    path,
    "  const classOrder = new Map(\n    CLASSES.map(([classCode], index) => [classCode, index]),\n  );",
    "  const classOrder = new Map<string, number>(\n    CLASSES.map(([classCode], index) => [classCode, index]),\n  );",
)
replace(
    path,
    "    teacher.classes.add(assignment.classCode);",
    "    teacher.classes.add(assignment.classCode);\n    assignment.additionalClassCodes.forEach((classCode) =>\n      teacher.classes.add(classCode),\n    );",
)
replace(path, "  clearDataRows(assignmentsSheet, 12);", "  clearDataRows(assignmentsSheet, 13);")
replace(path, "  expect(assignments).toHaveLength(234);", "  expect(assignments).toHaveLength(239);")
replace(
    path,
    "      assignment.classCode,\n      assignment.subjectCode,",
    "      assignment.classCode,\n      assignment.additionalClassCodes.join(\",\"),\n      assignment.subjectCode,",
)
replace(
    path,
    "  const kadPhysicalEducation = kadAssignments.filter(\n    (assignment) => assignment.subjectId === physicalEducation!.id,\n  );\n  expect(\n    kadPhysicalEducation\n      .map((assignment) => classById.get(assignment.classId)?.code)\n      .sort(),\n  ).toEqual([\"9A\", \"9C\"]);\n  kadPhysicalEducation.forEach((assignment) => {\n    expect(assignment.group).toBe(\"WHOLE\");\n    expect(assignment.weeklyPeriods).toBe(2);\n    expect(assignment.lessonShape).toBe(\"DOUBLE\");\n  });",
    "  const kadPhysicalEducation = kadAssignments.filter(\n    (assignment) => assignment.subjectId === physicalEducation!.id,\n  );\n  expect(kadPhysicalEducation).toHaveLength(1);\n  const sharedPeAssignment = kadPhysicalEducation[0]!;\n  expect(classById.get(sharedPeAssignment.classId)?.code).toBe(\"9A\");\n  expect(\n    sharedPeAssignment.additionalClassIds.map(\n      (classId) => classById.get(classId)?.code,\n    ),\n  ).toEqual([\"9C\"]);\n  expect(sharedPeAssignment.group).toBe(\"WHOLE\");\n  expect(sharedPeAssignment.weeklyPeriods).toBe(4);\n  expect(sharedPeAssignment.lessonShape).toBe(\"DOUBLE\");",
)
replace(
    path,
    "    const classAssignments = imported.assignments.filter(\n      (assignment) => assignment.classId === schoolClass.id,\n    );",
    "    const classAssignments = imported.assignments.filter(\n      (assignment) =>\n        assignment.classId === schoolClass.id ||\n        assignment.additionalClassIds.includes(schoolClass.id),\n    );",
)
replace(
    path,
    "    ).toEqual(SUBJECTS.map(([subjectCode]) => subjectCode).sort());",
    "    ).toEqual(\n      SUBJECTS.map(([subjectCode]) => subjectCode)\n        .filter((subjectCode) => subjectCode !== \"CH\" || schoolClass.grade >= 8)\n        .sort(),\n    );",
)
replace(
    path,
    "        (rule.entityType === \"CLASS\" && lesson.class_id === rule.entityId) ||",
    "        (rule.entityType === \"CLASS\" &&\n          [lesson.class_id, ...(lesson.additional_class_ids ?? [])].includes(\n            rule.entityId,\n          )) ||",
)
replace(
    path,
    "  const generatedKadPe = generatedKadLessons.filter(\n    (lesson) => lesson.subject_id === physicalEducation!.id,\n  );\n  expect(generatedKadPe).toHaveLength(2);\n  generatedKadPe.forEach((lesson) => expect(lesson.duration).toBe(2));",
    "  const generatedKadPe = generatedKadLessons.filter(\n    (lesson) => lesson.subject_id === physicalEducation!.id,\n  );\n  expect(generatedKadPe).toHaveLength(2);\n  generatedKadPe.forEach((lesson) => {\n    expect(lesson.duration).toBe(2);\n    expect(classById.get(lesson.class_id)?.code).toBe(\"9A\");\n    expect(\n      (lesson.additional_class_ids ?? []).map(\n        (classId) => classById.get(classId)?.code,\n      ),\n    ).toEqual([\"9C\"]);\n  });",
)
