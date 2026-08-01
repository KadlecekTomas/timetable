import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import ExcelJS from "exceljs";

import {
  createTimetableExportWorkbook,
  timetableExportFileName,
  type TimetableExportEntity,
  type TimetableExportLesson,
  type TimetableExportPayload,
} from "../lib/export/timetable-workbook";

const CLASS_CODES = [
  "6A",
  "6B",
  "6C",
  "6D",
  "7A",
  "7B",
  "7C",
  "8A",
  "8B",
  "8C",
  "9A",
  "9B",
  "9C",
] as const;

function entity(id: string, code: string, name = code): TimetableExportEntity {
  return { id, code, name };
}

function subject(code: string, name: string): TimetableExportEntity {
  return entity(`subject-${code}`, code, name);
}

const CLASSES = CLASS_CODES.map((code) =>
  entity(`class-${code}`, code, `${code[0]}.${code[1]}`),
);
const TEACHERS = [
  entity("teacher-KAD", "KAD", "Tomáš Kadleček"),
  ...Array.from({ length: 39 }, (_, index) =>
    entity(
      `teacher-T${String(index + 1).padStart(2, "0")}`,
      `T${String(index + 1).padStart(2, "0")}`,
      `Testovací učitel ${index + 1}`,
    ),
  ),
];
const SUBJECTS = {
  INF: subject("INF", "Informatika"),
  TV: subject("TV", "Tělesná výchova"),
  M: subject("M", "Matematika"),
  CJ: subject("CJ", "Český jazyk"),
};
const ROOMS = {
  PC1: { id: "room-PC1", code: "PC1", name: "Počítačová učebna" },
  TV1: { id: "room-TV1", code: "TV1", name: "Tělocvična" },
  KM1: { id: "room-KM1", code: "KM1", name: "Kmenová učebna" },
};

function lesson(input: {
  id: string;
  teacher: TimetableExportEntity;
  classes: TimetableExportEntity[];
  subject: TimetableExportEntity;
  day: number;
  period: number;
  duration?: number;
  group?: "WHOLE" | "GROUP_1" | "GROUP_2";
  room?: (typeof ROOMS)[keyof typeof ROOMS];
  locked?: boolean;
  manuallyChanged?: boolean;
}): TimetableExportLesson {
  return {
    id: input.id,
    block_id: input.id,
    assignment_id: `assignment-${input.id}`,
    day: input.day,
    period: input.period,
    duration: input.duration ?? 1,
    room_id: input.room?.id ?? null,
    group: input.group ?? "WHOLE",
    locked: input.locked ?? false,
    manually_changed: input.manuallyChanged ?? false,
    origin: input.manuallyChanged ? "MANUAL" : "SOLVER",
    teacher: input.teacher,
    schoolClass: input.classes[0],
    schoolClasses: input.classes,
    subject: input.subject,
    room: input.room ?? null,
  };
}

function buildLessons(): TimetableExportLesson[] {
  const kad = TEACHERS[0]!;
  const lessons: TimetableExportLesson[] = CLASSES.map((schoolClass, index) =>
    lesson({
      id: `kad-inf-${schoolClass.code}`,
      teacher: kad,
      classes: [schoolClass],
      subject: SUBJECTS.INF,
      day: index % 5,
      period: Math.floor(index / 5),
      room: ROOMS.PC1,
      manuallyChanged: index === 0,
    }),
  );

  const class9A = CLASSES.find((item) => item.code === "9A")!;
  const class9C = CLASSES.find((item) => item.code === "9C")!;
  lessons.push(
    lesson({
      id: "kad-tv-9a-9c-1",
      teacher: kad,
      classes: [class9A, class9C],
      subject: SUBJECTS.TV,
      day: 3,
      period: 3,
      duration: 2,
      room: ROOMS.TV1,
      locked: true,
    }),
    lesson({
      id: "kad-tv-9a-9c-2",
      teacher: kad,
      classes: [class9A, class9C],
      subject: SUBJECTS.TV,
      day: 4,
      period: 3,
      duration: 2,
      room: ROOMS.TV1,
    }),
  );

  const class6A = CLASSES[0]!;
  lessons.push(
    lesson({
      id: "6a-m-group-1",
      teacher: TEACHERS[1]!,
      classes: [class6A],
      subject: SUBJECTS.M,
      day: 1,
      period: 4,
      group: "GROUP_1",
      room: ROOMS.KM1,
    }),
    lesson({
      id: "6a-m-group-2",
      teacher: TEACHERS[2]!,
      classes: [class6A],
      subject: SUBJECTS.M,
      day: 1,
      period: 4,
      group: "GROUP_2",
      room: ROOMS.KM1,
    }),
  );

  TEACHERS.slice(3).forEach((teacher, index) => {
    const schoolClass = CLASSES[index % CLASSES.length]!;
    lessons.push(
      lesson({
        id: `coverage-${teacher.code}`,
        teacher,
        classes: [schoolClass],
        subject: index % 2 === 0 ? SUBJECTS.CJ : SUBJECTS.M,
        day: (index + 2) % 5,
        period: (index % 5) + 1,
        room: ROOMS.KM1,
      }),
    );
  });

  return lessons;
}

