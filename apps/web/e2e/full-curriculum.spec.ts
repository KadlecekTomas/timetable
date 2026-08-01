import { copyFile } from "node:fs/promises";

import { expect, test, type Page } from "@playwright/test";
import ExcelJS, { type Worksheet } from "exceljs";

import type {
  CanonicalSnapshot,
  ScheduledLesson,
} from "../lib/domain/contracts";
import { validateSchedule } from "../lib/domain/validation";
import {
  CLIENT_TEMPLATE_FIRST_DATA_ROW,
  CLIENT_TEMPLATE_LAST_DATA_ROW,
} from "../lib/import/client-workbook";
import { createSchoolClientImportTemplate } from "../lib/import/school-client-workbook";

const CLASSES = [
  ["6A", 6, "6.A"],
  ["6B", 6, "6.B"],
  ["6C", 6, "6.C"],
  ["6D", 6, "6.D"],
  ["7A", 7, "7.A"],
  ["7B", 7, "7.B"],
  ["7C", 7, "7.C"],
  ["8A", 8, "8.A"],
  ["8B", 8, "8.B"],
  ["8C", 8, "8.C"],
  ["9A", 9, "9.A"],
  ["9B", 9, "9.B"],
  ["9C", 9, "9.C"],
] as const;

const SUBJECTS = [
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

const SPLIT_SUBJECTS = ["CJ", "M", "JAZ1", "JAZ2"] as const;
const GENERAL_SUBJECTS = [
  "FY",
  "DEJ",
  "ZEM",
  "PRI",
  "CH",
  "OV",
  "VZ",
  "HV",
  "VV",
  "PC",
] as const;
const DAY_LABELS = ["Pondělí", "Úterý", "Středa", "Čtvrtek", "Pátek"] as const;

type SplitSubjectCode = (typeof SPLIT_SUBJECTS)[number];
type GeneralSubjectCode = (typeof GENERAL_SUBJECTS)[number];

interface TeacherDefinition {
  code: string;
  firstName: string;
  lastName: string;
}

interface AssignmentDefinition {
  code: string;
  classCode: string;
  additionalClassCodes: string[];
  subjectCode: string;
  teacherCode: string;
  group: "Celá třída" | "Skupina 1" | "Skupina 2";
  weeklyPeriods: number;
  shape: "Jednotlivé hodiny" | "Dvojhodiny";
  requiredRoomType: string | null;
  maxPerDay: number;
}

interface StoredTeacher {
  id: string;
  code: string;
  targetWeeklyLoad: number;
  minWeeklyLoad: number | null;
  maxWeeklyLoad: number | null;
}

interface StoredClass {
  id: string;
  code: string;
  grade: number;
}

interface StoredSubject {
  id: string;
  code: string;
  name: string;
}

interface StoredAssignment {
  id: string;
  classId: string;
  additionalClassIds: string[];
  subjectId: string;
  teacherId: string;
  group: "WHOLE" | "GROUP_1" | "GROUP_2";
  weeklyPeriods: number;
}

interface StoredAvailability {
  id: string;
  entityType: "TEACHER" | "CLASS" | "ROOM";
  entityId: string;
  dayOfWeek: number;
  period: number;
  kind: "UNAVAILABLE" | "PREFERRED" | "DISCOURAGED";
}

interface StoredTimetableVersion {
  id: string;
  revision: number;
  snapshot: CanonicalSnapshot;
  lessons: ScheduledLesson[];
}

interface StoredProject {
  schoolName: string;
  teachers: StoredTeacher[];
  classes: StoredClass[];
  subjects: StoredSubject[];
  assignments: StoredAssignment[];
  availability: StoredAvailability[];
  timetableVersions: StoredTimetableVersion[];
}

function teacherPool(
  prefix: string,
  count: number,
  subjectName: string,
): TeacherDefinition[] {
  return Array.from({ length: count }, (_, index) => ({
    code: `${prefix}${index + 1}`,
    firstName: subjectName,
    lastName: `Učitel ${index + 1}`,
  }));
}

const TEACHERS: TeacherDefinition[] = [
  { code: "KAD", firstName: "Tomáš", lastName: "Kadleček" },
  { code: "VAS", firstName: "—", lastName: "Vašáková" },
  ...teacherPool("CJ", 6, "Čeština"),
  ...teacherPool("M", 6, "Matematika"),
  ...teacherPool("AJ", 5, "Angličtina"),
  ...teacherPool("NJ", 4, "Druhý jazyk"),
  ...teacherPool("TV", 5, "Tělesná výchova"),
  ...teacherPool("FY", 3, "Fyzika a chemie"),
  ...teacherPool("DE", 2, "Dějepis"),
  ...teacherPool("ZE", 2, "Zeměpis"),
  ...teacherPool("PR", 2, "Přírodopis"),
  ...teacherPool("OV", 1, "Občanská a zdravotní výchova"),
  ...teacherPool("HV", 1, "Hudební výchova"),
  ...teacherPool("VV", 1, "Výtvarná výchova"),
  ...teacherPool("PC", 1, "Pracovní činnosti"),
];

const TEACHER_POOLS: Record<string, readonly string[]> = {
  CJ: TEACHERS.filter((teacher) => teacher.code.startsWith("CJ")).map(
    (teacher) => teacher.code,
  ),
  M: TEACHERS.filter((teacher) => /^M\d+$/.test(teacher.code)).map(
    (teacher) => teacher.code,
  ),
  JAZ1: TEACHERS.filter((teacher) => teacher.code.startsWith("AJ")).map(
    (teacher) => teacher.code,
  ),
  JAZ2: TEACHERS.filter((teacher) => teacher.code.startsWith("NJ")).map(
    (teacher) => teacher.code,
  ),
  TV: TEACHERS.filter((teacher) => teacher.code.startsWith("TV")).map(
    (teacher) => teacher.code,
  ),
  FY: TEACHERS.filter((teacher) => teacher.code.startsWith("FY")).map(
    (teacher) => teacher.code,
  ),
  CH: TEACHERS.filter((teacher) => teacher.code.startsWith("FY")).map(
    (teacher) => teacher.code,
  ),
  DEJ: TEACHERS.filter((teacher) => teacher.code.startsWith("DE")).map(
    (teacher) => teacher.code,
  ),
  ZEM: TEACHERS.filter((teacher) => teacher.code.startsWith("ZE")).map(
    (teacher) => teacher.code,
  ),
  PRI: TEACHERS.filter((teacher) => teacher.code.startsWith("PR")).map(
    (teacher) => teacher.code,
  ),
  OV: ["OV1"],
  VZ: ["OV1"],
  HV: ["HV1"],
  VV: ["VV1"],
  PC: ["PC1"],
};

function splitWeeklyPeriods(
  classCode: string,
  grade: number,
  subjectCode: SplitSubjectCode,
): number {
  if (subjectCode === "CJ") {
    if (grade === 6) return 5;
    if (grade === 7) return 4;
    return classCode.endsWith("B") ? 4 : 3;
  }
  if (subjectCode === "M") return grade === 6 ? 5 : 4;
  if (subjectCode === "JAZ1") return 3;
  return grade === 6 ? 0 : 2;
}

function wholeClassWeeklyPeriods(
  grade: number,
  subjectCode: GeneralSubjectCode,
): number {
  if (["FY", "DEJ", "ZEM", "PRI"].includes(subjectCode)) return 2;
  if (subjectCode === "CH") return grade >= 8 ? 2 : 0;
  if (subjectCode === "VV") return grade <= 7 ? 2 : 1;
  return 1;
}

function expectedClassWeeklyPeriods(classCode: string, grade: number): number {
  if (grade <= 7) return 30;
  if (grade === 8) return classCode.endsWith("B") ? 31 : 30;
  return classCode.endsWith("B") ? 31 : 32;
}

function buildAssignments(): AssignmentDefinition[] {
  const assignments: AssignmentDefinition[] = [];
  CLASSES.forEach(([classCode, grade], classIndex) => {
    SPLIT_SUBJECTS.forEach((subjectCode) => {
      const weeklyPeriods = splitWeeklyPeriods(classCode, grade, subjectCode);
      if (!weeklyPeriods) return;
      const pool = TEACHER_POOLS[subjectCode]!;
      for (const groupNumber of [1, 2] as const) {
        assignments.push({
          code: `${classCode}-${subjectCode}-S${groupNumber}`,
          classCode,
          additionalClassCodes: [],
          subjectCode,
          teacherCode: pool[(classIndex * 2 + groupNumber - 1) % pool.length]!,
          group: `Skupina ${groupNumber}`,
          weeklyPeriods,
          shape: "Jednotlivé hodiny",
          requiredRoomType: null,
          maxPerDay: 1,
        });
      }
    });

    if (classCode === "8B") {
      assignments.push({
        code: "8B-INF",
        classCode,
        additionalClassCodes: [],
        subjectCode: "INF",
        teacherCode: "KAD",
        group: "Celá třída",
        weeklyPeriods: 1,
        shape: "Jednotlivé hodiny",
        requiredRoomType: "POČÍTAČOVÁ UČEBNA",
        maxPerDay: 1,
      });
    } else {
      assignments.push(
        {
          code: `${classCode}-INF-S1`,
          classCode,
          additionalClassCodes: [],
          subjectCode: "INF",
          teacherCode: "KAD",
          group: "Skupina 1",
          weeklyPeriods: 1,
          shape: "Jednotlivé hodiny",
          requiredRoomType: "POČÍTAČOVÁ UČEBNA",
          maxPerDay: 1,
        },
        {
          code: `${classCode}-INF-S2`,
          classCode,
          additionalClassCodes: [],
          subjectCode: "INF",
          teacherCode: "VAS",
          group: "Skupina 2",
          weeklyPeriods: 1,
          shape: "Jednotlivé hodiny",
          requiredRoomType: "POČÍTAČOVÁ UČEBNA",
          maxPerDay: 1,
        },
      );
    }

    if (classCode !== "9C") {
      const sharedKadPe = classCode === "9A";
      assignments.push({
        code: sharedKadPe ? "9A-9C-TV-KAD" : `${classCode}-TV`,
        classCode,
        additionalClassCodes: sharedKadPe ? ["9C"] : [],
        subjectCode: "TV",
        teacherCode: sharedKadPe
          ? "KAD"
          : TEACHER_POOLS.TV![classIndex % TEACHER_POOLS.TV!.length]!,
        group: "Celá třída",
        weeklyPeriods: sharedKadPe ? 4 : 2,
        shape: sharedKadPe ? "Dvojhodiny" : "Jednotlivé hodiny",
        requiredRoomType: "TĚLOCVIČNA",
        maxPerDay: 2,
      });
    }

    GENERAL_SUBJECTS.forEach((subjectCode) => {
      const weeklyPeriods = wholeClassWeeklyPeriods(grade, subjectCode);
      if (!weeklyPeriods) return;
      const pool = TEACHER_POOLS[subjectCode]!;
      assignments.push({
        code: `${classCode}-${subjectCode}`,
        classCode,
        additionalClassCodes: [],
        subjectCode,
        teacherCode: pool[classIndex % pool.length]!,
        group: "Celá třída",
        weeklyPeriods,
        shape: "Jednotlivé hodiny",
        requiredRoomType: null,
        maxPerDay: 1,
      });
    });
  });
  return assignments;
}

function buildTeacherRows(assignments: AssignmentDefinition[]) {
  const classOrder = new Map<string, number>(
    CLASSES.map(([classCode], index) => [classCode, index]),
  );
  const stats = new Map(
    TEACHERS.map((teacher) => [
      teacher.code,
      { load: 0, subjects: new Set<string>(), classes: new Set<string>() },
    ]),
  );
  assignments.forEach((assignment) => {
    const teacher = stats.get(assignment.teacherCode)!;
    teacher.load += assignment.weeklyPeriods;
    teacher.subjects.add(assignment.subjectCode);
    teacher.classes.add(assignment.classCode);
    assignment.additionalClassCodes.forEach((classCode) =>
      teacher.classes.add(classCode),
    );
  });
  return TEACHERS.map((teacher) => {
    const teacherStats = stats.get(teacher.code)!;
    return [
      teacher.code,
      teacher.firstName,
      teacher.lastName,
      teacherStats.load,
      teacherStats.load,
      teacherStats.load,
      [...teacherStats.subjects].sort().join(","),
      [...teacherStats.classes]
        .sort(
          (left, right) =>
            (classOrder.get(left) ?? 0) - (classOrder.get(right) ?? 0),
        )
        .join(","),
    ] as const;
  });
}

function buildAvailabilityRows() {
  const rows: Array<Array<string | number | null>> = [
    ["Učitel", "KAD", "Pondělí", 7, "Nemůže", null, "Výuka mimo školu"],
    ["Učitel", "KAD", "Pondělí", 8, "Nemůže", null, "Výuka mimo školu"],
    ["Učitel", "KAD", "Pátek", 1, "Nemůže", null, "Ranní povinnost"],
    ["Učitel", "KAD", "Pátek", 2, "Nemůže", null, "Ranní povinnost"],
  ];

  for (const [day, periods] of [
    ["Pondělí", 8],
    ["Čtvrtek", 8],
    ["Pátek", 7],
  ] as const) {
    for (let period = 1; period <= periods; period += 1) {
      rows.push([
        "Učitel",
        "VAS",
        day,
        period,
        "Nemůže",
        null,
        "Vašáková učí pouze v úterý a ve středu",
      ]);
    }
  }

  TEACHERS.filter(
    (teacher) => teacher.code !== "KAD" && teacher.code !== "VAS",
  ).forEach((teacher, index) => {
    rows.push([
      "Učitel",
      teacher.code,
      DAY_LABELS[index % DAY_LABELS.length],
      ((index * 2) % 7) + 1,
      "Nemůže",
      null,
      "Individuální nedostupnost",
    ]);
    rows.push([
      "Učitel",
      teacher.code,
      DAY_LABELS[(index + 2) % DAY_LABELS.length],
      ((index + 1) % 6) + 1,
      "Preferuje",
      5,
      "Preferovaný dopolední slot",
    ]);
  });
  return rows;
}

function clearRows(worksheet: Worksheet, columnCount: number) {
  for (
    let row = CLIENT_TEMPLATE_FIRST_DATA_ROW;
    row <= CLIENT_TEMPLATE_LAST_DATA_ROW;
    row += 1
  ) {
    for (let column = 1; column <= columnCount; column += 1) {
      worksheet.getCell(row, column).value = null;
    }
  }
}

function writeRows(
  worksheet: Worksheet,
  rows: ReadonlyArray<ReadonlyArray<string | number | null>>,
) {
  rows.forEach((values, rowIndex) => {
    values.forEach((value, columnIndex) => {
      worksheet.getCell(
        CLIENT_TEMPLATE_FIRST_DATA_ROW + rowIndex,
        columnIndex + 1,
      ).value = value;
    });
  });
}

async function createFullCurriculumWorkbook() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load((await createSchoolClientImportTemplate()) as never);
  const sheets = {
    settings: workbook.getWorksheet("Nastavení")!,
    teachers: workbook.getWorksheet("1. Učitelé")!,
    classes: workbook.getWorksheet("2. Třídy")!,
    subjects: workbook.getWorksheet("3. Předměty")!,
    rooms: workbook.getWorksheet("4. Učebny")!,
    assignments: workbook.getWorksheet("5. Kdo co učí")!,
    availability: workbook.getWorksheet("6. Dostupnost")!,
    fixed: workbook.getWorksheet("7. Pevné hodiny")!,
  };
  clearRows(sheets.settings, 6);
  clearRows(sheets.teachers, 8);
  clearRows(sheets.classes, 3);
  clearRows(sheets.subjects, 3);
  clearRows(sheets.rooms, 4);
  clearRows(sheets.assignments, 13);
  clearRows(sheets.availability, 7);
  clearRows(sheets.fixed, 7);

  const assignments = buildAssignments();
  writeRows(sheets.settings, [["2026/2027", 8, 8, 8, 8, 7]]);
  writeRows(sheets.teachers, buildTeacherRows(assignments));
  writeRows(sheets.classes, CLASSES);
  writeRows(sheets.subjects, SUBJECTS);
  writeRows(sheets.rooms, [
    ["PC1", "Počítačová učebna 1", "POČÍTAČOVÁ UČEBNA", 30],
    ["PC2", "Počítačová učebna 2", "POČÍTAČOVÁ UČEBNA", 30],
    ["PC3", "Počítačová učebna 3", "POČÍTAČOVÁ UČEBNA", 30],
    ["TV1", "Tělocvična 1", "TĚLOCVIČNA", 30],
    ["TV2", "Tělocvična 2", "TĚLOCVIČNA", 30],
    ["TV3", "Tělocvična 3", "TĚLOCVIČNA", 30],
  ]);
  writeRows(
    sheets.assignments,
    assignments.map((assignment) => [
      assignment.code,
      assignment.classCode,
      assignment.additionalClassCodes.join(","),
      assignment.subjectCode,
      assignment.teacherCode,
      assignment.group,
      assignment.weeklyPeriods,
      assignment.shape,
      0,
      null,
      assignment.requiredRoomType,
      assignment.maxPerDay,
      0,
    ]),
  );
  writeRows(sheets.availability, buildAvailabilityRows());
  return {
    buffer: Buffer.from(await workbook.xlsx.writeBuffer()),
    assignments,
  };
}

