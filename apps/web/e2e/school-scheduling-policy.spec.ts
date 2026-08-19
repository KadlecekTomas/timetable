import { expect, test, type Page } from "@playwright/test";

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

interface StoredProject {
  teachers: StoredTeacher[];
  classes: StoredClass[];
  subjects: StoredSubject[];
  assignments: StoredAssignment[];
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

test("JAZ2 keeps shared groups with source staffing for 9.A, 9.B and 9.C", async ({
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
            targetWeeklyLoad: 19,
            baseWeeklyLoad: 19,
            subjectLoads: [
              {
                id: "load-prikrylova-jaz2",
                subjectCode: "JAZ2",
                weeklyPeriods: 15,
              },
              {
                id: "load-prikrylova-other",
                subjectCode: "VV",
                weeklyPeriods: 4,
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
        ],
      }),
    );

    const languageRow = (
      id: string,
      classCode: string,
      primaryTeacherId: string,
      secondaryTeacherId: string,
    ) => ({
      id,
      classCode,
      subjectCode: "JAZ2",
      secondarySubjectCode: "",
      weeklyPeriods: 3,
      lessonShape: "SEPARATE",
      doublePeriodsCount: 0,
      organization: "SPLIT",
      rotationPlacement: "SAME_DAY",
      primaryTeacherId,
      secondaryTeacherId,
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
          languageRow("language-8a", "8.A", "prikrylova", "spankova"),
          languageRow("language-8b", "8.B", "spankova", ""),
          languageRow("language-8c", "8.C", "prikrylova", "spankova"),
          languageRow("language-9a", "9.A", "prikrylova", ""),
          languageRow("language-9b", "9.B", "spankova", "prikrylova"),
          languageRow("language-9c", "9.C", "prikrylova", ""),
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
  const prikrylova = prepared.teachers.find(
    (teacher) => teacher.lastName === "Přikrylová",
  );
  const language = prepared.subjects.find((subject) => subject.code === "JAZ2");
  const classIdByCode = new Map(
    prepared.classes.map((schoolClass) => [schoolClass.code, schoolClass.id]),
  );
  expect(spankova).toBeDefined();
  expect(prikrylova).toBeDefined();
  expect(language).toBeDefined();

  const preparedSpankova = prepared.assignments
    .filter(
      (assignment) =>
        assignment.teacherId === spankova!.id &&
        assignment.subjectId === language!.id,
    )
    .sort((left, right) => left.classId.localeCompare(right.classId));
  expect(preparedSpankova).toHaveLength(2);
  expect(assignmentClassIds(preparedSpankova[0]!)).toEqual(
    ["8.A", "8.B", "8.C"].map((code) => classIdByCode.get(code)).sort(),
  );
  expect(assignmentClassIds(preparedSpankova[1]!)).toEqual([
    classIdByCode.get("9.B"),
  ]);
  const preparedPrikrylovaNinthGrade = prepared.assignments.find(
    (assignment) =>
      assignment.teacherId === prikrylova!.id &&
      assignment.subjectId === language!.id &&
      assignmentClassIds(assignment).includes(classIdByCode.get("9.A")!),
  );
  expect(preparedPrikrylovaNinthGrade).toBeDefined();
  expect(assignmentClassIds(preparedPrikrylovaNinthGrade!)).toEqual(
    ["9.A", "9.B", "9.C"].map((code) => classIdByCode.get(code)).sort(),
  );

  expect(pageErrors).toEqual([]);
  expect(serverErrors).toEqual([]);
});
