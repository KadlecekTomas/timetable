import { expect, test } from "@playwright/test";

const BASE_URL = "http://127.0.0.1:3000";

function sharedProject() {
  return {
    schemaVersion: 1,
    id: "local-school-year",
    schoolName: "Sdílená testovací škola",
    label: "2026/2027",
    status: "ACTIVE",
    periodsPerDay: [8, 8, 8, 8, 7],
    version: 8,
    updatedAt: "2026-08-05T00:00:00.000Z",
    inputFingerprint: "share-e2e",
    teachers: [
      {
        id: "teacher-share",
        code: "SHA",
        firstName: "Alena",
        lastName: "Sdílená",
        targetWeeklyLoad: 22,
        minWeeklyLoad: null,
        maxWeeklyLoad: 22,
      },
    ],
    classes: [
      {
        id: "class-share",
        code: "6.A",
        grade: 6,
        name: "6.A",
        profile: "REGULAR",
      },
    ],
    subjects: [
      {
        id: "subject-share",
        code: "CJ",
        name: "Český jazyk",
        colorToken: null,
        defaultRoomTypeId: null,
      },
    ],
    roomTypes: [],
    rooms: [],
    assignments: [
      {
        id: "assignment-share",
        assignmentCode: "6A-CJ-SHARE",
        classId: "class-share",
        additionalClassIds: [],
        subjectId: "subject-share",
        teacherId: "teacher-share",
        group: "WHOLE",
        weeklyPeriods: 5,
        lessonShape: "SINGLE",
        doublePeriodsCount: 0,
        requiredRoomId: null,
        requiredRoomTypeId: null,
        maxPerDay: null,
        minDayGap: null,
        parallelKey: null,
        rotationKey: null,
        rotationLeg: null,
        rotationPlacement: null,
      },
    ],
    availability: [],
    fixedLessons: [],
    importBatches: [],
    generationRuns: [],
    timetableVersions: [],
  };
}

test("database-free link transfers working data and solver project to another browser", async ({
  browser,
}) => {
  const senderContext = await browser.newContext({ baseURL: BASE_URL });
  const sender = await senderContext.newPage();
  await sender.goto("/share?schoolYearId=local-school-year");

  await sender.evaluate(
    async ({ project }) => {
      localStorage.setItem(
        "rozvrhar:staffing-plan:v1",
        JSON.stringify({
          version: 1,
          updatedAt: "2026-08-05T00:00:00.000Z",
          teachers: [
            {
              id: "teacher-share",
              firstName: "Alena",
              lastName: "Sdílená",
              targetWeeklyLoad: 22,
              subjectLoads: [
                {
                  id: "load-share",
                  subjectCode: "CJ",
                  weeklyPeriods: 22,
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
          updatedAt: "2026-08-05T00:00:00.000Z",
          classes: [{ id: "class-share", code: "6.A", grade: 6 }],
          rows: [
            {
              id: "row-share",
              classCode: "6.A",
              subjectCode: "CJ",
              weeklyPeriods: 5,
              lessonShape: "SEPARATE",
              doublePeriodsCount: 0,
              organization: "WHOLE",
              primaryTeacherId: "teacher-share",
              secondaryTeacherId: "",
            },
          ],
        }),
      );

      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("rozvrhar-local", 1);
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains("state")) {
            request.result.createObjectStore("state");
          }
        };
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction("state", "readwrite");
          transaction.objectStore("state").put(project, "active-project");
          transaction.oncomplete = () => {
            database.close();
            resolve();
          };
          transaction.onerror = () => reject(transaction.error);
        };
      });
    },
    { project: sharedProject() },
  );

  await sender.reload();
  await sender.getByRole("button", { name: "Vytvořit sdílecí odkaz" }).click();
  const shareLink = await sender.getByLabel("Sdílecí odkaz").inputValue();
  expect(shareLink).toContain("/share?schoolYearId=local-school-year#project=");

  const recipientContext = await browser.newContext({ baseURL: BASE_URL });
  const recipient = await recipientContext.newPage();
  await recipient.goto(shareLink);

  await expect(
    recipient.getByRole("heading", {
      name: "Přijatý projekt je připravený k načtení",
    }),
  ).toBeVisible();
  await expect(recipient.getByText("Sdílená testovací škola")).toBeVisible();
  await expect(
    recipient.getByText("Výukové vazby pro generátor").locator(".."),
  ).toContainText("1");

  await recipient.getByRole("button", { name: "Načíst tento projekt" }).click();
  await expect(
    recipient.getByRole("alertdialog", { name: "Načíst přijatý projekt?" }),
  ).toBeVisible();
  await recipient.getByRole("button", { name: "Načíst projekt" }).click();
  await expect(recipient).toHaveURL(/shared=1/);

  const restored = await recipient.evaluate(
    () =>
      new Promise<{
        staffingName: string;
        schoolName: string;
        teachers: number;
        assignments: number;
      }>((resolve, reject) => {
        const staffing = JSON.parse(
          localStorage.getItem("rozvrhar:staffing-plan:v1") ?? "{}",
        );
        const request = indexedDB.open("rozvrhar-local", 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction("state", "readonly");
          const read = transaction.objectStore("state").get("active-project");
          read.onerror = () => reject(read.error);
          read.onsuccess = () => {
            resolve({
              staffingName: staffing.teachers[0].firstName,
              schoolName: read.result.schoolName,
              teachers: read.result.teachers.length,
              assignments: read.result.assignments.length,
            });
          };
          transaction.oncomplete = () => database.close();
        };
      }),
  );

  expect(restored).toEqual({
    staffingName: "Alena",
    schoolName: "Sdílená testovací škola",
    teachers: 1,
    assignments: 1,
  });

  await senderContext.close();
  await recipientContext.close();
});