async function readProject(page: Page): Promise<StoredProject> {
  return page.evaluate(
    () =>
      new Promise<StoredProject>((resolve, reject) => {
        const openRequest = indexedDB.open("rozvrhar-local", 1);
        openRequest.onerror = () => reject(openRequest.error);
        openRequest.onsuccess = () => {
          const database = openRequest.result;
          const transaction = database.transaction("state", "readonly");
          const request = transaction
            .objectStore("state")
            .get("active-project");
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(request.result as StoredProject);
          transaction.oncomplete = () => database.close();
        };
      }),
  );
}

function currentVersion(project: StoredProject): StoredTimetableVersion {
  const version = project.timetableVersions.at(-1);
  if (!version) throw new Error("Chybí vytvořená verze rozvrhu.");
  return version;
}

function assignmentsForClass(
  project: StoredProject,
  schoolClass: StoredClass,
): StoredAssignment[] {
  return project.assignments.filter(
    (assignment) =>
      assignment.classId === schoolClass.id ||
      assignment.additionalClassIds.includes(schoolClass.id),
  );
}

function occupiedPeriodsFromAssignments(
  assignments: StoredAssignment[],
): number {
  const bySubject = new Map<string, StoredAssignment[]>();
  assignments.forEach((assignment) => {
    bySubject.set(assignment.subjectId, [
      ...(bySubject.get(assignment.subjectId) ?? []),
      assignment,
    ]);
  });
  return [...bySubject.values()].reduce((total, subjectAssignments) => {
    const whole = subjectAssignments
      .filter((assignment) => assignment.group === "WHOLE")
      .reduce((sum, assignment) => sum + assignment.weeklyPeriods, 0);
    return (
      total +
      (whole ||
        Math.max(
          ...subjectAssignments.map((assignment) => assignment.weeklyPeriods),
        ))
    );
  }, 0);
}

