from pathlib import Path


def replace(path: str, old: str, new: str, count: int = 1) -> None:
    target = Path(path)
    text = target.read_text()
    if text.count(old) < count:
        raise RuntimeError(f"{path}: expected patch target not found: {old[:120]!r}")
    target.write_text(text.replace(old, new, count))


path = "apps/web/lib/import/teaching-plan-workbook.ts"

replace(
    path,
    'styleTitle(plan, "A1:J1", "KROK 2B · BĚŽNÁ A DĚLENÁ VÝUKA");\n  plan.mergeCells("A2:J2");',
    'styleTitle(plan, "A1:K1", "KROK 2B · BĚŽNÁ A DĚLENÁ VÝUKA");\n  plan.mergeCells("A2:K2");',
)
replace(
    path,
    '"Jeden řádek = jeden předmět v jedné třídě. Zde vyplňujte celou třídu nebo dvě skupiny se stejným předmětem.";',
    '"Jeden řádek = jeden předmět v jedné třídě. Standardně použijte celou třídu nebo dvě skupiny; u angličtiny lze vyplnit i třetí souběžnou skupinu.";',
)
replace(path, 'plan.mergeCells("A3:J3");', 'plan.mergeCells("A3:K3");')
replace(path, 'plan.mergeCells("A4:J4");', 'plan.mergeCells("A4:K4");')
replace(
    path,
    '"Příklad VV 2 h: Pouze dvojhodiny. Příklad dělené INF: Dvě skupiny + dva různí učitelé.";',
    '"Příklad VV 2 h: Pouze dvojhodiny. Dělená INF má dvě skupiny; třetí skupina je určena pouze pro souběžnou angličtinu.";',
)
replace(
    path,
    '''    "Učitel / skupina 1 *",\n    "Učitel skupiny 2",\n    "Náhled týdne",\n    "Kontrola",\n''',
    '''    "Učitel / skupina 1 *",\n    "Učitel skupiny 2",\n    "Učitel skupiny 3 (jen AJ)",\n    "Náhled týdne",\n    "Kontrola",\n''',
)
replace(
    path,
    '''    { width: 30 },\n    { width: 30 },\n    { width: 34 },\n    { width: 22 },\n''',
    '''    { width: 30 },\n    { width: 30 },\n    { width: 30 },\n    { width: 34 },\n    { width: 22 },\n''',
)
replace(
    path,
    '''  addListValidation(\n    plan,\n    8,\n    `'${DICTIONARY_SHEET}'!$H$2:$H$${teacherLastRow}`,\n    PLAN_FIRST_ROW,\n  );\n  addWholeNumberValidation(plan, 3, PLAN_FIRST_ROW, 1, 20);\n''',
    '''  addListValidation(\n    plan,\n    8,\n    `'${DICTIONARY_SHEET}'!$H$2:$H$${teacherLastRow}`,\n    PLAN_FIRST_ROW,\n  );\n  addListValidation(\n    plan,\n    9,\n    `'${DICTIONARY_SHEET}'!$H$2:$H$${teacherLastRow}`,\n    PLAN_FIRST_ROW,\n  );\n  addWholeNumberValidation(plan, 3, PLAN_FIRST_ROW, 1, 20);\n''',
)
replace(
    path,
    '''    plan.getCell(row, 9).value = {\n      formula: `IF(COUNTA(A${row}:H${row})=0,"",IF(D${row}="Samostatné hodiny",C${row}&"× samostatná",IF(D${row}="Pouze dvojhodiny",C${row}/2&"× dvojhodina",E${row}&"× dvojhodina + "&(C${row}-2*E${row})&"× samostatná")))`,\n      result: "",\n    };\n    plan.getCell(row, 10).value = {\n      formula: `IF(COUNTA(A${row}:H${row})=0,"",IF(OR(A${row}="",B${row}="",C${row}="",D${row}="",F${row}="",G${row}=""),"DOPLNIT",IF(AND(D${row}="Pouze dvojhodiny",MOD(C${row},2)=1),"LICHÝ POČET",IF(AND(F${row}="Dvě skupiny",OR(H${row}="",G${row}=H${row})),"DOPLNIT 2. UČITELE",IF(AND(D${row}="Kombinace",OR(E${row}="",2*E${row}>=C${row})),"OPRAVIT KOMBINACI","SEDÍ")))))`,\n      result: "",\n    };\n    plan.getCell(row, 9).fill = {\n''',
    '''    plan.getCell(row, 10).value = {\n      formula: `IF(COUNTA(A${row}:I${row})=0,"",IF(D${row}="Samostatné hodiny",C${row}&"× samostatná",IF(D${row}="Pouze dvojhodiny",C${row}/2&"× dvojhodina",E${row}&"× dvojhodina + "&(C${row}-2*E${row})&"× samostatná")))`,\n      result: "",\n    };\n    plan.getCell(row, 11).value = {\n      formula: `IF(COUNTA(A${row}:I${row})=0,"",IF(OR(A${row}="",B${row}="",C${row}="",D${row}="",F${row}="",G${row}=""),"DOPLNIT",IF(AND(D${row}="Pouze dvojhodiny",MOD(C${row},2)=1),"LICHÝ POČET",IF(AND(F${row}="Dvě skupiny",OR(H${row}="",G${row}=H${row})),"DOPLNIT 2. UČITELE",IF(AND(I${row}<>"",OR(B${row}<>"JAZ1",I${row}=G${row},I${row}=H${row})),"OPRAVIT 3. SKUPINU",IF(AND(D${row}="Kombinace",OR(E${row}="",2*E${row}>=C${row})),"OPRAVIT KOMBINACI","SEDÍ"))))))`,\n      result: "",\n    };\n    plan.getCell(row, 10).fill = {\n''',
)
replace(path, 'plan.getCell(row, 10).fill = {\n      type: "pattern",\n      pattern: "solid",\n      fgColor: { argb: COLORS.paleGreen },\n    };\n    plan.getCell(row, 10).font = { bold: true };', 'plan.getCell(row, 11).fill = {\n      type: "pattern",\n      pattern: "solid",\n      fgColor: { argb: COLORS.paleGreen },\n    };\n    plan.getCell(row, 11).font = { bold: true };')
replace(
    path,
    '''    plan.getCell(row, 8).value =\n      item.organization === "SPLIT"\n        ? teacherName(item.secondaryTeacherId, teacherLabels)\n        : null;\n''',
    '''    plan.getCell(row, 8).value =\n      item.organization === "SPLIT"\n        ? teacherName(item.secondaryTeacherId, teacherLabels)\n        : null;\n    plan.getCell(row, 9).value =\n      item.organization === "SPLIT" &&\n      item.subjectCode === "JAZ1" &&\n      item.splitGroupCount === 3\n        ? teacherName(item.tertiaryTeacherId ?? "", teacherLabels)\n        : null;\n''',
)
replace(
    path,
    '''    const values = Array.from({ length: 8 }, (_, index) =>\n      cellText(planSheet.getCell(row, index + 1)),\n    );\n''',
    '''    const values = Array.from({ length: 9 }, (_, index) =>\n      cellText(planSheet.getCell(row, index + 1)),\n    );\n''',
)
replace(
    path,
    '''      rawPrimaryTeacher,\n      rawSecondaryTeacher,\n    ] = values;\n''',
    '''      rawPrimaryTeacher,\n      rawSecondaryTeacher,\n      rawTertiaryTeacher,\n    ] = values;\n''',
)
replace(
    path,
    '''    const primaryTeacherId = resolveTeacher(rawPrimaryTeacher!);\n    const secondaryTeacherId = resolveTeacher(rawSecondaryTeacher!);\n''',
    '''    const primaryTeacherId = resolveTeacher(rawPrimaryTeacher!);\n    const secondaryTeacherId = resolveTeacher(rawSecondaryTeacher!);\n    const tertiaryTeacherId = resolveTeacher(rawTertiaryTeacher!);\n    const threeGroupEnglish =\n      organization === "SPLIT" &&\n      subjectCode === "JAZ1" &&\n      Boolean(rawTertiaryTeacher);\n''',
    1,
)
replace(
    path,
    '''    if (organization === "SPLIT" && !secondaryTeacherId) {\n      issue(\n        issues,\n        TEACHING_PLAN_SHEET,\n        row,\n        "Učitel skupiny 2",\n        "U dělené výuky vyberte druhého učitele.",\n      );\n    }\n\n    plan.rows.push({\n''',
    '''    if (organization === "SPLIT" && !secondaryTeacherId) {\n      issue(\n        issues,\n        TEACHING_PLAN_SHEET,\n        row,\n        "Učitel skupiny 2",\n        "U dělené výuky vyberte druhého učitele.",\n      );\n    }\n    if (rawTertiaryTeacher && !threeGroupEnglish) {\n      issue(\n        issues,\n        TEACHING_PLAN_SHEET,\n        row,\n        "Učitel skupiny 3",\n        "Třetí souběžná skupina je podporována pouze u dělené angličtiny (JAZ1).",\n      );\n    }\n    if (threeGroupEnglish && !tertiaryTeacherId) {\n      issue(\n        issues,\n        TEACHING_PLAN_SHEET,\n        row,\n        "Učitel skupiny 3",\n        "Vyberte třetího učitele angličtiny ze seznamu vytvořeného v Kroku 1.",\n      );\n    }\n\n    plan.rows.push({\n''',
)
replace(
    path,
    '''      primaryTeacherId,\n      secondaryTeacherId: organization === "SPLIT" ? secondaryTeacherId : "",\n    });\n''',
    '''      primaryTeacherId,\n      secondaryTeacherId: organization === "SPLIT" ? secondaryTeacherId : "",\n      tertiaryTeacherId: threeGroupEnglish ? tertiaryTeacherId : "",\n      splitGroupCount: threeGroupEnglish ? 3 : 2,\n    });\n''',
    1,
)

