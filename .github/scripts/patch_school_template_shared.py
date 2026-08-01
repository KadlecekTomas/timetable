from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    if new in text:
        return
    if old not in text:
        raise SystemExit(f"Missing expected text in {path}: {old[:180]!r}")
    file.write_text(text.replace(old, new, 1))


overrides = "apps/web/lib/import/school-staffing-overrides.ts"
template_test = "apps/web/tests/school-client-workbook.test.ts"
scale = "apps/web/e2e/school-scale.spec.ts"

replace_once(
    overrides,
    "const ASSIGNMENT_COLUMN_COUNT = 12;",
    "const ASSIGNMENT_COLUMN_COUNT = 13;",
)
replace_once(
    overrides,
    '    const subjectCode = String(row[2] ?? "").trim();\n    const group = String(row[4] ?? "").trim();',
    '    const subjectCode = String(row[3] ?? "").trim();\n    const group = String(row[5] ?? "").trim();',
)
replace_once(
    overrides,
    '        classCode,\n        "INF",\n        null,\n        "Celá třída",',
    '        classCode,\n        null,\n        "INF",\n        null,\n        "Celá třída",',
)

replace_once(
    template_test,
    "  const assignmentRows = filledRows(assignments, 12);",
    "  const assignmentRows = filledRows(assignments, 13);",
)
replace_once(
    template_test,
    "    assignmentRows.slice(0, 9).map((row) => row.slice(0, 7)),",
    "    assignmentRows\n      .slice(0, 9)\n      .map((row) => [row[0], row[1], ...row.slice(3, 8)]),",
)
replace_once(
    template_test,
    '  const informaticsRows = assignmentRows.filter((row) => row[2] === "INF");',
    '  const informaticsRows = assignmentRows.filter((row) => row[3] === "INF");',
)
replace_once(
    template_test,
    "      row[4],\n      row[5],\n      row[6],\n      row[7],\n      row[9],\n      row[10],\n      row[11],",
    "      row[5],\n      row[6],\n      row[7],\n      row[8],\n      row[10],\n      row[11],\n      row[12],",
)
replace_once(
    template_test,
    '  assert.match(organization.getCell("A10").text, /automaticky nevynucuje/);',
    '  assert.match(organization.getCell("A10").text, /automaticky umístí/);',
)

synchronization_helper = '''function assertSplitGroupsSynchronized(
  snapshot: CanonicalSnapshot,
  lessons: ScheduledLesson[],
) {
  for (const schoolClass of snapshot.classes) {
    for (const subjectCode of SPLIT_SUBJECTS) {
      const subject = snapshot.subjects.find((item) => item.code === subjectCode);
      expect(subject).toBeDefined();
      const assignments = snapshot.assignments.filter(
        (assignment) =>
          assignment.class_id === schoolClass.id &&
          assignment.subject_id === subject!.id,
      );
      const group1 = assignments.find((item) => item.group === "GROUP_1");
      const group2 = assignments.find((item) => item.group === "GROUP_2");
      expect(group1).toBeDefined();
      expect(group2).toBeDefined();
      const slots = (assignmentId: string) =>
        lessons
          .filter((lesson) => lesson.assignment_id === assignmentId)
          .map((lesson) => `${lesson.day}:${lesson.period}:${lesson.duration}`)
          .sort();
      expect(slots(group1!.id)).toEqual(slots(group2!.id));
    }
  }
}

'''
scale_file = Path(scale)
scale_text = scale_file.read_text()
marker = 'test("school leadership can import 40 teachers, generate the complete second-stage timetable and move a lesson", async ({\n'
if synchronization_helper not in scale_text:
    if marker not in scale_text:
        raise SystemExit("Missing school-scale test marker")
    scale_file.write_text(scale_text.replace(marker, synchronization_helper + marker, 1))

replace_once(
    scale,
    "  assertAvailabilityRespected(generated, generatedVersion.lessons);",
    "  assertAvailabilityRespected(generated, generatedVersion.lessons);\n  assertSplitGroupsSynchronized(\n    generatedVersion.snapshot,\n    generatedVersion.lessons,\n  );",
)
