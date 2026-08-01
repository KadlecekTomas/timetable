import { readFile } from "node:fs/promises";

import { expect, test, type Page } from "@playwright/test";
import ExcelJS, { type Worksheet } from "exceljs";

import type {
  CanonicalSnapshot,
  ScheduledLesson,
  TimetableMove,
} from "../lib/domain/contracts";
import { validateMove, validateSchedule } from "../lib/domain/validation";
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
  ["CJ", "Český jazyk", ""],
  ["M", "Matematika", ""],
  ["JAZ1", "Cizí jazyk 1", ""],
  ["JAZ2", "Cizí jazyk 2", ""],
  ["INF", "Informatika", "POČÍTAČOVÁ UČEBNA"],
  ["TV", "Tělesná výchova", "TĚLOCVIČNA"],
  ["FY", "Fyzika", ""],
  ["DEJ", "Dějepis", ""],
  ["ZEM", "Zeměpis", ""],
  ["PRI", "Přírodopis", ""],
  ["CH", "Chemie", ""],
  ["OV", "Občanská výchova", ""],
  ["HV", "Hudební výchova", ""],
  ["VV", "Výtvarná výchova", ""],
  ["PC", "Pracovní činnosti", ""],
] as const;

const SPLIT_SUBJECTS = ["CJ", "M", "JAZ1", "JAZ2"] as const;
const DAY_LABELS = ["Pondělí", "Úterý", "Středa", "Čtvrtek", "Pátek"] as const;

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
  doublePeriodsCount: number;
  requiredRoom: string | null;
  requiredRoomType: string | null;
  maxPerDay: number;
  minDayGap: number;
}

interface StoredTeacher {
  id: string;
  code: string;
  firstName: string;
  lastName: string;
  targetWeeklyLoad: number;
  minWeeklyLoad: number | null;
  maxWeeklyLoad: number | null;
}

interface StoredClass {
  id: string;
  code: string;
  grade: number;
  name: string;
}

interface StoredSubject {
  id: string;
  code: string;
  name: string;
}

interface StoredRoom {
  id: string;
  code: string;
  name: string;
}

interface StoredAssignment {
  id: string;
  assignmentCode: string;
  classId: string;
  additionalClassIds: string[];
  subjectId: string;
  teacherId: string;
  group: "WHOLE" | "GROUP_1" | "GROUP_2";
  weeklyPeriods: number;
  lessonShape: "SINGLE" | "DOUBLE" | "MIXED";
  doublePeriodsCount: number;
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
  rooms: StoredRoom[];
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
  ...teacherPool("CJ", 6, "Čeština"),
  ...teacherPool("M", 6, "Matematika"),
  ...teacherPool("AJ", 5, "První jazyk"),
  ...teacherPool("NJ", 4, "Druhý jazyk"),
  ...teacherPool("TV", 5, "Tělesná výchova"),
  ...teacherPool("FY", 3, "Fyzika"),
  ...teacherPool("DE", 2, "Dějepis"),
  ...teacherPool("ZE", 2, "Zeměpis"),
  ...teacherPool("PR", 2, "Přírodopis"),
  ...teacherPool("OV", 1, "Občanská výchova"),
  ...teacherPool("HV", 1, "Hudební výchova"),
  ...teacherPool("VV", 1, "Výtvarná výchova"),
  ...teacherPool("PC", 1, "Pracovní činnosti"),
];

const TEACHER_POOLS = {
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
  DEJ: TEACHERS.filter((teacher) => teacher.code.startsWith("DE")).map(
    (teacher) => teacher.code,
  ),
  ZEM: TEACHERS.filter((teacher) => teacher.code.startsWith("ZE")).map(
    (teacher) => teacher.code,
  ),
  PRI: TEACHERS.filter((teacher) => teacher.code.startsWith("PR")).map(
    (teacher) => teacher.code,
  ),
  CH: TEACHERS.filter((teacher) => teacher.code.startsWith("FY")).map(
    (teacher) => teacher.code,
  ),
  OV: ["OV1"],
  HV: ["HV1"],
  VV: ["VV1"],
  PC: ["PC1"],
} as const;

