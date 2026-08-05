from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(
            f"{path}: expected one match, found {count}: {old[:100]!r}"
        )
    file.write_text(text.replace(old, new, 1))


# Domain model: targetWeeklyLoad remains total load for compatibility.
path = "apps/web/lib/local/staffing-plan.ts"
replace_once(
    path,
    'export const MAX_WEEKLY_TEACHER_LOAD = 22;\n',
    'export const MAX_WEEKLY_TEACHER_LOAD = 22;\nexport const MAX_WEEKLY_TEACHER_TOTAL_LOAD = 60;\n',
)
replace_once(
    path,
    '  targetWeeklyLoad: number;\n  subjectLoads: StaffingSubjectLoad[];\n',
    '  /** Total weekly load including overtime. */\n  targetWeeklyLoad: number;\n  /** Contractual/base load. Older saved plans omit this and are migrated automatically. */\n  baseWeeklyLoad?: number;\n  subjectLoads: StaffingSubjectLoad[];\n',
)
replace_once(
    path,
    '    targetWeeklyLoad: 22,\n    subjectLoads: [createEmptySubjectLoad()],\n',
    '    targetWeeklyLoad: 22,\n    baseWeeklyLoad: 22,\n    subjectLoads: [createEmptySubjectLoad()],\n',
)
replace_once(
    path,
    'export function assignedWeeklyLoad(teacher: StaffingTeacher): number {\n',
    '''export function baseWeeklyLoad(teacher: StaffingTeacher): number {
  if (Number.isFinite(teacher.baseWeeklyLoad)) {
    return Number(teacher.baseWeeklyLoad);
  }
  const total = Number.isFinite(teacher.targetWeeklyLoad)
    ? Number(teacher.targetWeeklyLoad)
    : 0;
  return Math.min(total, MAX_WEEKLY_TEACHER_LOAD);
}

export function overtimeWeeklyLoad(teacher: StaffingTeacher): number {
  const total = Number.isFinite(teacher.targetWeeklyLoad)
    ? Number(teacher.targetWeeklyLoad)
    : 0;
  return total - baseWeeklyLoad(teacher);
}

export function assignedWeeklyLoad(teacher: StaffingTeacher): number {
''',
)
replace_once(
    path,
    '''  const target = Number.isFinite(teacher.targetWeeklyLoad)
    ? teacher.targetWeeklyLoad
    : 0;

  if (!teacher.firstName.trim()) messages.push("Doplňte jméno.");
  if (!teacher.lastName.trim()) messages.push("Doplňte příjmení.");
  if (
    !Number.isInteger(target) ||
    target < 0 ||
    target > MAX_WEEKLY_TEACHER_LOAD
  ) {
    messages.push(
      `Úvazek musí být celé číslo od 0 do ${MAX_WEEKLY_TEACHER_LOAD} hodin.`,
    );
  }
''',
    '''  const target = Number.isFinite(teacher.targetWeeklyLoad)
    ? teacher.targetWeeklyLoad
    : 0;
  const baseLoad = baseWeeklyLoad(teacher);
  const overtimeLoad = overtimeWeeklyLoad(teacher);

  if (!teacher.firstName.trim()) messages.push("Doplňte jméno.");
  if (!teacher.lastName.trim()) messages.push("Doplňte příjmení.");
  if (
    !Number.isInteger(baseLoad) ||
    baseLoad < 0 ||
    baseLoad > MAX_WEEKLY_TEACHER_LOAD
  ) {
    messages.push(
      `Základní úvazek musí být celé číslo od 0 do ${MAX_WEEKLY_TEACHER_LOAD} hodin.`,
    );
  }
  if (!Number.isInteger(overtimeLoad) || overtimeLoad < 0) {
    messages.push("Nadúvazek musí být celé nezáporné číslo.");
  }
  if (
    !Number.isInteger(target) ||
    target < 0 ||
    target > MAX_WEEKLY_TEACHER_TOTAL_LOAD
  ) {
    messages.push(
      `Celkem musí být celé číslo od 0 do ${MAX_WEEKLY_TEACHER_TOTAL_LOAD} hodin.`,
    );
  }
''',
)
replace_once(
    path,
    '''      targetWeeklyLoad: Number.isFinite(teacher.targetWeeklyLoad)
        ? Number(teacher.targetWeeklyLoad)
        : 0,
      subjectLoads: Array.isArray(teacher.subjectLoads)
''',
    '''      targetWeeklyLoad: Number.isFinite(teacher.targetWeeklyLoad)
        ? Number(teacher.targetWeeklyLoad)
        : 0,
      baseWeeklyLoad: Number.isFinite(teacher.baseWeeklyLoad)
        ? Number(teacher.baseWeeklyLoad)
        : Math.min(
            Number.isFinite(teacher.targetWeeklyLoad)
              ? Number(teacher.targetWeeklyLoad)
              : 0,
            MAX_WEEKLY_TEACHER_LOAD,
          ),
      subjectLoads: Array.isArray(teacher.subjectLoads)
''',
)

