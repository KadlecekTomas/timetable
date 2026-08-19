import { expect, test, type Page } from "@playwright/test";

import type {
  CanonicalSnapshot,
  ScheduledLesson,
} from "../lib/domain/contracts";
import { validateSchedule } from "../lib/domain/validation";

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
  group: "WHOLE" | "GROUP_1" | "GROUP_2";
  weeklyPeriods: number;
}

interface StoredGenerationRun {
  status: string;
  candidateVersionId: string | null;
}

interface StoredTimetableVersion {
  id: string;
  snapshot: CanonicalSnapshot;
  lessons: ScheduledLesson[];
}

interface StoredProject {
  classes: StoredClass[];
  subjects: StoredSubject[];
  assignments: StoredAssignment[];
  generationRuns: StoredGenerationRun[];
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

function lessonSlots(lessons: ScheduledLesson[]): string[] {
  return lessons
    .map((lesson) => `${lesson.day}:${lesson.period}:${lesson.duration}`)
    .sort();
}

test("class-scoped second language can be prepared, solved and opened as a valid timetable", async ({
  page,
}) => {
  test.setTimeout(180_000);
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
            id: "teacher-language-one",
            firstName: "Jana",
            lastName: "Němcová",
            targetWeeklyLoad: 9,
            baseWeeklyLoad: 9,
            subjectLoads: [
              {
                id: "load-language-one",
                subjectCode: "JAZ2",
                weeklyPeriods: 9,
              },
            ],
            unavailableDays: [],
          },
          {
            id: "teacher-language-two",
            firstName: "Petr",
            lastName: "Francouz",
            targetWeeklyLoad: 9,
            baseWeeklyLoad: 9,
            subjectLoads: [
              {
                id: "load-language-two",
                subjectCode: "JAZ2",
                weeklyPeriods: 9,
              },
            ],
            unavailableDays: [],
          },
        ],
      }),
    );

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
          ...["7.A", "7.B", "7.C"].map((classCode, index) => ({
            id: `row-vol-${index}`,
            classCode,
            subjectCode: "VOL",
            secondarySubjectCode: "",
            weeklyPeriods: 2,
            lessonShape: "SEPARATE",
            doublePeriodsCount: 0,
            organization: "WHOLE",
            rotationPlacement: "SAME_DAY",
            primaryTeacherId: "teacher-language-one",
            secondaryTeacherId: "",
          })),
          ...["8.A", "8.B", "8.C"].map((classCode, index) => ({
            id: `row-language-${index}`,
            classCode,
            subjectCode: "JAZ2",
            secondarySubjectCode: "",
            weeklyPeriods: 3,
            lessonShape: "SEPARATE",
            doublePeriodsCount: 0,
            organization: "SPLIT",
            rotationPlacement: "SAME_DAY",
            primaryTeacherId: "teacher-language-one",
            secondaryTeacherId: "teacher-language-two",
            splitGroupCount: 2,
          })),
        ],
      }),
    );
  });

  await page.goto("/coverage?schoolYearId=local-school-year");
  await expect(page.getByTestId("coverage-7.A-VOL")).toHaveCount(0);
  await expect(page.getByTestId("coverage-7.B-VOL")).toHaveCount(0);
  await expect(page.getByTestId("coverage-7.C-VOL")).toHaveCount(0);

  for (const classCode of ["8.A", "8.B", "8.C"]) {
    await expect(
      page.getByTestId(`coverage-${classCode}-JAZ2`),
    ).toHaveAttribute("data-status", "FULL");
    await expect(
      page.getByTestId(`coverage-${classCode}-JAZ2`),
    ).toHaveAttribute("data-shared", "false");
  }

  await page.goto("/generate?schoolYearId=local-school-year");
  await page
    .getByRole("button", { name: "Připravit a zkontrolovat data" })
    .click();
  await expect(
    page.getByText(
      /Připraveno: 2 učitelé, 13 tříd, 1 předmět a 6 výukových vazeb\./,
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Zadání je připravené" }),
  ).toBeVisible();

  const prepared = await readProject(page);
  const classIdByCode = new Map(
    prepared.classes.map((schoolClass) => [schoolClass.code, schoolClass.id]),
  );
  const subjectCodeById = new Map(
    prepared.subjects.map((subject) => [subject.id, subject.code]),
  );
  const languageAssignments = prepared.assignments.filter(
    (assignment) => subjectCodeById.get(assignment.subjectId) === "JAZ2",
  );

  expect(prepared.subjects.some((subject) => subject.code === "VOL")).toBe(
    false,
  );
  expect(languageAssignments).toHaveLength(6);
  for (const classCode of ["8.A", "8.B", "8.C"]) {
    const classAssignments = languageAssignments.filter(
      (assignment) => assignment.classId === classIdByCode.get(classCode),
    );
    expect(classAssignments).toHaveLength(2);
    expect(classAssignments.map((assignment) => assignment.group).sort()).toEqual([
      "GROUP_1",
      "GROUP_2",
    ]);
    for (const assignment of classAssignments) {
      expect(assignment.additionalClassIds).toEqual([]);
      expect(assignment.weeklyPeriods).toBe(3);
    }
  }

  await page.getByLabel("Časový limit výpočtu").selectOption("30");
  await page.getByRole("button", { name: "Vytvořit nový návrh" }).click();
  await expect(
    page.getByText(/^(Proveditelný návrh|Optimální návrh)$/),
  ).toBeVisible({ timeout: 90_000 });
  await page.getByRole("link", { name: "Otevřít návrh" }).click();
  await expect(
    page.getByRole("heading", { name: "Kvalita návrhu" }),
  ).toBeVisible();

  const generated = await readProject(page);
  const run = generated.generationRuns[0];
  expect(["FEASIBLE", "OPTIMAL"]).toContain(run?.status);
  expect(run?.candidateVersionId).toBeTruthy();

  const version = generated.timetableVersions.find(
    (candidate) => candidate.id === run?.candidateVersionId,
  );
  expect(version).toBeDefined();
  expect(validateSchedule(version!.snapshot, version!.lessons)).toEqual([]);
  expect(version!.lessons).toHaveLength(18);

  const assignmentById = new Map(
    generated.assignments.map((assignment) => [assignment.id, assignment]),
  );
  for (const classCode of ["8.A", "8.B", "8.C"]) {
    const classId = classIdByCode.get(classCode);
    const lessonsByGroup = new Map<string, ScheduledLesson[]>();
    for (const lesson of version!.lessons.filter(
      (item) => item.class_id === classId,
    )) {
      const assignment = assignmentById.get(lesson.assignment_id);
      expect(assignment).toBeDefined();
      expect(subjectCodeById.get(lesson.subject_id)).toBe("JAZ2");
      expect(lesson.additional_class_ids).toEqual([]);
      lessonsByGroup.set(assignment!.group, [
        ...(lessonsByGroup.get(assignment!.group) ?? []),
        lesson,
      ]);
    }
    expect(lessonSlots(lessonsByGroup.get("GROUP_1") ?? [])).toEqual(
      lessonSlots(lessonsByGroup.get("GROUP_2") ?? []),
    );
  }

  const languageTeacherIds = [
    ...new Set(languageAssignments.map((assignment) => assignment.teacherId)),
  ];
  expect(languageTeacherIds).toHaveLength(2);
  for (const teacherId of languageTeacherIds) {
    expect(
      version!.lessons
        .filter((lesson) => lesson.teacher_id === teacherId)
        .reduce((sum, lesson) => sum + lesson.duration, 0),
    ).toBe(9);
  }

  expect(pageErrors).toEqual([]);
  expect(serverErrors).toEqual([]);
});