# Roundtrip test with an explicit three-group English row and reject GROUP_3 on TV.
test_path = "apps/web/tests/teaching-plan-workbook.test.ts"
replace(
    test_path,
    '''      {\n        id: "teacher-vas",\n        firstName: "N.",\n        lastName: "Vašáková",\n        targetWeeklyLoad: 1,\n        unavailableDays: [],\n        subjectLoads: [{ id: "vas-inf", subjectCode: "INF", weeklyPeriods: 1 }],\n      },\n''',
    '''      {\n        id: "teacher-vas",\n        firstName: "N.",\n        lastName: "Vašáková",\n        targetWeeklyLoad: 1,\n        unavailableDays: [],\n        subjectLoads: [{ id: "vas-inf", subjectCode: "INF", weeklyPeriods: 1 }],\n      },\n      {\n        id: "teacher-aj-one",\n        firstName: "A.",\n        lastName: "English",\n        targetWeeklyLoad: 3,\n        unavailableDays: [],\n        subjectLoads: [{ id: "aj-one", subjectCode: "JAZ1", weeklyPeriods: 3 }],\n      },\n      {\n        id: "teacher-aj-two",\n        firstName: "B.",\n        lastName: "English",\n        targetWeeklyLoad: 3,\n        unavailableDays: [],\n        subjectLoads: [{ id: "aj-two", subjectCode: "JAZ1", weeklyPeriods: 3 }],\n      },\n      {\n        id: "teacher-aj-three",\n        firstName: "C.",\n        lastName: "English",\n        targetWeeklyLoad: 3,\n        unavailableDays: [],\n        subjectLoads: [{ id: "aj-three", subjectCode: "JAZ1", weeklyPeriods: 3 }],\n      },\n''',
)
with Path(test_path).open("a") as handle:
    handle.write('''\n\ntest("workbook roundtrips three simultaneous English groups", async () => {\n  const source = validPlan();\n  const english = {\n    ...createTeachingPlanRow("8.A", "JAZ1"),\n    id: "row-aj-three-groups",\n    weeklyPeriods: 3,\n    organization: "SPLIT" as const,\n    primaryTeacherId: "teacher-aj-one",\n    secondaryTeacherId: "teacher-aj-two",\n    tertiaryTeacherId: "teacher-aj-three",\n    splitGroupCount: 3 as const,\n  };\n  source.rows.push(english);\n\n  const analysis = await analyzeTeachingPlanWorkbook(\n    await createTeachingPlanWorkbook(staffingPlan(), source),\n    staffingPlan(),\n  );\n\n  assert.equal(analysis.valid, true);\n  const imported = analysis.plan.rows.find(\n    (row) => row.id === "teaching-row-8",\n  );\n  assert.equal(imported?.subjectCode, "JAZ1");\n  assert.equal(imported?.splitGroupCount, 3);\n  assert.equal(imported?.primaryTeacherId, "teacher-aj-one");\n  assert.equal(imported?.secondaryTeacherId, "teacher-aj-two");\n  assert.equal(imported?.tertiaryTeacherId, "teacher-aj-three");\n});\n\ntest("workbook rejects a third group outside English", async () => {\n  const workbook = new ExcelJS.Workbook();\n  await workbook.xlsx.load(\n    (await createTeachingPlanWorkbook(staffingPlan(), validPlan())) as never,\n  );\n  const worksheet = workbook.getWorksheet(TEACHING_PLAN_SHEET);\n  assert.ok(worksheet);\n  worksheet.getCell("I7").value = "CEN · C. English";\n\n  const analysis = await analyzeTeachingPlanWorkbook(\n    new Uint8Array(await workbook.xlsx.writeBuffer()),\n    staffingPlan(),\n  );\n\n  assert.equal(analysis.valid, false);\n  assert.ok(\n    analysis.issues.some((issue) =>\n      issue.message.includes("pouze u dělené angličtiny"),\n    ),\n  );\n});\n''')

print("group 3 teaching-plan workbook roundtrip patched")