# Standard workbook.
path = "apps/web/lib/import/staffing-workbook.ts"
replace_once(
    path,
    '      targetWeeklyLoad: target ?? 0,\n      subjectLoads,\n',
    '      targetWeeklyLoad: target ?? 0,\n      baseWeeklyLoad: Math.min(target ?? 0, 22),\n      subjectLoads,\n',
)
replace_once(
    path,
    '    "Každý učitel je jeden řádek. Celkový úvazek musí přesně odpovídat součtu hodin jednotlivých předmětů.";\n',
    '    "Každý učitel je jeden řádek. Celkem musí přesně odpovídat součtu předmětů; hodiny nad 22 se v aplikaci zobrazí jako nadúvazek.";\n',
)

# Legacy workbook.
path = "apps/web/lib/import/legacy-staffing-plan.ts"
replace_once(
    path,
    '''      if (targetWeeklyLoad > MAX_WEEKLY_TEACHER_LOAD) {
        const overload = targetWeeklyLoad - MAX_WEEKLY_TEACHER_LOAD;
        issues.push(
          issue(
            "ERROR",
            null,
            "Úvazek",
            `${teacher.firstName} ${teacher.lastName} má úvazek ${targetWeeklyLoad} hodin. Maximum je ${MAX_WEEKLY_TEACHER_LOAD} hodin; ${overload} ${overload === 1 ? "hodinu je" : overload < 5 ? "hodiny je" : "hodin je"} nutné přidělit jinému učiteli.`,
          ),
        );
      }
''',
    '''      if (targetWeeklyLoad > MAX_WEEKLY_TEACHER_LOAD) {
        const overtime = targetWeeklyLoad - MAX_WEEKLY_TEACHER_LOAD;
        issues.push(
          issue(
            "WARNING",
            null,
            "Nadúvazek",
            `${teacher.firstName} ${teacher.lastName}: ${MAX_WEEKLY_TEACHER_LOAD} h základní úvazek + ${overtime} h nadúvazek = ${targetWeeklyLoad} h celkem.`,
          ),
        );
      }
''',
)
replace_once(
    path,
    '''        targetWeeklyLoad,
        subjectLoads,
        unavailableDays: [],
''',
    '''        targetWeeklyLoad,
        baseWeeklyLoad: Math.min(
          targetWeeklyLoad,
          MAX_WEEKLY_TEACHER_LOAD,
        ),
        subjectLoads,
        unavailableDays: [],
''',
)

# Solver preparation.
path = "apps/web/lib/local/school-project-generation.ts"
replace_once(
    path,
    '''  MAX_WEEKLY_TEACHER_LOAD,
  STAFFING_DAYS,
  teacherCodesForPlan,
''',
    '''  STAFFING_DAYS,
  overtimeWeeklyLoad,
  teacherCodesForPlan,
''',
)
replace_once(
    path,
    '''    if (teacher.targetWeeklyLoad > MAX_WEEKLY_TEACHER_LOAD) {
      blockers.push(
        `${teacher.firstName} ${teacher.lastName} má smluveno ${teacher.targetWeeklyLoad} hodin, maximum je ${MAX_WEEKLY_TEACHER_LOAD} hodin.`,
      );
    }
''',
    '''    const overtime = overtimeWeeklyLoad(teacher);
    if (overtime > 0) {
      warnings.push(
        `${teacher.firstName} ${teacher.lastName}: plán počítá s ${overtime} h nadúvazku.`,
      );
    }
''',
)

