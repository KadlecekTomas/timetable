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

await update("apps/web/lib/import/school-curriculum-workbook.ts", (source) => {
  let next = replaceOnce(
    source,
    `  const group1 = candidates.find((item) => item.group === "GROUP_1");\n  const group2 = candidates.find((item) => item.group === "GROUP_2");\n  const whole = candidates.find((item) => item.group === "WHOLE");`,
    `  const group1 = candidates.find((item) => item.group === "GROUP_1");\n  const group2 = candidates.find((item) => item.group === "GROUP_2");\n  const group3 = candidates.find((item) => item.group === "GROUP_3");\n  const whole = candidates.find((item) => item.group === "WHOLE");`,
    "curriculum group3 lookup",
  );
  next = replaceOnce(
    next,
    `  const shouldSplit = explicitGroupCount >= 2 || allTeacherIds.length >= 2;\n\n  if (shouldSplit) {`,
    `  const shouldSplit = explicitGroupCount >= 2 || allTeacherIds.length >= 2;\n  const threeGroups =\n    shouldSplit && (Boolean(group3) || allTeacherIds.length >= 3);\n\n  if (shouldSplit) {`,
    "curriculum three groups flag",
  );
  next = replaceOnce(
    next,
    `    const secondaryTeacherId = group2\n      ? (group2.teacherIds[0] ?? "")\n      : (allTeacherIds.find((teacherId) => teacherId !== primaryTeacherId) ??\n        "");\n    if (!primaryTeacherId || !secondaryTeacherId) {`,
    `    const secondaryTeacherId = group2\n      ? (group2.teacherIds[0] ?? "")\n      : (allTeacherIds.find((teacherId) => teacherId !== primaryTeacherId) ??\n        "");\n    const tertiaryTeacherId = group3\n      ? (group3.teacherIds[0] ?? "")\n      : (allTeacherIds.find(\n          (teacherId) =>\n            teacherId !== primaryTeacherId && teacherId !== secondaryTeacherId,\n        ) ?? "");\n    if (\n      !primaryTeacherId ||\n      !secondaryTeacherId ||\n      (threeGroups && !tertiaryTeacherId)\n    ) {`,
    "curriculum tertiary teacher",
  );
  next = replaceOnce(
    next,
    `          group1?.sourceSheet ?? group2?.sourceSheet ?? sheetName,\n          group1?.sourceRow ?? group2?.sourceRow ?? null,`,
    `          group1?.sourceSheet ??\n            group2?.sourceSheet ??\n            group3?.sourceSheet ??\n            sheetName,\n          group1?.sourceRow ?? group2?.sourceRow ?? group3?.sourceRow ?? null,`,
    "curriculum issue source",
  );
  next = replaceOnce(
    next,
    `    return {\n      ...row,\n      organization: "SPLIT",\n      primaryTeacherId,\n      secondaryTeacherId,\n    };`,
    `    return {\n      ...row,\n      organization: "SPLIT",\n      primaryTeacherId,\n      secondaryTeacherId,\n      tertiaryTeacherId: threeGroups ? tertiaryTeacherId : "",\n      splitGroupCount: threeGroups ? 3 : 2,\n    };`,
    "curriculum split result",
  );
  return next;
});

await update("apps/web/tests/two-source-school-import.test.ts", (source) => {
  let next = replaceOnce(
    source,
    `    for (const [column] of block.classes) {\n      writeSubject(worksheet, block.row + 3, column, "Inf", "Kadleček", 1);\n    }\n  }\n\n  writeSubject(worksheet, 65, 11, "Německý jazyk", "Přikrylová", 3);`,
    `    for (const [column] of block.classes) {\n      writeSubject(worksheet, block.row + 3, column, "Inf", "Kadleček", 1);\n    }\n  }\n\n  // Sportovní 6.B má ve zdrojové matici tři souběžné skupiny TV.\n  writeSubject(worksheet, 45, 7, "Tv", "Alpha/Beta/Gamma", 5);\n\n  writeSubject(worksheet, 65, 11, "Německý jazyk", "Přikrylová", 3);`,
    "two-source triple TV fixture",
  );
  next = replaceOnce(
    next,
    `  const missingGerman = analysis.allocationDraft?.rows.find(\n    (row) =>\n      row.classCode === "8.B" &&\n      row.subjectCode === "JAZ2" &&\n      row.group === "GROUP_1",\n  );\n  assert.deepEqual(missingGerman?.teacherIds, []);`,
    `  const missingGerman = analysis.allocationDraft?.rows.find(\n    (row) =>\n      row.classCode === "8.B" &&\n      row.subjectCode === "JAZ2" &&\n      row.group === "GROUP_1",\n  );\n  assert.deepEqual(missingGerman?.teacherIds, []);\n\n  const tripleTv = analysis.allocationDraft?.rows.find(\n    (row) => row.classCode === "6.B" && row.subjectCode === "TV",\n  );\n  assert.equal(tripleTv?.teacherIds.length, 3);\n  assert.deepEqual(\n    tripleTv?.teacherIds.map((teacherId) =>\n      teacherId.replace("legacy-teacher-", ""),\n    ),\n    ["alpha", "beta", "gamma"],\n  );`,
    "two-source draft assertions",
  );
  next = replaceOnce(
    next,
    `  assert.equal(sportsTv?.weeklyPeriods, 5);\n\n  const language8B`,
    `  assert.equal(sportsTv?.weeklyPeriods, 5);\n  assert.equal(sportsTv?.organization, "SPLIT");\n  assert.equal(sportsTv?.splitGroupCount, 3);\n  assert.match(sportsTv?.primaryTeacherId ?? "", /alpha/);\n  assert.match(sportsTv?.secondaryTeacherId ?? "", /beta/);\n  assert.match(sportsTv?.tertiaryTeacherId ?? "", /gamma/);\n\n  const language8B`,
    "two-source curriculum assertions",
  );
  return next;
});
