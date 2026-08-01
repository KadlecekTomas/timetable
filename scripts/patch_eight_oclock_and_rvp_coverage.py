from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file_path = Path(path)
    source = file_path.read_text()
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one occurrence, got {count}: {old[:100]!r}")
    file_path.write_text(source.replace(old, new, 1))


Path("apps/web/lib/domain/school-day.ts").write_text(
    '''export const SCHOOL_DAY_START_TIME = "8:00";
export const MORNING_PERIOD_LIMIT = 6;
export const MIN_LUNCH_BREAK_MINUTES = 50;

export function schoolPeriodLabel(period: number): string {
  const ordinal = `${period + 1}. hodina`;
  return period === 0 ? `${ordinal} · ${SCHOOL_DAY_START_TIME}` : ordinal;
}

export function crossesLunchBreak(period: number, duration: number): boolean {
  return (
    period < MORNING_PERIOD_LIMIT && period + duration > MORNING_PERIOD_LIMIT
  );
}

export function isAfternoonPeriod(period: number): boolean {
  return period >= MORNING_PERIOD_LIMIT;
}
'''
)

replace_once(
    "apps/web/lib/domain/class-groups.ts",
    '''  return pairs;
}
''',
    '''  return pairs;
}

export function classRequiredWeeklyPeriods(
  assignments: SnapshotAssignment[],
): Map<string, number> {
  const totals = new Map<string, number>();
  const pairedIds = new Set<string>();

  for (const [left, right] of parallelAssignmentPairs(assignments)) {
    pairedIds.add(left.id);
    pairedIds.add(right.id);
    const weeklyPeriods = Math.max(left.weekly_periods, right.weekly_periods);
    for (const classId of assignmentClassIds(left)) {
      totals.set(classId, (totals.get(classId) ?? 0) + weeklyPeriods);
    }
  }

  for (const assignment of assignments) {
    if (pairedIds.has(assignment.id)) continue;
    for (const classId of assignmentClassIds(assignment)) {
      totals.set(
        classId,
        (totals.get(classId) ?? 0) + assignment.weekly_periods,
      );
    }
  }

  return totals;
}
''',
)

replace_once(
    "apps/solver/app/class_groups.py",
    '''    return pairs
''',
    '''    return pairs


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
''',
)

replace_once(
    "apps/solver/app/main.py",
    "from app.class_groups import assignment_class_ids, parallel_assignment_pairs\n",
    '''from app.class_groups import (
    assignment_class_ids,
    class_required_weekly_periods,
    parallel_assignment_pairs,
)
''',
)
replace_once(
    "apps/solver/app/main.py",
    '''    class_slot_keys = set(class_whole_slots) | set(class_group_1_slots) | set(class_group_2_slots)
    for key in class_slot_keys:
        whole = class_whole_slots.get(key, [])
        group_1 = class_group_1_slots.get(key, [])
        group_2 = class_group_2_slots.get(key, [])
        model.add(sum([*whole, *group_1]) <= 1)
        model.add(sum([*whole, *group_2]) <= 1)

    blocks_by_assignment: dict[str, list[Block]] = defaultdict(list)
''',
    '''    class_slot_keys = set(class_whole_slots) | set(class_group_1_slots) | set(class_group_2_slots)
    for key in class_slot_keys:
        whole = class_whole_slots.get(key, [])
        group_1 = class_group_1_slots.get(key, [])
        group_2 = class_group_2_slots.get(key, [])
        model.add(sum([*whole, *group_1]) <= 1)
        model.add(sum([*whole, *group_2]) <= 1)

    required_periods_by_class = class_required_weekly_periods(payload.assignments)
    if len(payload.periods_per_day) >= 5:
        for class_id, weekly_periods in required_periods_by_class.items():
            if weekly_periods < len(payload.periods_per_day):
                continue
            for day, periods in enumerate(payload.periods_per_day):
                if periods <= 0:
                    continue
                model.add(sum(class_all_slots.get((class_id, day, 0), [])) >= 1)

    blocks_by_assignment: dict[str, list[Block]] = defaultdict(list)
''',
)

