from pathlib import Path

EXPORT = Path("apps/web/lib/export/timetable-workbook.ts")
UNIT = Path("apps/web/tests/timetable-workbook.test.ts")
E2E = Path("apps/web/e2e/full-curriculum.spec.ts")

export = EXPORT.read_text()
old = '''function scheduledPeriods(
  lessons: TimetableExportLesson[],
  view: ExportView,
  entityId: string,
): number {
  return lessons
    .filter((lesson) => belongsTo(lesson, view, entityId))
    .reduce((total, lesson) => total + lesson.duration, 0);
}
'''
new = '''function scheduledPeriods(
  lessons: TimetableExportLesson[],
  view: ExportView,
  entityId: string,
): number {
  const entityLessons = lessons.filter((lesson) =>
    belongsTo(lesson, view, entityId),
  );
  if (view === "teacher") {
    return entityLessons.reduce(
      (total, lesson) => total + lesson.duration,
      0,
    );
  }
  const occupiedSlots = new Set<string>();
  for (const lesson of entityLessons) {
    for (let offset = 0; offset < lesson.duration; offset += 1) {
      occupiedSlots.add(`${lesson.day}:${lesson.period + offset}`);
    }
  }
  return occupiedSlots.size;
}

function scheduledBlocks(
  lessons: TimetableExportLesson[],
  view: ExportView,
  entityId: string,
): number {
  const entityLessons = lessons.filter((lesson) =>
    belongsTo(lesson, view, entityId),
  );
  if (view === "teacher") return entityLessons.length;
  return new Set(
    entityLessons.map(
      (lesson) => `${lesson.day}:${lesson.period}:${lesson.duration}`,
    ),
  ).size;
}
'''
if export.count(old) != 1:
    raise SystemExit(f"scheduledPeriods block count={export.count(old)}")
export = export.replace(old, new, 1)
old = '''  worksheet.getRow(headerRow).values = [
    "Kód",
    "Název",
    "Výukových hodin",
    "Počet bloků",
    "Otevřít list",
  ];
'''
new = '''  worksheet.getRow(headerRow).values = [
    "Kód",
    "Název",
    view === "class" ? "Obsazených hodin" : "Odučených hodin",
    view === "class" ? "Rozvrhových bloků" : "Počet bloků",
    "Otevřít list",
  ];
'''
if export.count(old) != 1:
    raise SystemExit(f"overview header count={export.count(old)}")
export = export.replace(old, new, 1)
old = '''    worksheet.getCell(row, 4).value = entityLessons.length;
'''
new = '''    worksheet.getCell(row, 4).value = scheduledBlocks(
      payload.lessons,
      view,
      entity.id,
    );
'''
if export.count(old) != 1:
    raise SystemExit(f"entity block count={export.count(old)}")
export = export.replace(old, new, 1)
old = '''  const counts: Array<[string, number]> = [
    ["Třídy", classes.length],
    ["Učitelé", teachers.length],
    ["Výukové bloky", input.classTimetable.lessons.length],
    [
      "Výukové hodiny",
      input.classTimetable.lessons.reduce(
        (total, lesson) => total + lesson.duration,
        0,
      ),
    ],
  ];
'''
new = '''  const counts: Array<[string, number]> = [
    ["Třídy", classes.length],
    ["Učitelé", teachers.length],
    [
      "Hodiny tříd týdně",
      classes.reduce(
        (total, entity) =>
          total +
          scheduledPeriods(input.classTimetable.lessons, "class", entity.id),
        0,
      ),
    ],
    [
      "Odučené hodiny učitelů",
      teachers.reduce(
        (total, entity) =>
          total +
          scheduledPeriods(
            input.teacherTimetable.lessons,
            "teacher",
            entity.id,
          ),
        0,
      ),
    ],
  ];
'''
if export.count(old) != 1:
    raise SystemExit(f"counts block count={export.count(old)}")
EXPORT.write_text(export.replace(old, new, 1))

unit = UNIT.read_text()
old = '''  const kadRow = findRowByFirstCell(overview, "KAD");
  assert.notEqual(kadRow, null);
  assert.equal(overview.getCell(kadRow!, 3).value, 17);
'''
new = '''  const class6ARow = findRowByFirstCell(overview, "6A");
  assert.notEqual(class6ARow, null);
  const class6AOccupiedSlots = new Set<string>();
  lessons
    .filter((item) => item.schoolClasses?.some((schoolClass) => schoolClass.code === "6A"))
    .forEach((item) => {
      for (let offset = 0; offset < item.duration; offset += 1) {
        class6AOccupiedSlots.add(`${item.day}:${item.period + offset}`);
      }
    });
  assert.equal(overview.getCell(class6ARow!, 3).value, class6AOccupiedSlots.size);
  assert.ok(
    Number(overview.getCell(class6ARow!, 3).value) <
      lessons
        .filter((item) => item.schoolClasses?.some((schoolClass) => schoolClass.code === "6A"))
        .reduce((total, item) => total + item.duration, 0),
  );

  const kadRow = findRowByFirstCell(overview, "KAD");
  assert.notEqual(kadRow, null);
  assert.equal(overview.getCell(kadRow!, 3).value, 17);
'''
if unit.count(old) != 1:
    raise SystemExit(f"unit insertion count={unit.count(old)}")
UNIT.write_text(unit.replace(old, new, 1))

e2e = E2E.read_text()
old = '''  expect(exported.worksheets).toHaveLength(54);
  for (const [classCode, grade] of CLASSES) {
    const worksheet = exported.getWorksheet(`Třída ${classCode}`)!;
    expect(worksheet).toBeDefined();
    expect(occupiedExportCells(worksheet)).toBe(
      expectedClassWeeklyPeriods(classCode, grade),
    );
  }
'''
new = '''  expect(exported.worksheets).toHaveLength(54);
  const overview = exported.getWorksheet("Přehled")!;
  expect(overview).toBeDefined();
  for (const [classCode, grade] of CLASSES) {
    const worksheet = exported.getWorksheet(`Třída ${classCode}`)!;
    expect(worksheet).toBeDefined();
    const expectedWeeklyPeriods = expectedClassWeeklyPeriods(classCode, grade);
    expect(occupiedExportCells(worksheet)).toBe(expectedWeeklyPeriods);
    let overviewRow: number | null = null;
    for (let row = 1; row <= overview.rowCount; row += 1) {
      if (overview.getCell(row, 1).text === classCode) {
        overviewRow = row;
        break;
      }
    }
    expect(overviewRow).not.toBeNull();
    expect(overview.getCell(overviewRow!, 3).value).toBe(expectedWeeklyPeriods);
  }
'''
if e2e.count(old) != 1:
    raise SystemExit(f"e2e insertion count={e2e.count(old)}")
E2E.write_text(e2e.replace(old, new, 1))
