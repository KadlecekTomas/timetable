import { readFile, writeFile } from "node:fs/promises";

function replaceOnce(content, before, after, label) {
  if (!content.includes(before)) {
    throw new Error(`Expected source not found: ${label}`);
  }
  return content.replace(before, after);
}

async function update(path, transform) {
  const source = await readFile(path, "utf8");
  const next = transform(source);
  if (next === source) throw new Error(`No changes produced for ${path}`);
  await writeFile(path, next, "utf8");
}

await update("apps/web/lib/import/legacy-staffing-plan.ts", (source) => {
  let next = replaceOnce(
    source,
    `interface TeacherAggregate extends TeacherSeed {\n  id: string;\n  declaredTarget: number | null;\n  subjectHours: Map<string, number>;\n}\n`,
    `interface TeacherAggregate extends TeacherSeed {\n  id: string;\n  declaredTarget: number | null;\n  subjectHours: Map<string, number>;\n}\n\nconst MAX_PARALLEL_TEACHERS = 3;\n`,
    "parallel teacher constant",
  );
  next = replaceOnce(
    next,
    `    const allTokens = teacherTokens(requirement.rawTeacher);\n    const activeTeacherLimit = requirement.subject.code === "JAZ1" ? 3 : 2;\n    const allResolved = allTokens.flatMap((token) => {\n      const teacher = resolveTeacher(token, requirement.row);\n      return teacher ? [teacher] : [];\n    });\n    const resolved = allResolved.slice(0, activeTeacherLimit);\n    const tokens = allTokens.slice(0, activeTeacherLimit);`,
    `    const allTokens = teacherTokens(requirement.rawTeacher);\n    const tokens = allTokens.slice(0, MAX_PARALLEL_TEACHERS);\n    const resolved = tokens.flatMap((token) => {\n      const teacher = resolveTeacher(token, requirement.row);\n      return teacher ? [teacher] : [];\n    });`,
    "legacy teacher limit",
  );
  next = replaceOnce(
    next,
    `    if (allTokens.length > activeTeacherLimit) {\n      issues.push(\n        issue(\n          "WARNING",\n          requirement.row,\n          "Učitel/učitelka",\n          requirement.subject.code === "TV"\n            ? \`${"${requirement.classCode} · ${requirement.subject.name}: TV zůstává rozdělená jen na dvě žákovské skupiny. První dva učitelé byli nastaveni a další zůstávají v seznamu pro ruční změnu obsazení."}\`\n            : \`${"${requirement.classCode} · ${requirement.subject.name}: zachováni byli první ${activeTeacherLimit} souběžní učitelé; další je potřeba zkontrolovat ručně."}\`,\n        ),\n      );\n    }`,
    `    if (allTokens.length > MAX_PARALLEL_TEACHERS) {\n      issues.push(\n        issue(\n          "WARNING",\n          requirement.row,\n          "Učitel/učitelka",\n          \`${"${requirement.classCode} · ${requirement.subject.name}: zdroj uvádí ${allTokens.length} souběžných učitelů. Rozvrhář podporuje nejvýše ${MAX_PARALLEL_TEACHERS} skupiny; zachováni byli první ${MAX_PARALLEL_TEACHERS}."}\`,\n        ),\n      );\n    }`,
    "legacy overflow warning",
  );
  return next;
});

await update("apps/web/lib/local/teaching-plan-from-allocation-draft.ts", (source) =>
  replaceOnce(
    source,
    `    const threeGroups =\n      subjectCode === "JAZ1" && (Boolean(group3) || allTeacherIds.length >= 3);`,
    `    const threeGroups = Boolean(group3) || allTeacherIds.length >= 3;`,
    "allocation draft three groups",
  ),
);

await update("apps/web/lib/local/teaching-plan-school-v3.ts", (source) =>
  replaceOnce(
    source,
    `      const splitGroupCount =\n        !singleSplit && row.subjectCode === "JAZ1" && row.splitGroupCount === 3\n          ? 3\n          : 2;`,
    `      const splitGroupCount =\n        !singleSplit && row.splitGroupCount === 3 ? 3 : 2;`,
    "mandatory split three groups",
  ),
);

await update("apps/web/lib/local/teaching-plan.ts", (source) =>
  replaceOnce(
    source,
    `    label: "Dvě skupiny – stejný předmět",\n    description: "Obě skupiny probíhají současně, každá s vlastním učitelem.",`,
    `    label: "Skupiny – stejný předmět",\n    description:\n      "Dvě nebo tři skupiny probíhají současně, každá s vlastním učitelem.",`,
    "split organization copy",
  ),
);

await update("apps/web/app/teaching-plan/page.tsx", (source) => {
  let next = replaceOnce(
    source,
    `          {row.organization === "SPLIT" &&\n          row.subjectCode === "JAZ1" &&\n          !sameTeacherPartial ? (`,
    `          {row.organization === "SPLIT" &&\n          ["JAZ1", "TV"].includes(row.subjectCode) &&\n          !sameTeacherPartial ? (`,
    "three-group subject selector",
  );
  next = replaceOnce(
    next,
    `                Počet souběžných skupin angličtiny`,
    `                {row.subjectCode === "TV"\n                  ? "Počet souběžných skupin tělesné výchovy"\n                  : "Počet souběžných skupin angličtiny"}`,
    "three-group selector label",
  );
  next = replaceOnce(
    next,
    `<strong>Obě skupiny budou vždy ve stejnou dobu.</strong>{" "}`,
    `<strong>Všechny skupiny budou vždy ve stejnou dobu.</strong>{" "}`,
    "parallel group copy",
  );
  return next;
});