replace_once(
    "apps/solver/app/validator.py",
    '''from app.class_groups import (
    lesson_class_ids,
    parallel_assignment_pairs,
)
''',
    '''from app.class_groups import (
    class_required_weekly_periods,
    lesson_class_ids,
    parallel_assignment_pairs,
)
''',
)
replace_once(
    "apps/solver/app/validator.py",
    '''    lessons_by_assignment: dict[str, list[ScheduledLesson]] = defaultdict(list)
''',
    '''    required_periods_by_class = class_required_weekly_periods(payload.assignments)
    if len(payload.periods_per_day) >= 5:
        for class_id, weekly_periods in required_periods_by_class.items():
            if weekly_periods < len(payload.periods_per_day):
                continue
            for day, periods in enumerate(payload.periods_per_day):
                if periods <= 0 or class_slots.get((class_id, day, 0)):
                    continue
                issues.append(
                    ValidationIssue(
                        code="CLASS_DOES_NOT_START_AT_EIGHT",
                        message=f"Třída {class_id} musí každý vyučovací den začínat první hodinou v 8:00.",
                        entity_ids=[class_id],
                        day=day,
                        period=0,
                        details={"requiredStartTime": "8:00"},
                    )
                )

    lessons_by_assignment: dict[str, list[ScheduledLesson]] = defaultdict(list)
''',
)

replace_once(
    "apps/web/lib/domain/validation.ts",
    'import { lessonClassIds, parallelAssignmentPairs } from "./class-groups";\n',
    '''import {
  classRequiredWeeklyPeriods,
  lessonClassIds,
  parallelAssignmentPairs,
} from "./class-groups";
''',
)
replace_once(
    "apps/web/lib/domain/validation.ts",
    '''  const lessonsByAssignment = new Map<string, ScheduledLesson[]>();
''',
    '''  const requiredPeriodsByClass = classRequiredWeeklyPeriods(
    snapshot.assignments,
  );
  if (snapshot.periods_per_day.length >= 5) {
    for (const [classId, weeklyPeriods] of requiredPeriodsByClass) {
      if (weeklyPeriods < snapshot.periods_per_day.length) continue;
      snapshot.periods_per_day.forEach((periods, day) => {
        if (periods <= 0 || classSlots.has(`${classId}:${day}:0`)) return;
        pushIssue(
          issues,
          "CLASS_DOES_NOT_START_AT_EIGHT",
          `Třída ${classId} musí každý vyučovací den začínat první hodinou v 8:00.`,
          [classId],
          day,
          0,
          { requiredStartTime: "8:00" },
        );
      });
    }
  }

  const lessonsByAssignment = new Map<string, ScheduledLesson[]>();
''',
)

replace_once(
    "apps/web/app/timetable/page.tsx",
    '''  MIN_LUNCH_BREAK_MINUTES,
  MORNING_PERIOD_LIMIT,
} from "@/lib/domain/school-day";
''',
    '''  MIN_LUNCH_BREAK_MINUTES,
  MORNING_PERIOD_LIMIT,
  schoolPeriodLabel,
} from "@/lib/domain/school-day";
''',
)
page = Path("apps/web/app/timetable/page.tsx")
page_source = page.read_text().replace(
    "grid-cols-[64px_repeat(5,minmax(170px,1fr))]",
    "grid-cols-[96px_repeat(5,minmax(170px,1fr))]",
)
if "grid-cols-[64px_repeat" in page_source:
    raise SystemExit("apps/web/app/timetable/page.tsx: old 64px timetable column remains")
page_source = page_source.replace("{period + 1}.", "{schoolPeriodLabel(period)}", 1)
page.write_text(page_source)