function assertUnavailableSlots(
  project: StoredProject,
  lessons: ScheduledLesson[],
) {
  project.availability
    .filter((rule) => rule.kind === "UNAVAILABLE")
    .forEach((rule) => {
      const collisions = lessons.filter((lesson) => {
        const matches =
          (rule.entityType === "TEACHER" &&
            lesson.teacher_id === rule.entityId) ||
          (rule.entityType === "CLASS" &&
            [lesson.class_id, ...(lesson.additional_class_ids ?? [])].includes(
              rule.entityId,
            )) ||
          (rule.entityType === "ROOM" && lesson.room_id === rule.entityId);
        return (
          matches &&
          lesson.day === rule.dayOfWeek &&
          rule.period >= lesson.period &&
          rule.period < lesson.period + lesson.duration
        );
      });
      expect(collisions, `Zakázaný slot ${rule.id}`).toEqual([]);
    });
}

function occupiedExportCells(worksheet: Worksheet): number {
  let occupied = 0;
  for (let row = 5; row <= 13; row += 1) {
    if (row === 11) continue;
    for (let column = 2; column <= 6; column += 1) {
      const text = worksheet.getCell(row, column).text.trim();
      if (text && text !== "—") occupied += 1;
    }
  }
  return occupied;
}

test("vedení školy vytvoří plný rozvrh s Vašákovou pouze v úterý a ve středu", async ({
  page,
}) => {
  test.setTimeout(600_000);
  const pageErrors: string[] = [];
  const serverErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 500) {
      serverErrors.push(`${response.status()} ${response.url()}`);
    }
  });

  await page.goto("/");
  await page.getByRole("link", { name: "Nastavení" }).click();
  await page.getByLabel("Název školy").fill("ZŠ Plný druhý stupeň");
  await page.getByRole("button", { name: "Uložit nastavení" }).click();

  const workbook = await createFullCurriculumWorkbook();
  expect(TEACHERS).toHaveLength(41);
  expect(workbook.assignments).toHaveLength(256);
  await page.getByRole("link", { name: "Načtení dat" }).click();
  await page.locator("#import-file").setInputFiles({
    name: "plny-druhy-stupen.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: workbook.buffer,
  });
  await page.getByRole("button", { name: "Analyzovat soubor" }).click();
  await expect(
    page.getByRole("heading", { name: "Náhled je připraven k uložení" }),
  ).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Bezpečně uložit změny" }).click();
  await expect(
    page.getByRole("heading", { name: "Data byla bezpečně uložena" }),
  ).toBeVisible();
  await expect
    .poll(async () => (await readProject(page)).teachers.length)
    .toBe(41);

  const imported = await readProject(page);
  expect(imported.teachers).toHaveLength(41);
  expect(imported.classes).toHaveLength(13);
  expect(imported.subjects).toHaveLength(16);
  expect(imported.assignments).toHaveLength(256);
  expect(
    new Map(imported.subjects.map((subject) => [subject.code, subject.name])),
  ).toEqual(new Map(SUBJECTS.map(([code, name]) => [code, name])));

  const subjectById = new Map(
    imported.subjects.map((subject) => [subject.id, subject.code]),
  );
  const teacherByCode = new Map(
    imported.teachers.map((teacher) => [teacher.code, teacher]),
  );
  const teacherCodeById = new Map(
    imported.teachers.map((teacher) => [teacher.id, teacher.code]),
  );
  const kad = teacherByCode.get("KAD")!;
  const vas = teacherByCode.get("VAS")!;

  expect(kad.targetWeeklyLoad).toBe(17);
  expect(kad.minWeeklyLoad).toBe(17);
  expect(kad.maxWeeklyLoad).toBe(17);
  expect(vas.targetWeeklyLoad).toBe(12);
  expect(vas.minWeeklyLoad).toBe(12);
  expect(vas.maxWeeklyLoad).toBe(12);

  const vasAssignments = imported.assignments.filter(
    (assignment) => assignment.teacherId === vas.id,
  );
  expect(vasAssignments).toHaveLength(12);
  expect(
    new Set(
      vasAssignments.map((assignment) => subjectById.get(assignment.subjectId)),
    ),
  ).toEqual(new Set(["INF"]));
  expect(
    vasAssignments.every((assignment) => assignment.group === "GROUP_2"),
  ).toBe(true);

  const vasUnavailable = imported.availability.filter(
    (rule) => rule.entityId === vas.id && rule.kind === "UNAVAILABLE",
  );
  expect(vasUnavailable).toHaveLength(23);
  expect(new Set(vasUnavailable.map((rule) => rule.dayOfWeek))).toEqual(
    new Set([0, 3, 4]),
  );

  for (const schoolClass of imported.classes) {
    const assignments = assignmentsForClass(imported, schoolClass);
    expect(occupiedPeriodsFromAssignments(assignments)).toBe(
      expectedClassWeeklyPeriods(schoolClass.code, schoolClass.grade),
    );
    const subjectCodes = new Set(
      assignments.map((assignment) => subjectById.get(assignment.subjectId)),
    );
    const expectedSubjects = SUBJECTS.map(([code]) => code).filter(
      (code) =>
        (code !== "CH" || schoolClass.grade >= 8) &&
        (code !== "JAZ2" || schoolClass.grade >= 7),
    );
    expect([...subjectCodes].sort()).toEqual([...expectedSubjects].sort());

    for (const splitSubject of SPLIT_SUBJECTS) {
      if (splitSubject === "JAZ2" && schoolClass.grade < 7) continue;
      const splitAssignments = assignments.filter(
        (assignment) => subjectById.get(assignment.subjectId) === splitSubject,
      );
      expect(
        splitAssignments.map((assignment) => assignment.group).sort(),
      ).toEqual(["GROUP_1", "GROUP_2"]);
    }

    const informatics = assignments.filter(
      (assignment) => subjectById.get(assignment.subjectId) === "INF",
    );
    if (schoolClass.code === "8B") {
      expect(informatics).toHaveLength(1);
      expect(informatics[0]!.group).toBe("WHOLE");
      expect(teacherCodeById.get(informatics[0]!.teacherId)).toBe("KAD");
    } else {
      expect(
        informatics
          .map((assignment) => [
            assignment.group,
            teacherCodeById.get(assignment.teacherId),
          ])
          .sort(),
      ).toEqual([
        ["GROUP_1", "KAD"],
        ["GROUP_2", "VAS"],
      ]);
    }
  }

  await page.getByRole("link", { name: "Přehled" }).click();
  await expect(page.getByText("Rozvrh lze vytvořit")).toBeVisible();
  await page.getByRole("link", { name: "Tvorba rozvrhu" }).click();
  await page.getByRole("button", { name: "Vytvořit nový návrh" }).click();
  await expect(
    page.getByText(/^(Proveditelný návrh|Optimální návrh)$/),
  ).toBeVisible({ timeout: 330_000 });
  await page.getByRole("link", { name: "Otevřít návrh" }).click();
  await expect(
    page.getByRole("heading", { name: "Kvalita návrhu" }),
  ).toBeVisible();
  await expect(
    page.getByText("1. hodina · 8:00", { exact: true }),
  ).toBeVisible();

  const generated = await readProject(page);
  const version = currentVersion(generated);
  expect(validateSchedule(version.snapshot, version.lessons)).toEqual([]);
  assertUnavailableSlots(generated, version.lessons);

  for (const schoolClass of generated.classes) {
    const occupiedSlots = new Set<string>();
    version.lessons
      .filter((lesson) =>
        [lesson.class_id, ...(lesson.additional_class_ids ?? [])].includes(
          schoolClass.id,
        ),
      )
      .forEach((lesson) => {
        for (let offset = 0; offset < lesson.duration; offset += 1) {
          occupiedSlots.add(`${lesson.day}:${lesson.period + offset}`);
        }
      });
    expect(occupiedSlots.size).toBe(
      expectedClassWeeklyPeriods(schoolClass.code, schoolClass.grade),
    );
    for (let day = 0; day < 5; day += 1) {
      expect(
        occupiedSlots.has(`${day}:0`),
        `${schoolClass.code} musí v den ${day + 1} začínat v 8:00`,
      ).toBe(true);
    }
  }

  const kadLessons = version.lessons.filter(
    (lesson) => lesson.teacher_id === kad.id,
  );
  expect(kadLessons.reduce((sum, lesson) => sum + lesson.duration, 0)).toBe(17);

  const vasLessons = version.lessons.filter(
    (lesson) => lesson.teacher_id === vas.id,
  );
  expect(vasLessons.reduce((sum, lesson) => sum + lesson.duration, 0)).toBe(12);
  expect(new Set(vasLessons.map((lesson) => lesson.day))).toEqual(
    new Set([1, 2]),
  );
  expect(
    new Set(vasLessons.map((lesson) => subjectById.get(lesson.subject_id))),
  ).toEqual(new Set(["INF"]));

  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Exportovat rozvrh do Excelu" })
    .click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const artifactPath = "/tmp/rozvrh-vedeni-plny-druhy-stupen.xlsx";
  await copyFile(downloadPath!, artifactPath);
  const exported = new ExcelJS.Workbook();
  await exported.xlsx.readFile(artifactPath);
  expect(exported.worksheets).toHaveLength(55);
  const overview = exported.getWorksheet("Přehled")!;
  expect(overview).toBeDefined();
  expect(overview.getCell("E5").value).toBe(41);
  expect(overview.getCell("E7").value).toBe(569);

  for (const [classCode, grade] of CLASSES) {
    const worksheet = exported.getWorksheet(`Třída ${classCode}`)!;
    expect(worksheet).toBeDefined();
    const expectedWeeklyPeriods = expectedClassWeeklyPeriods(classCode, grade);
    expect(worksheet.getCell("A5").text).toBe("1. hodina · 8:00");
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

  const kadSheet = exported.getWorksheet("Učitel KAD")!;
  expect(kadSheet.getCell("A1").text).toContain("Tomáš Kadleček");
  expect(occupiedExportCells(kadSheet)).toBe(17);
  const vasSheet = exported.getWorksheet("Učitel VAS")!;
  expect(vasSheet.getCell("A1").text).toContain("Vašáková");
  expect(occupiedExportCells(vasSheet)).toBe(12);

  expect(pageErrors).toEqual([]);
  expect(serverErrors).toEqual([]);
});