function payload(
  entities: TimetableExportEntity[],
  lessons: TimetableExportLesson[],
): TimetableExportPayload {
  return {
    version: {
      id: "version-1",
      name: "Návrh 1",
      revision: 3,
      isCurrent: true,
      qualityScore: 91,
      scoreBreakdown: { class_compactness: 20, teacher_compactness: 18 },
      incidentReport: [],
    },
    periodsPerDay: [8, 8, 8, 8, 7],
    entities,
    rooms: Object.values(ROOMS),
    lessons,
  };
}

function textValues(worksheet: ExcelJS.Worksheet): string[] {
  const values: string[] = [];
  worksheet.eachRow((row) => {
    row.eachCell((cell) => {
      if (cell.text) values.push(cell.text);
    });
  });
  return values;
}

function findRowByFirstCell(
  worksheet: ExcelJS.Worksheet,
  value: string,
): number | null {
  for (let row = 1; row <= worksheet.rowCount; row += 1) {
    if (worksheet.getCell(row, 1).text === value) return row;
  }
  return null;
}

test("leadership export contains printable class and teacher schedules at school scale", async () => {
  const lessons = buildLessons();
  const bytes = await createTimetableExportWorkbook({
    schoolName: "ZŠ Kapacitní test",
    schoolYear: "2026/2027",
    classTimetable: payload(CLASSES, lessons),
    teacherTimetable: payload(TEACHERS, lessons),
    exportedAt: new Date("2026-08-01T12:00:00.000Z"),
  });

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes as never);

  assert.equal(workbook.worksheets.length, 54);
  const overview = workbook.getWorksheet("Přehled");
  const class6A = workbook.getWorksheet("Třída 6A");
  const class9A = workbook.getWorksheet("Třída 9A");
  const class9C = workbook.getWorksheet("Třída 9C");
  const teacherKad = workbook.getWorksheet("Učitel KAD");
  assert.ok(overview);
  assert.ok(class6A);
  assert.ok(class9A);
  assert.ok(class9C);
  assert.ok(teacherKad);

  assert.equal(overview.getCell("B4").text, "ZŠ Kapacitní test");
  assert.equal(overview.getCell("B5").text, "2026/2027");
  assert.equal(overview.getCell("E4").value, 13);
  assert.equal(overview.getCell("E5").value, 40);

  const kadRow = findRowByFirstCell(overview, "KAD");
  assert.notEqual(kadRow, null);
  assert.equal(overview.getCell(kadRow!, 3).value, 17);
  assert.match(overview.getCell(kadRow!, 5).text, /Otevřít rozvrh/);

  const kadTexts = textValues(teacherKad);
  assert.equal(kadTexts.filter((value) => value.startsWith("INF ·")).length, 13);
  assert.equal(kadTexts.filter((value) => value.startsWith("TV ·")).length, 2);
  assert.equal(
    kadTexts.filter((value) => value.includes("pokračování TV")).length,
    2,
  );
  assert.ok(kadTexts.some((value) => value.includes("9A + 9C")));
  assert.ok(kadTexts.some((value) => value.includes("ručně změněno")));
  assert.ok(kadTexts.some((value) => value.includes("zamčeno")));

  assert.ok(textValues(class9A).some((value) => value.startsWith("TV · KAD")));
  assert.ok(textValues(class9C).some((value) => value.startsWith("TV · KAD")));
  const splitCell = textValues(class6A).find(
    (value) => value.includes("Skupina 1") && value.includes("Skupina 2"),
  );
  assert.ok(splitCell);

  for (const worksheet of [class6A, class9A, class9C, teacherKad]) {
    assert.equal(worksheet.pageSetup.orientation, "landscape");
    assert.equal(worksheet.pageSetup.fitToWidth, 1);
    assert.equal(worksheet.pageSetup.fitToHeight, 1);
    assert.ok(
      textValues(worksheet).some((value) => value.includes("Obědová přestávka")),
    );
  }

  assert.equal(
    timetableExportFileName({
      schoolName: "ZŠ Kapacitní test",
      schoolYear: "2026/2027",
      versionName: "Návrh 1",
      revision: 3,
    }),
    "rozvrh-zs-kapacitni-test-2026-2027-navrh-1-r3.xlsx",
  );

  const artifactPath = fileURLToPath(
    new URL("../artifacts/rozvrh-vedeni-ukazka.xlsx", import.meta.url),
  );
  await mkdir(dirname(artifactPath), { recursive: true });
  await writeFile(artifactPath, bytes);
});