replace_once(
    "apps/web/lib/export/timetable-workbook.ts",
    '''  MIN_LUNCH_BREAK_MINUTES,
  MORNING_PERIOD_LIMIT,
} from "../domain/school-day";
''',
    '''  MIN_LUNCH_BREAK_MINUTES,
  MORNING_PERIOD_LIMIT,
  SCHOOL_DAY_START_TIME,
  schoolPeriodLabel,
} from "../domain/school-day";
''',
)
replace_once(
    "apps/web/lib/export/timetable-workbook.ts",
    '''    { width: 11 },
''',
    '''    { width: 17 },
''',
)
replace_once(
    "apps/web/lib/export/timetable-workbook.ts",
    '''  legend.value = `Skupiny uvedené v jedné buňce probíhají současně. Mezi 6. a 7. hodinou je obědová přestávka nejméně ${MIN_LUNCH_BREAK_MINUTES} minut.`;
''',
    '''  legend.value = `Vyučování začíná vždy v ${SCHOOL_DAY_START_TIME}. Skupiny uvedené v jedné buňce probíhají současně. Mezi 6. a 7. hodinou je obědová přestávka nejméně ${MIN_LUNCH_BREAK_MINUTES} minut.`;
''',
)
replace_once(
    "apps/web/lib/export/timetable-workbook.ts",
    '''    hourCell.value = `${period + 1}. hodina`;
''',
    '''    hourCell.value = schoolPeriodLabel(period);
''',
)

replace_once(
    "apps/web/lib/import/client-workbook.ts",
    '''      "Vyplňte jeden řádek. Nejvýše 6 hodin je dopolední výuka; 7. a další hodina je odpolední výuka po obědové přestávce nejméně 50 minut.",
''',
    '''      "Vyplňte jeden řádek. Vyučování začíná vždy v 8:00 a nultá hodina se nepoužívá. Nejvýše 6 hodin je dopolední výuka; 7. a další hodina je odpolední výuka po obědové přestávce nejméně 50 minut.",
''',
)

subject_rows = '''export const SCHOOL_SUBJECT_ROWS = [
  ["CJ", "Český jazyk a literatura", ""],
  ["M", "Matematika", ""],
  ["JAZ1", "Anglický jazyk", "JAZYKOVÁ UČEBNA"],
  ["JAZ2", "Další cizí jazyk", "JAZYKOVÁ UČEBNA"],
  ["INF", "Informatika", "POČÍTAČOVÁ UČEBNA"],
  ["TV", "Tělesná výchova", "TĚLOCVIČNA"],
  ["FY", "Fyzika", ""],
  ["DEJ", "Dějepis", ""],
  ["ZEM", "Geografie (zeměpis)", ""],
  ["PRI", "Přírodopis", ""],
  ["CH", "Chemie", ""],
  ["OV", "Výchova k občanství a osobnostní a sociální výchova", ""],
  ["VZ", "Výchova ke zdraví a bezpečí", ""],
  ["HV", "Hudební, taneční a dramatická výchova", ""],
  ["VV", "Výtvarná a filmová výchova", ""],
  ["PC", "Polytechnická výchova a praktické činnosti", ""],
] as const;
'''
replace_once(
    "apps/web/lib/import/client-workbook-prefill.ts",
    '''export const SCHOOL_SUBJECT_ROWS = [
  ["CJ", "Český jazyk", ""],
  ["M", "Matematika", ""],
  ["INF", "Informatika", "POČÍTAČOVÁ UČEBNA"],
  ["JAZ1", "Cizí jazyk 1", "JAZYKOVÁ UČEBNA"],
  ["JAZ2", "Cizí jazyk 2", "JAZYKOVÁ UČEBNA"],
  ["TV", "Tělesná výchova", "TĚLOCVIČNA"],
] as const;
''',
    subject_rows,
)