# Staffing UI.
path = "apps/web/app/staffing/page.tsx"
replace_once(
    path,
    '''  STAFFING_DAYS,
  MAX_WEEKLY_TEACHER_LOAD,
  STAFFING_SUBJECTS,
  assignedWeeklyLoad,
''',
    '''  STAFFING_DAYS,
  MAX_WEEKLY_TEACHER_LOAD,
  MAX_WEEKLY_TEACHER_TOTAL_LOAD,
  STAFFING_SUBJECTS,
  assignedWeeklyLoad,
  baseWeeklyLoad,
''',
)
replace_once(
    path,
    '''  loadStaffingPlan,
  saveStaffingPlan,
  teacherCodesForPlan,
''',
    '''  loadStaffingPlan,
  overtimeWeeklyLoad,
  saveStaffingPlan,
  teacherCodesForPlan,
''',
)
replace_once(
    path,
    '''    targetWeeklyLoad: teacher.targetWeeklyLoad,
    subjectLoads: teacher.subjectLoads,
''',
    '''    targetWeeklyLoad: teacher.targetWeeklyLoad,
    baseWeeklyLoad: baseWeeklyLoad(teacher),
    subjectLoads: teacher.subjectLoads,
''',
)
replace_once(
    path,
    '        description="Nejdřív zapište pouze lidi, jejich celkový úvazek, rozdělení hodin mezi předměty a celé dny, kdy nemohou učit. Každou kartu uložte samostatně."\n',
    '        description="Zapište základní úvazek, případný nadúvazek, rozdělení hodin mezi předměty a celé dny, kdy učitel nemůže. Každou kartu uložte samostatně."\n',
)
replace_once(
    path,
    '''          const percentage =
            teacher.targetWeeklyLoad > 0
''',
    '''          const baseLoad = baseWeeklyLoad(teacher);
          const overtimeLoad = overtimeWeeklyLoad(teacher);
          const percentage =
            teacher.targetWeeklyLoad > 0
''',
)
replace_once(
    path,
    '''                    <p className="text-xs text-text-muted">
                      {validation.assignedWeeklyLoad} z{" "}
                      {teacher.targetWeeklyLoad} hodin
                    </p>
''',
    '''                    <p className="text-xs text-text-muted">
                      {validation.assignedWeeklyLoad} z{" "}
                      {teacher.targetWeeklyLoad} hodin
                      {overtimeLoad > 0
                        ? ` · ${baseLoad} základ + ${overtimeLoad} nadúvazek`
                        : ""}
                    </p>
''',
)
replace_once(
    path,
    '                <div className="grid gap-4 md:grid-cols-[1fr_1fr_180px]">\n',
    '                <div className="grid gap-4 md:grid-cols-[1fr_1fr_180px_180px]">\n',
)
replace_once(
    path,
    '''                  <label className="space-y-1.5 text-sm font-medium text-text-primary">
                    Úvazek týdně
                    <div className="relative">
                      <input
                        type="number"
                        min={0}
                        max={MAX_WEEKLY_TEACHER_LOAD}
                        step={1}
                        value={teacher.targetWeeklyLoad}
                        onChange={(event) =>
                          updateTeacher(teacher.id, (current) => ({
                            ...current,
                            targetWeeklyLoad: numberValue(event.target.value),
                          }))
                        }
                        className={`${inputClass} pr-9`}
                      />
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-text-muted">
                        h
                      </span>
                    </div>
                  </label>
                </div>

                <div>
''',
    '''                  <label className="space-y-1.5 text-sm font-medium text-text-primary">
                    Základní úvazek (max. 22 h)
                    <div className="relative">
                      <input
                        aria-label="Úvazek týdně"
                        type="number"
                        min={0}
                        max={MAX_WEEKLY_TEACHER_LOAD}
                        step={1}
                        value={baseLoad}
                        onChange={(event) => {
                          const nextBase = numberValue(event.target.value);
                          updateTeacher(teacher.id, (current) => ({
                            ...current,
                            baseWeeklyLoad: nextBase,
                            targetWeeklyLoad:
                              nextBase + overtimeWeeklyLoad(current),
                          }));
                        }}
                        className={`${inputClass} pr-9`}
                      />
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-text-muted">
                        h
                      </span>
                    </div>
                  </label>
                  <label className="space-y-1.5 text-sm font-medium text-text-primary">
                    Nadúvazek / přesčas
                    <div className="relative">
                      <input
                        aria-label="Nadúvazek týdně"
                        type="number"
                        min={0}
                        max={Math.max(
                          0,
                          MAX_WEEKLY_TEACHER_TOTAL_LOAD - baseLoad,
                        )}
                        step={1}
                        value={overtimeLoad}
                        onChange={(event) => {
                          const nextOvertime = numberValue(event.target.value);
                          updateTeacher(teacher.id, (current) => ({
                            ...current,
                            baseWeeklyLoad: baseWeeklyLoad(current),
                            targetWeeklyLoad:
                              baseWeeklyLoad(current) + nextOvertime,
                          }));
                        }}
                        className={`${inputClass} pr-9`}
                      />
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-text-muted">
                        h
                      </span>
                    </div>
                  </label>
                </div>
                <div className="rounded-xl border border-primary/20 bg-primary-subtle px-4 py-3 text-sm text-text-secondary">
                  <strong className="text-text-primary">
                    Celkem k rozdělení: {teacher.targetWeeklyLoad} h
                  </strong>{" "}
                  · {baseLoad} h základní úvazek + {overtimeLoad} h nadúvazek
                </div>

                <div>
''',
)