const SPLIT_WEEKLY_PERIODS = {
  CJ: 3,
  M: 3,
  JAZ1: 2,
  JAZ2: 1,
} as const;

const GENERAL_SUBJECTS = [
  "FY",
  "DEJ",
  "ZEM",
  "PRI",
  "CH",
  "OV",
  "HV",
  "VV",
  "PC",
] as const;

function clearDataRows(worksheet: Worksheet, columnCount: number) {
  for (
    let rowNumber = CLIENT_TEMPLATE_FIRST_DATA_ROW;
    rowNumber <= CLIENT_TEMPLATE_LAST_DATA_ROW;
    rowNumber += 1
  ) {
    for (let column = 1; column <= columnCount; column += 1) {
      worksheet.getCell(rowNumber, column).value = null;
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

function buildAssignments(): AssignmentDefinition[] {
  const assignments: AssignmentDefinition[] = [];

  CLASSES.forEach(([classCode, grade], classIndex) => {
    SPLIT_SUBJECTS.forEach((subjectCode) => {
      const pool = TEACHER_POOLS[subjectCode];
      for (const groupNumber of [1, 2] as const) {
        assignments.push({
          code: `${classCode}-${subjectCode}-S${groupNumber}`,
          classCode,
          additionalClassCodes: [],
          subjectCode,
          teacherCode: pool[(classIndex * 2 + groupNumber - 1) % pool.length]!,
          group: `Skupina ${groupNumber}`,
          weeklyPeriods: SPLIT_WEEKLY_PERIODS[subjectCode],
          shape: "Jednotlivé hodiny",
          doublePeriodsCount: 0,
          requiredRoom: null,
          requiredRoomType: null,
          maxPerDay: 1,
          minDayGap: 0,
        });
      }
    });

    assignments.push({
      code: `${classCode}-INF`,
      classCode,
      additionalClassCodes: [],
      subjectCode: "INF",
      teacherCode: "KAD",
      group: "Celá třída",
      weeklyPeriods: 1,
      shape: "Jednotlivé hodiny",
      doublePeriodsCount: 0,
      requiredRoom: null,
      requiredRoomType: "POČÍTAČOVÁ UČEBNA",
      maxPerDay: 1,
      minDayGap: 0,
    });

    if (classCode !== "9C") {
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
    }

    GENERAL_SUBJECTS.forEach((subjectCode) => {
      if (subjectCode === "CH" && grade < 8) return;
      const pool = TEACHER_POOLS[subjectCode];
      assignments.push({
        code: `${classCode}-${subjectCode}`,
        classCode,
        additionalClassCodes: [],
        subjectCode,
        teacherCode: pool[classIndex % pool.length]!,
        group: "Celá třída",
        weeklyPeriods: 1,
        shape: "Jednotlivé hodiny",
        doublePeriodsCount: 0,
        requiredRoom: null,
        requiredRoomType: null,
        maxPerDay: 1,
        minDayGap: 0,
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
    const teacher = stats.get(assignment.teacherCode);
    if (!teacher)
      throw new Error(`Neznámý testovací učitel ${assignment.teacherCode}.`);
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
    ["Učitel", "KAD", "Úterý", 3, "Preferuje", 15, "Preferovaný blok"],
    ["Učitel", "KAD", "Čtvrtek", 4, "Preferuje", 10, "Preferovaný blok"],
  ];

  TEACHERS.filter((teacher) => teacher.code !== "KAD").forEach(
    (teacher, index) => {
      rows.push([
        "Učitel",
        teacher.code,
        DAY_LABELS[index % DAY_LABELS.length],
        ((index * 2) % 8) + 1,
        "Nemůže",
        null,
        "Individuální nedostupnost",
      ]);
      rows.push([
        "Učitel",
        teacher.code,
        DAY_LABELS[(index + 2) % DAY_LABELS.length],
        ((index * 3 + 3) % 8) + 1,
        "Nemůže",
        null,
        "Individuální nedostupnost",
      ]);
      rows.push([
        "Učitel",
        teacher.code,
        DAY_LABELS[(index + 1) % DAY_LABELS.length],
        ((index + 1) % 6) + 1,
        "Preferuje",
        5,
        "Preferovaný dopolední slot",
      ]);
    },
  );

  return rows;
}

async function createRealisticSchoolWorkbook(): Promise<{
  buffer: Buffer;
  assignments: AssignmentDefinition[];
}> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load((await createSchoolClientImportTemplate()) as never);

  const settings = workbook.getWorksheet("Nastavení")!;
  const teachers = workbook.getWorksheet("1. Učitelé")!;
  const classes = workbook.getWorksheet("2. Třídy")!;
  const subjects = workbook.getWorksheet("3. Předměty")!;
  const rooms = workbook.getWorksheet("4. Učebny")!;
  const assignmentsSheet = workbook.getWorksheet("5. Kdo co učí")!;
  const availability = workbook.getWorksheet("6. Dostupnost")!;
  const fixedLessons = workbook.getWorksheet("7. Pevné hodiny")!;

  clearDataRows(settings, 6);
  clearDataRows(teachers, 8);
  clearDataRows(classes, 3);
  clearDataRows(subjects, 3);
  clearDataRows(rooms, 4);
  clearDataRows(assignmentsSheet, 13);
  clearDataRows(availability, 7);
  clearDataRows(fixedLessons, 7);

  const assignments = buildAssignments();
  const teacherRows = buildTeacherRows(assignments);
  const kadRow = teacherRows.find((row) => row[0] === "KAD");
  expect(TEACHERS).toHaveLength(40);
  expect(assignments).toHaveLength(239);
  expect(kadRow?.[3]).toBe(17);

  writeRows(settings, [["2026/2027", 8, 8, 8, 8, 7]]);
  writeRows(teachers, teacherRows);
  writeRows(classes, CLASSES);
  writeRows(subjects, SUBJECTS);
  writeRows(rooms, [
    ["PC1", "Počítačová učebna 1", "POČÍTAČOVÁ UČEBNA", 30],
    ["PC2", "Počítačová učebna 2", "POČÍTAČOVÁ UČEBNA", 30],
    ["PC3", "Počítačová učebna 3", "POČÍTAČOVÁ UČEBNA", 30],
    ["TV1", "Tělocvična 1", "TĚLOCVIČNA", 30],
    ["TV2", "Tělocvična 2", "TĚLOCVIČNA", 30],
    ["TV3", "Tělocvična 3", "TĚLOCVIČNA", 30],
  ]);
  writeRows(
    assignmentsSheet,
    assignments.map((assignment) => [
      assignment.code,
      assignment.classCode,
      assignment.additionalClassCodes.join(","),
      assignment.subjectCode,
      assignment.teacherCode,
      assignment.group,
      assignment.weeklyPeriods,
      assignment.shape,
      assignment.doublePeriodsCount,
      assignment.requiredRoom,
      assignment.requiredRoomType,
      assignment.maxPerDay,
      assignment.minDayGap,
    ]),
  );
  writeRows(availability, buildAvailabilityRows());

  return {
    buffer: Buffer.from(await workbook.xlsx.writeBuffer()),
    assignments,
  };
}

async function readStoredProject(page: Page): Promise<StoredProject> {
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
  const version =
    project.timetableVersions[project.timetableVersions.length - 1];
  if (!version) throw new Error("Testovací projekt neobsahuje návrh rozvrhu.");
  return version;
}

function findValidMove(
  version: StoredTimetableVersion,
  teacherId: string,
  subjectId: string,
): { lesson: ScheduledLesson; move: TimetableMove } {
  const candidates = version.lessons.filter(
    (lesson) =>
      lesson.teacher_id === teacherId &&
      lesson.subject_id === subjectId &&
      !lesson.locked,
  );

  for (const lesson of candidates) {
    for (let day = 0; day < version.snapshot.periods_per_day.length; day += 1) {
      const latestStart =
        version.snapshot.periods_per_day[day]! - lesson.duration;
      for (let period = 0; period <= latestStart; period += 1) {
        if (day === lesson.day && period === lesson.period) continue;
        const move: TimetableMove = {
          lesson_id: lesson.id ?? lesson.block_id,
          target_day: day,
          target_period: period,
          target_room_id: lesson.room_id,
          expected_version: version.revision,
        };
        if (validateMove(version.snapshot, version.lessons, move).valid) {
          return { lesson, move };
        }
      }
    }
  }

  throw new Error(
    "Pro testovací hodinu informatiky nebyl nalezen platný přesun.",
  );
}

function assertAvailabilityRespected(
  project: StoredProject,
  lessons: ScheduledLesson[],
) {
  for (const rule of project.availability.filter(
    (item) => item.kind === "UNAVAILABLE",
  )) {
    const collisions = lessons.filter((lesson) => {
      const matchesEntity =
        (rule.entityType === "TEACHER" &&
          lesson.teacher_id === rule.entityId) ||
        (rule.entityType === "CLASS" &&
          [lesson.class_id, ...(lesson.additional_class_ids ?? [])].includes(
            rule.entityId,
          )) ||
        (rule.entityType === "ROOM" && lesson.room_id === rule.entityId);
      return (
        matchesEntity &&
        lesson.day === rule.dayOfWeek &&
        rule.period >= lesson.period &&
        rule.period < lesson.period + lesson.duration
      );
    });
    expect(collisions, `Nedostupný slot ${rule.id}`).toEqual([]);
  }
}

test("school leadership can import 40 teachers, generate the complete second-stage timetable and move a lesson", async ({
  page,
}) => {
  test.setTimeout(420_000);

  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const serverErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("response", (response) => {
    if (response.status() >= 500) {
      serverErrors.push(`${response.status()} ${response.url()}`);
    }
  });

  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Připravenost školního roku" }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Nastavení" }).click();
  await page.getByLabel("Název školy").fill("ZŠ Kapacitní test");
  await page.getByRole("button", { name: "Uložit nastavení" }).click();
  await expect(
    page.getByText("Nastavení projektu bylo uloženo do tohoto prohlížeče."),
  ).toBeVisible();

  const workbook = await createRealisticSchoolWorkbook();
  await page.getByRole("link", { name: "Načtení dat" }).click();
  await page.locator("#import-file").setInputFiles({
    name: "druhy-stupen-40-ucitelu.xlsx",
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

  const imported = await readStoredProject(page);
  expect(imported.schoolName).toBe("ZŠ Kapacitní test");
  expect(imported.teachers).toHaveLength(40);
  expect(imported.classes).toHaveLength(13);
  expect(imported.subjects).toHaveLength(SUBJECTS.length);
  expect(imported.assignments).toHaveLength(workbook.assignments.length);

  const teacherByCode = new Map(
    imported.teachers.map((teacher) => [teacher.code, teacher]),
  );
  const classByCode = new Map(
    imported.classes.map((schoolClass) => [schoolClass.code, schoolClass]),
  );
  const classById = new Map(
    imported.classes.map((schoolClass) => [schoolClass.id, schoolClass]),
  );
  const subjectByCode = new Map(
    imported.subjects.map((subject) => [subject.code, subject]),
  );
  const subjectById = new Map(
    imported.subjects.map((subject) => [subject.id, subject]),
  );

  const kad = teacherByCode.get("KAD");
  const informatics = subjectByCode.get("INF");
  const physicalEducation = subjectByCode.get("TV");
  expect(kad).toBeDefined();
  expect(informatics).toBeDefined();
  expect(physicalEducation).toBeDefined();
  expect(kad?.targetWeeklyLoad).toBe(17);
  expect(kad?.minWeeklyLoad).toBe(17);
  expect(kad?.maxWeeklyLoad).toBe(17);

  const kadAssignments = imported.assignments.filter(
    (assignment) => assignment.teacherId === kad!.id,
  );
  expect(
    kadAssignments.reduce(
      (total, assignment) => total + assignment.weeklyPeriods,
      0,
    ),
  ).toBe(17);

  const kadInformatics = kadAssignments.filter(
    (assignment) => assignment.subjectId === informatics!.id,
  );
  expect(kadInformatics).toHaveLength(13);
  expect(
    new Set(kadInformatics.map((assignment) => assignment.classId)).size,
  ).toBe(13);
  kadInformatics.forEach((assignment) => {
    expect(assignment.group).toBe("WHOLE");
    expect(assignment.weeklyPeriods).toBe(1);
    expect(assignment.lessonShape).toBe("SINGLE");
  });

  const kadPhysicalEducation = kadAssignments.filter(
    (assignment) => assignment.subjectId === physicalEducation!.id,
  );
  expect(kadPhysicalEducation).toHaveLength(1);
  const sharedPeAssignment = kadPhysicalEducation[0]!;
  expect(classById.get(sharedPeAssignment.classId)?.code).toBe("9A");
  expect(
    sharedPeAssignment.additionalClassIds.map(
      (classId) => classById.get(classId)?.code,
    ),
  ).toEqual(["9C"]);
  expect(sharedPeAssignment.group).toBe("WHOLE");
  expect(sharedPeAssignment.weeklyPeriods).toBe(4);
  expect(sharedPeAssignment.lessonShape).toBe("DOUBLE");

  for (const [classCode] of CLASSES) {
    const schoolClass = classByCode.get(classCode)!;
    const classAssignments = imported.assignments.filter(
      (assignment) =>
        assignment.classId === schoolClass.id ||
        assignment.additionalClassIds.includes(schoolClass.id),
    );
    expect(
      [
        ...new Set(
          classAssignments.map(
            (assignment) => subjectById.get(assignment.subjectId)?.code,
          ),
        ),
      ].sort(),
    ).toEqual(
      SUBJECTS.map(([subjectCode]) => subjectCode)
        .filter((subjectCode) => subjectCode !== "CH" || schoolClass.grade >= 8)
        .sort(),
    );

    for (const subjectCode of SPLIT_SUBJECTS) {
      const subject = subjectByCode.get(subjectCode)!;
      const splitAssignments = classAssignments.filter(
        (assignment) => assignment.subjectId === subject.id,
      );
      expect(splitAssignments).toHaveLength(2);
      expect(
        splitAssignments.map((assignment) => assignment.group).sort(),
      ).toEqual(["GROUP_1", "GROUP_2"]);
      expect(
        new Set(splitAssignments.map((assignment) => assignment.weeklyPeriods))
          .size,
      ).toBe(1);
    }

    const classInformatics = classAssignments.filter(
      (assignment) => assignment.subjectId === informatics!.id,
    );
    expect(classInformatics).toHaveLength(1);
    expect(classInformatics[0]?.group).toBe("WHOLE");
  }

  await page.getByRole("link", { name: "Přehled" }).click();
  await expect(page.getByText("Rozvrh lze vytvořit")).toBeVisible();
  await page.getByRole("link", { name: "Tvorba rozvrhu" }).click();
  await expect(
    page.getByRole("heading", { name: "Kontrola připravenosti prošla" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Vytvořit nový návrh" }).click();
  await expect(
    page.getByText(/^(Proveditelný návrh|Optimální návrh)$/),
  ).toBeVisible({ timeout: 240_000 });
  await page.getByRole("link", { name: "Otevřít návrh" }).click();
  await expect(
    page.getByRole("heading", { name: "Kvalita návrhu" }),
  ).toBeVisible();

  const generated = await readStoredProject(page);
  const generatedVersion = currentVersion(generated);
  expect(
    validateSchedule(generatedVersion.snapshot, generatedVersion.lessons),
  ).toEqual([]);
  assertAvailabilityRespected(generated, generatedVersion.lessons);

  const generatedKadLessons = generatedVersion.lessons.filter(
    (lesson) => lesson.teacher_id === kad!.id,
  );
  expect(
    generatedKadLessons.reduce((total, lesson) => total + lesson.duration, 0),
  ).toBe(17);
  expect(
    generatedKadLessons.filter(
      (lesson) => lesson.subject_id === informatics!.id,
    ),
  ).toHaveLength(13);
  const generatedKadPe = generatedKadLessons.filter(
    (lesson) => lesson.subject_id === physicalEducation!.id,
  );
  expect(generatedKadPe).toHaveLength(2);
  generatedKadPe.forEach((lesson) => {
    expect(lesson.duration).toBe(2);
    expect(classById.get(lesson.class_id)?.code).toBe("9A");
    expect(
      (lesson.additional_class_ids ?? []).map(
        (classId) => classById.get(classId)?.code,
      ),
    ).toEqual(["9C"]);
  });

  const kadUnavailable = generated.availability.find(
    (rule) => rule.entityId === kad!.id && rule.kind === "UNAVAILABLE",
  );
  expect(kadUnavailable).toBeDefined();
  const availabilityProbe = generatedKadLessons.find(
    (lesson) => lesson.subject_id === informatics!.id,
  )!;
  const invalidMove = validateMove(
    generatedVersion.snapshot,
    generatedVersion.lessons,
    {
      lesson_id: availabilityProbe.id ?? availabilityProbe.block_id,
      target_day: kadUnavailable!.dayOfWeek,
      target_period: kadUnavailable!.period,
      target_room_id: availabilityProbe.room_id,
      expected_version: generatedVersion.revision,
    },
  );
  expect(invalidMove.valid).toBe(false);
  expect(invalidMove.issues.map((issue) => issue.code)).toContain(
    "UNAVAILABLE_SLOT",
  );

  const validMove = findValidMove(generatedVersion, kad!.id, informatics!.id);
  const movedClass = classById.get(validMove.lesson.class_id)!;

  await page.getByRole("button", { name: "Učitelé" }).click();
  const teacherSelect = page.getByLabel("Učitel");
  await expect(teacherSelect).toBeVisible();
  await teacherSelect.selectOption({ label: "KAD · Tomáš Kadleček" });
  const lessonButton = page
    .getByRole("button", {
      name: new RegExp(`INF\\s+${movedClass.code}`),
    })
    .first();
  await expect(lessonButton).toBeVisible();
  await lessonButton.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel("Den").selectOption(String(validMove.move.target_day));
  await page
    .getByLabel("Hodina")
    .selectOption(String(validMove.move.target_period));
  await page.getByRole("button", { name: "Ověřit a přesunout" }).click();
  await expect(page.getByRole("dialog")).toBeHidden({ timeout: 30_000 });

  await expect
    .poll(async () => currentVersion(await readStoredProject(page)).revision)
    .toBe(generatedVersion.revision + 1);
  const afterMove = await readStoredProject(page);
  const movedVersion = currentVersion(afterMove);
  const movedLesson = movedVersion.lessons.find(
    (lesson) => lesson.id === validMove.lesson.id,
  );
  expect(movedLesson?.day).toBe(validMove.move.target_day);
  expect(movedLesson?.period).toBe(validMove.move.target_period);
  expect(movedLesson?.manually_changed).toBe(true);
  expect(validateSchedule(movedVersion.snapshot, movedVersion.lessons)).toEqual(
    [],
  );

  await page.getByRole("button", { name: "Vrátit změnu" }).click();
  await expect
    .poll(async () => currentVersion(await readStoredProject(page)).revision)
    .toBe(movedVersion.revision + 1);
  const afterUndo = currentVersion(await readStoredProject(page));
  const restoredLesson = afterUndo.lessons.find(
    (lesson) => lesson.id === validMove.lesson.id,
  );
  expect(restoredLesson?.day).toBe(validMove.lesson.day);
  expect(restoredLesson?.period).toBe(validMove.lesson.period);
  expect(validateSchedule(afterUndo.snapshot, afterUndo.lessons)).toEqual([]);

  await page.getByRole("link", { name: "Nastavení" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Stáhnout zálohu projektu" }).click();
  const download = await downloadPromise;
  const backupPath = await download.path();
  expect(backupPath).not.toBeNull();
  const backup = JSON.parse((await readFile(backupPath!)).toString("utf8")) as {
    project: StoredProject;
  };
  expect(backup.project.teachers).toHaveLength(40);
  expect(backup.project.classes).toHaveLength(13);
  expect(backup.project.timetableVersions).toHaveLength(1);

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
  expect(serverErrors).toEqual([]);
});