replace_once(
    "apps/web/e2e/full-curriculum.spec.ts",
    '''const SUBJECTS = [
  ["CJ", "Český jazyk", ""],
  ["M", "Matematika", ""],
  ["JAZ1", "Anglický jazyk", ""],
  ["JAZ2", "Další cizí jazyk", ""],
  ["INF", "Informatika", "POČÍTAČOVÁ UČEBNA"],
  ["TV", "Tělesná výchova", "TĚLOCVIČNA"],
  ["FY", "Fyzika", ""],
  ["DEJ", "Dějepis", ""],
  ["ZEM", "Zeměpis", ""],
  ["PRI", "Přírodopis", ""],
  ["CH", "Chemie", ""],
  ["OV", "Občanská výchova", ""],
  ["VZ", "Výchova ke zdraví a bezpečí", ""],
  ["HV", "Hudební výchova", ""],
  ["VV", "Výtvarná výchova", ""],
  ["PC", "Pracovní činnosti", ""],
] as const;
''',
    subject_rows.replace("export const SCHOOL_SUBJECT_ROWS", "const SUBJECTS"),
)
replace_once(
    "apps/web/e2e/full-curriculum.spec.ts",
    '''interface StoredSubject {
  id: string;
  code: string;
}
''',
    '''interface StoredSubject {
  id: string;
  code: string;
  name: string;
}
''',
)
replace_once(
    "apps/web/e2e/full-curriculum.spec.ts",
    '''  expect(imported.subjects).toHaveLength(16);
  expect(imported.assignments).toHaveLength(244);
''',
    '''  expect(imported.subjects).toHaveLength(16);
  expect(imported.assignments).toHaveLength(244);
  expect(
    new Map(imported.subjects.map((subject) => [subject.code, subject.name])),
  ).toEqual(new Map(SUBJECTS.map(([code, name]) => [code, name])));
''',
)
replace_once(
    "apps/web/e2e/full-curriculum.spec.ts",
    '''    expect(occupiedSlots.size).toBe(
      expectedClassWeeklyPeriods(schoolClass.code, schoolClass.grade),
    );
  }
''',
    '''    expect(occupiedSlots.size).toBe(
      expectedClassWeeklyPeriods(schoolClass.code, schoolClass.grade),
    );
    for (let day = 0; day < 5; day += 1) {
      expect(
        occupiedSlots.has(`${day}:0`),
        `${schoolClass.code} musí v den ${day + 1} začínat v 8:00`,
      ).toBe(true);
    }
  }
''',
)
replace_once(
    "apps/web/e2e/full-curriculum.spec.ts",
    '''  await expect(
    page.getByRole("heading", { name: "Kvalita návrhu" }),
  ).toBeVisible();
''',
    '''  await expect(
    page.getByRole("heading", { name: "Kvalita návrhu" }),
  ).toBeVisible();
  await expect(page.getByText("1. hodina · 8:00", { exact: true })).toBeVisible();
''',
)
replace_once(
    "apps/web/e2e/full-curriculum.spec.ts",
    '''    expect(occupiedExportCells(worksheet)).toBe(expectedWeeklyPeriods);
''',
    '''    expect(worksheet.getCell("A5").text).toBe("1. hodina · 8:00");
    expect(occupiedExportCells(worksheet)).toBe(expectedWeeklyPeriods);
''',
)