# Unit tests.
Path("apps/web/tests/manual-staffing-save.test.ts").write_text(
    '''import assert from "node:assert/strict";
import test from "node:test";

import {
  baseWeeklyLoad,
  createEmptyStaffingTeacher,
  overtimeWeeklyLoad,
  validateStaffingTeacher,
} from "../lib/local/staffing-plan";

test("legacy 25-hour total is interpreted as 22 base plus 3 overtime", () => {
  const teacher = {
    ...createEmptyStaffingTeacher(),
    firstName: "Testovací",
    lastName: "Učitelka",
    targetWeeklyLoad: 25,
    baseWeeklyLoad: undefined,
    subjectLoads: [
      {
        id: "manual-save-load",
        subjectCode: "M",
        weeklyPeriods: 25,
      },
    ],
  };

  const validation = validateStaffingTeacher(teacher);

  assert.equal(baseWeeklyLoad(teacher), 22);
  assert.equal(overtimeWeeklyLoad(teacher), 3);
  assert.equal(validation.assignedWeeklyLoad, 25);
  assert.equal(validation.valid, true);
});

test("base load above 22 remains a blocking validation error", () => {
  const teacher = {
    ...createEmptyStaffingTeacher(),
    firstName: "Testovací",
    lastName: "Učitelka",
    baseWeeklyLoad: 23,
    targetWeeklyLoad: 23,
    subjectLoads: [
      {
        id: "invalid-base-load",
        subjectCode: "M",
        weeklyPeriods: 23,
      },
    ],
  };

  const validation = validateStaffingTeacher(teacher);

  assert.equal(validation.valid, false);
  assert.match(
    validation.messages.join(" "),
    /Základní úvazek musí být celé číslo od 0 do 22 hodin/,
  );
});
'''
)

# Browser regression.
path = "apps/web/e2e/staffing.spec.ts"
replace_once(
    path,
    'test("invalid teacher is saved only after its card button is pressed", async ({\n',
    'test("teacher with three overtime hours can be completed and saved", async ({\n',
)
replace_once(
    path,
    '''  await page.getByLabel("Úvazek týdně").fill("25");
  await page.locator('select[aria-label="Předmět"]').selectOption("M");
  await page.locator('input[aria-label="Počet hodin předmětu"]').fill("22");

  await expect(page.getByTestId("staffing-manual-save-status")).toContainText(
    "1 neuložená karta",
  );
  await expect(
    page.getByText("Úvazek musí být celé číslo od 0 do 22 hodin.", {
      exact: true,
    }),
  ).toBeVisible();
''',
    '''  await page.getByLabel("Úvazek týdně").fill("22");
  await page.getByLabel("Nadúvazek týdně").fill("3");
  await page.locator('select[aria-label="Předmět"]').selectOption("M");
  await page.locator('input[aria-label="Počet hodin předmětu"]').fill("25");

  await expect(page.getByTestId("staffing-manual-save-status")).toContainText(
    "1 neuložená karta",
  );
  await expect(page.getByText("25 / 25 h", { exact: true })).toBeVisible();
  await expect(page.getByText("Úvazek sedí", { exact: true })).toBeVisible();
''',
)
replace_once(
    path,
    '''  await expect(page.getByLabel("Úvazek týdně")).toHaveValue("25");
  await expect(
    page.locator('input[aria-label="Počet hodin předmětu"]'),
  ).toHaveValue("22");
''',
    '''  await expect(page.getByLabel("Úvazek týdně")).toHaveValue("22");
  await expect(page.getByLabel("Nadúvazek týdně")).toHaveValue("3");
  await expect(
    page.locator('input[aria-label="Počet hodin předmětu"]'),
  ).toHaveValue("25");
''',
)

# Real legacy import regression.
path = "apps/web/e2e/actual-2027-workbook.spec.ts"
replace_once(
    path,
    '  await expect(page.getByText(/Maximum je 22 hodin/).first()).toBeVisible();\n',
    '  await expect(page.getByText(/základní úvazek.*nadúvazek/).first()).toBeVisible();\n',
)
replace_once(
    path,
    '          teachers: Array<{ targetWeeklyLoad: number }>;\n',
    '''          teachers: Array<{
            targetWeeklyLoad: number;
            baseWeeklyLoad?: number;
          }>;
''',
)
replace_once(
    path,
    '''  expect(
    storedStaffing?.teachers.some((teacher) => teacher.targetWeeklyLoad > 22),
  ).toBe(true);
''',
    '''  expect(
    storedStaffing?.teachers.some(
      (teacher) =>
        teacher.targetWeeklyLoad > 22 && teacher.baseWeeklyLoad === 22,
    ),
  ).toBe(true);
''',
)