const regressionTest = `import assert from "node:assert/strict";\nimport test from "node:test";\n\nimport ExcelJS from "exceljs";\n\nimport { analyzeLegacyStaffingPlan } from "../lib/import/legacy-staffing-plan";\nimport type { LocalProject } from "../lib/local/api";\nimport { buildSchoolProjectForGeneration } from "../lib/local/school-project-generation";\nimport { createTeachingPlanFromAllocationDraft } from "../lib/local/teaching-plan-from-allocation-draft";\nimport {\n  SCHOOL_CLASS_CODES,\n  createTeachingPlanClass,\n} from "../lib/local/teaching-plan-school";\nimport { enforceMandatorySchoolSplits } from "../lib/local/teaching-plan-school-v3";\n\nfunction emptyProject(): LocalProject {\n  return {\n    schemaVersion: 1,\n    id: "local-school-year",\n    schoolName: "Test",\n    label: "2026/2027",\n    status: "ACTIVE",\n    periodsPerDay: [8, 8, 8, 8, 7],\n    version: 1,\n    updatedAt: "test",\n    teachers: [],\n    classes: [],\n    subjects: [],\n    roomTypes: [],\n    rooms: [],\n    assignments: [],\n    availability: [],\n    fixedLessons: [],\n    importBatches: [],\n    generationRuns: [],\n    timetableVersions: [],\n  };\n}\n\nfunction writeClass(\n  worksheet: ExcelJS.Worksheet,\n  row: number,\n  classCode: string,\n  teachers: string,\n): void {\n  worksheet.getCell(row, 1).value = classCode;\n  worksheet.getCell(row, 2).value = "Třídní Učitel";\n  worksheet.getCell(row + 1, 1).value = "Předměty";\n  worksheet.getCell(row + 1, 2).value = "Učitel/učitelka";\n  worksheet.getCell(row + 1, 3).value = "Časová dotace";\n  worksheet.getCell(row + 2, 1).value = "Tv";\n  worksheet.getCell(row + 2, 2).value = teachers;\n  worksheet.getCell(row + 2, 3).value = 5;\n}\n\nfunction teacherTvHours(\n  analysis: NonNullable<ReturnType<typeof analyzeLegacyStaffingPlan>>,\n  lastName: string,\n): number {\n  const teacher = analysis.plan.teachers.find((item) => item.lastName === lastName);\n  assert.ok(teacher, \`Missing teacher \${lastName}\`);\n  return (\n    teacher.subjectLoads.find((item) => item.subjectCode === "TV")\n      ?.weeklyPeriods ?? 0\n  );\n}\n\ntest("legacy TV keeps a third parallel teacher through import, plan and solver", () => {\n  const workbook = new ExcelJS.Workbook();\n  const worksheet = workbook.addWorksheet("Úvazky 20262027");\n  writeClass(worksheet, 2, "6.B", "Alpha/Beta/Gamma");\n  writeClass(worksheet, 8, "8.B", "Beta/Delta/Epsilon");\n\n  const analysis = analyzeLegacyStaffingPlan(workbook);\n  assert.ok(analysis?.allocationDraft);\n  if (!analysis?.allocationDraft) throw new Error("Legacy draft was not created.");\n\n  assert.equal(teacherTvHours(analysis, "Gamma"), 5);\n  assert.equal(teacherTvHours(analysis, "Epsilon"), 5);\n  assert.equal(teacherTvHours(analysis, "Beta"), 10);\n\n  const tv6B = analysis.allocationDraft.rows.find(\n    (row) => row.classCode === "6.B" && row.subjectCode === "TV",\n  );\n  const tv8B = analysis.allocationDraft.rows.find(\n    (row) => row.classCode === "8.B" && row.subjectCode === "TV",\n  );\n  assert.equal(tv6B?.teacherIds.length, 3);\n  assert.equal(tv8B?.teacherIds.length, 3);\n\n  const draftPlan = createTeachingPlanFromAllocationDraft(analysis.allocationDraft);\n  draftPlan.classes = SCHOOL_CLASS_CODES.map((code) =>\n    createTeachingPlanClass(code),\n  );\n  const plan = enforceMandatorySchoolSplits(draftPlan);\n  const planned6B = plan.rows.find(\n    (row) => row.classCode === "6.B" && row.subjectCode === "TV",\n  );\n  assert.equal(planned6B?.organization, "SPLIT");\n  assert.equal(planned6B?.splitGroupCount, 3);\n  assert.ok(planned6B?.tertiaryTeacherId);\n\n  const generated = buildSchoolProjectForGeneration({\n    existingProject: emptyProject(),\n    staffingPlan: analysis.plan,\n    teachingPlan: plan,\n    forceReplaceGeneratedData: false,\n  });\n  assert.deepEqual(generated.blockers, []);\n\n  const class6B = generated.project.classes.find((item) => item.code === "6.B");\n  assert.ok(class6B);\n  const assignments6B = generated.project.assignments.filter(\n    (item) => item.classId === class6B.id,\n  );\n  assert.equal(assignments6B.length, 3);\n  assert.deepEqual(\n    assignments6B.map((item) => item.group).sort(),\n    ["GROUP_1", "GROUP_2", "GROUP_3"],\n  );\n  assert.equal(new Set(assignments6B.map((item) => item.parallelKey)).size, 1);\n});\n`;

await writeFile(
  "apps/web/tests/three-teacher-legacy-import.test.ts",
  regressionTest,
  "utf8",
);