replace_once(
    "apps/web/tests/school-day.test.ts",
    '''  crossesLunchBreak,
  MIN_LUNCH_BREAK_MINUTES,
  MORNING_PERIOD_LIMIT,
} from "../lib/domain/school-day";
''',
    '''  crossesLunchBreak,
  MIN_LUNCH_BREAK_MINUTES,
  MORNING_PERIOD_LIMIT,
  SCHOOL_DAY_START_TIME,
  schoolPeriodLabel,
} from "../lib/domain/school-day";
''',
)
replace_once(
    "apps/web/tests/school-day.test.ts",
    '''test("Czech school day uses six morning periods and a fifty-minute lunch break", () => {
  assert.equal(MORNING_PERIOD_LIMIT, 6);
''',
    '''test("Czech school day starts at eight and uses six morning periods", () => {
  assert.equal(SCHOOL_DAY_START_TIME, "8:00");
  assert.equal(schoolPeriodLabel(0), "1. hodina · 8:00");
  assert.equal(schoolPeriodLabel(1), "2. hodina");
  assert.equal(MORNING_PERIOD_LIMIT, 6);
''',
)
append_ts_test = '''

test("regular five-day class must start at eight every day", () => {
  const fullWeekSnapshot: CanonicalSnapshot = {
    ...snapshot,
    periods_per_day: [2, 2, 2, 2, 2],
    assignments: [
      {
        ...snapshot.assignments[0]!,
        weekly_periods: 5,
        lesson_shape: "SINGLE",
      },
    ],
  };
  const fullWeekLessons: ScheduledLesson[] = Array.from(
    { length: 5 },
    (_, day) => ({
      ...lesson(0),
      block_id: `assignment-1:${day}`,
      day,
      duration: 1,
    }),
  );
  assert.deepEqual(validateSchedule(fullWeekSnapshot, fullWeekLessons), []);

  const lateStart = fullWeekLessons.map((item) => ({ ...item }));
  lateStart[2] = { ...lateStart[2]!, period: 1 };
  assert.ok(
    validateSchedule(fullWeekSnapshot, lateStart).some(
      (issue) => issue.code === "CLASS_DOES_NOT_START_AT_EIGHT",
    ),
  );
});
'''
path = Path("apps/web/tests/school-day.test.ts")
path.write_text(path.read_text().rstrip() + append_ts_test)

replace_once(
    "apps/web/tests/timetable-workbook.test.ts",
    '''  assert.equal(overview.getCell("E5").value, 40);
''',
    '''  assert.equal(overview.getCell("E5").value, 40);
  assert.equal(class6A.getCell("A5").text, "1. hodina · 8:00");
  assert.ok(class6A.getCell("A3").text.includes("začíná vždy v 8:00"));
''',
)

replace_once(
    "apps/web/tests/school-client-workbook.test.ts",
    '''  const assignments = workbook.getWorksheet("5. Kdo co učí");
''',
    '''  const subjects = workbook.getWorksheet("3. Předměty");
  assert.ok(subjects);
  const subjectRows = filledRows(subjects, 3);
  assert.equal(subjectRows.length, 16);
  assert.ok(
    subjectRows.some(
      ([code, name]) =>
        code === "VZ" && name === "Výchova ke zdraví a bezpečí",
    ),
  );
  assert.ok(
    subjectRows.some(
      ([code, name]) =>
        code === "OV" && name.includes("osobnostní a sociální výchova"),
    ),
  );
  assert.ok(
    subjectRows.some(
      ([code, name]) =>
        code === "PC" &&
        name === "Polytechnická výchova a praktické činnosti",
    ),
  );

  const assignments = workbook.getWorksheet("5. Kdo co učí");
''',
)

path = Path("apps/solver/tests/test_school_day_rules.py")
path.write_text(
    path.read_text().rstrip()
    + '''


def test_regular_class_starts_at_eight_every_weekday() -> None:
    response = client.post(
        "/solve",
        json={
            "periods_per_day": [2, 2, 2, 2, 2],
            "assignments": [
                {
                    "id": "daily-lesson",
                    "teacher_id": "teacher-1",
                    "class_id": "class-1",
                    "subject_id": "subject-1",
                    "weekly_periods": 5,
                    "lesson_shape": "SINGLE",
                    "max_per_day": 1,
                }
            ],
        },
    )

    assert response.status_code == 200, response.text
    lessons = response.json()["lessons"]
    assert sorted((lesson["day"], lesson["period"]) for lesson in lessons) == [
        (0, 0),
        (1, 0),
        (2, 0),
        (3, 0),
        (4, 0),
    ]
'''
)
