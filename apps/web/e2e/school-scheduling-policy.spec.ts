import { expect, test, type Page } from "@playwright/test";

import type {
  CanonicalSnapshot,
  ScheduledLesson,
} from "../lib/domain/contracts";
import { validateSchedule } from "../lib/domain/validation";

interface StoredTeacher {
  id: string;
  firstName: string;
  lastName: string;
}

interface StoredClass {
  id: string;
  code: string;
}

interface StoredSubject {
  id: string;
  code: string;
}

interface StoredAssignment {
  id: string;
  classId: string;
  additionalClassIds: string[];
  subjectId: string;
  teacherId: string;
  group: "WHOLE" | "GROUP_1" | "GROUP_2" | "GROUP_3";
}

interface StoredTimetableVersion {
  id: string;
  snapshot: CanonicalSnapshot;
  lessons: ScheduledLesson[];
}

interface StoredProject {
  teachers: StoredTeacher[];
  classes: StoredClass[];
  subjects: StoredSubject[];
  assignments: StoredAssignment[];
  timetableVersions: StoredTimetableVersion[];
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

function assignmentClassIds(assignment: StoredAssignment): string[] {
  return [assignment.classId, ...assignment.additionalClassIds].sort();
}

test("JAZ2 stays class-scoped and Špánková receives the exact accepted V8 slots", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const pageErrors: string[] = [];
  const serverErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 500) {
      serverErrors.push(`${response.status()} ${response.url()}`);
    }
  });

  await page.goto("/");
  await page.evaluate(() => {
    const classCodes = [
      "6.A",
      "6.B",
      "6.C",
      "6.D",
      "7.A",
      "7.B",
      "7.C",
      "8.A",
      "8.B",
      "8.C",
      "9.A",
      "9.B",
      "9.C",
    ];

    localStorage.setItem(
      "rozvrhar:staffing-plan:v1",
      JSON.stringify({
        version: 1,
        updatedAt: new Date().toISOString(),
        teachers: [
          {
            id: "prikrylova",
            firstName: "",
            lastName: "Přikrylová",
            targetWeeklyLoad: 15,
            baseWeeklyLoad: 15,
            subjectLoads: [
              {
                id: "load-prikrylova-jaz2",
                subjectCode: "JAZ2",
                weeklyPeriods: 15,
              },
            ],
            unavailableDays: [],
            unavailablePeriods: [],
          },
          {
            id: "spankova",
            firstName: "",
            lastName: "Špánková",
            targetWeeklyLoad: 12,
            baseWeeklyLoad: 12,
            subjectLoads: [
              {
                id: "load-spankova-jaz2",
                subjectCode: "JAZ2",
                weeklyPeriods: 12,
              },
            ],
            unavailableDays: [],
            unavailablePeriods: [],
          },
          {
            id: "kadlecek",
            firstName: "Tomáš",
            lastName: "Kadleček",
            targetWeeklyLoad: 13,
            baseWeeklyLoad: 13,
            subjectLoads: [
              {
                id: "load-kadlecek-inf",
                subjectCode: "INF",
                weeklyPeriods: 13,
              },
            ],
            unavailableDays: ["FRI"],
            unavailablePeriods: [],
          },
        ],
      }),
    );

    const languageRow = (
      id: string,
      classCode: string,
      organization: "WHOLE" | "SPLIT",
      primaryTeacherId: string,
      secondaryTeacherId = "",
    ) => ({
      id,
      classCode,
      subjectCode: "JAZ2",
      secondarySubjectCode: "",
      weeklyPeriods: 3,
      lessonShape: "SEPARATE",
      doublePeriodsCount: 0,
      organization,
      rotationPlacement: "SAME_DAY",
      primaryTeacherId,
      secondaryTeacherId,
      splitGroupCount: 2,
    });

    const infRow = (classCode: string) => ({
      id: `inf-${classCode}`,
      classCode,
      subjectCode: "INF",
      secondarySubjectCode: "",
      weeklyPeriods: 1,
      lessonShape: "SEPARATE",
      doublePeriodsCount: 0,
      organization: classCode === "8.B" ? "WHOLE" : "SPLIT",
      rotationPlacement: "SAME_DAY",
      primaryTeacherId: "kadlecek",
      secondaryTeacherId: classCode === "8.B" ? "" : "kadlecek",
      splitGroupCount: 2,
    });

    localStorage.setItem(
      "rozvrhar:teaching-plan:v1",
      JSON.stringify({
        version: 1,
        updatedAt: new Date().toISOString(),
        classes: classCodes.map((code, index) => ({
          id: `class-${index}`,
          code,
          grade: Number(code.split(".")[0]),
          profile: /\.(B|D)$/.test(code) ? "SPORTS" : "REGULAR",
        })),
        rows: [
          languageRow("language-8a", "8.A", "SPLIT", "prikrylova", "spankova"),
          languageRow("language-8b", "8.B", "WHOLE", "spankova"),
          languageRow("language-8c", "8.C", "SPLIT", "prikrylova", "spankova"),
          languageRow("language-9a", "9.A", "WHOLE", "prikrylova"),
          languageRow("language-9b", "9.B", "SPLIT", "spankova", "prikrylova"),
          languageRow("language-9c", "9.C", "WHOLE", "prikrylova"),
          ...classCodes.map(infRow),
        ],
      }),
    );
  });

  await page.goto("/generate?schoolYearId=local-school-year");
  await page
    .getByRole("button", { name: "Připravit a zkontrolovat data" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Zadání je připravené" }),
  ).toBeVisible();

  const prepared = await readProject(page);
  const spankova = prepared.teachers.find(
    (teacher) => teacher.lastName === "Špánková",
  );
  const language = prepared.subjects.find((subject) => subject.code === "JAZ2");
  const classIdByCode = new Map(
    prepared.classes.map((schoolClass) => [schoolClass.code, schoolClass.id]),
  );
  expect(spankova).toBeDefined();
  expect(language).toBeDefined();

  const preparedSpankova = prepared.assignments
    .filter(
      (assignment) =>
        assignment.teacherId === spankova!.id &&
        assignment.subjectId === language!.id,
    )
    .sort((left, right) => left.classId.localeCompare(right.classId));
  expect(preparedSpankova).toHaveLength(4);
  expect(
    preparedSpankova.map((assignment) => assignmentClassIds(assignment)),
  ).toEqual(
    ["8.A", "8.B", "8.C", "9.B"].map((code) => [classIdByCode.get(code)]),
  );

  await page.getByLabel("Časový limit výpočtu").selectOption("30");
  await page.getByRole("button", { name: "Vytvořit nový návrh" }).click();
  await expect(
    page.getByText(/^(Proveditelný návrh|Optimální návrh)$/),
  ).toBeVisible({ timeout: 60_000 });

  const generated = await readProject(page);
  const version = generated.timetableVersions.at(-1);
  expect(version).toBeDefined();
  expect(validateSchedule(version!.snapshot, version!.lessons)).toEqual([]);

  const assignmentById = new Map(
    generated.assignments.map((assignment) => [assignment.id, assignment]),
  );
  const spankovaLessons = version!.lessons
    .filter(
      (lesson) =>
        lesson.teacher_id === spankova!.id &&
        lesson.subject_id === language!.id,
    )
    .sort((left, right) => left.day - right.day || left.period - right.period);
  expect(spankovaLessons).toHaveLength(12);
  expect(
    spankovaLessons.map((lesson) => {
      const assignment = assignmentById.get(lesson.assignment_id);
      const classCode = [...classIdByCode.entries()].find(
        ([, classId]) => classId === assignment?.classId,
      )?.[0];
      return [classCode, lesson.day, lesson.period, lesson.locked];
    }),
  ).toEqual([
    ["8.B", 1, 1, true],
    ["8.C", 1, 2, true],
    ["8.A", 1, 3, true],
    ["9.B", 1, 4, true],
    ["8.B", 2, 1, true],
    ["8.A", 2, 2, true],
    ["8.C", 2, 3, true],
    ["9.B", 2, 4, true],
    ["8.B", 3, 1, true],
    ["8.C", 3, 2, true],
    ["8.A", 3, 3, true],
    ["9.B", 3, 4, true],
  ]);

  expect(pageErrors).toEqual([]);
  expect(serverErrors).toEqual([]);
});
