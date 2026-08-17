from pathlib import Path
import re


def replace(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    if new in text:
        return
    if old not in text:
        raise SystemExit(f"Missing expected block in {path}: {old[:180]!r}")
    p.write_text(text.replace(old, new))


def sub(path: str, pattern: str, replacement: str) -> None:
    p = Path(path)
    text = p.read_text()
    if replacement in text:
        return
    updated, count = re.subn(pattern, lambda _m: replacement, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f"Pattern did not match exactly once in {path}: {pattern[:180]!r}")
    p.write_text(updated)


path = "apps/web/app/teaching-plan/page.tsx"
replace(
    path,
    'import { LOCAL_SCHOOL_YEAR_ID, localApiFetch } from "@/lib/local/api";\n',
    'import { LOCAL_SCHOOL_YEAR_ID, localApiFetch } from "@/lib/local/api";\nimport { buildSchoolProjectForGeneration } from "@/lib/local/school-project-generation";\n',
)
replace(
    path,
    '''  humanBlockSummary,
  lessonBlockDurations,''',
    '''  humanBlockSummary,
  isSameTeacherPartialSplit,
  lessonBlockDurations,''',
)

# Reuse the exact same project builder used by generation instead of maintaining a second assignment serializer.
sub(
    path,
    r'''      const assignments = plan\.rows\.flatMap\(\(row\) => \{.*?\n      \}\);\n\n      for \(let index = 0; index < assignments\.length; index \+= 1\) \{''',
    '''      const generated = buildSchoolProjectForGeneration({
        existingProject: {
          schemaVersion: 1,
          id: schoolYearId,
          schoolName: "",
          label: "",
          status: "ACTIVE",
          periodsPerDay: [8, 8, 8, 8, 7],
          version: 1,
          updatedAt: new Date(0).toISOString(),
          teachers: [],
          classes: [],
          subjects: [],
          roomTypes: [],
          rooms: [],
          assignments: [],
          availability: [],
          fixedLessons: [],
          importBatches: [],
          generationRuns: [],
          timetableVersions: [],
        },
        staffingPlan,
        teachingPlan: plan,
        forceReplaceGeneratedData: false,
      });
      if (generated.blockers.length > 0) {
        throw new Error(generated.blockers[0]);
      }

      const generatedClassCode = new Map(
        generated.project.classes.map((schoolClass) => [
          schoolClass.id,
          schoolClass.code,
        ]),
      );
      const generatedSubjectCode = new Map(
        generated.project.subjects.map((subject) => [subject.id, subject.code]),
      );
      const staffingTeacherId = new Map(
        staffingPlan.teachers.map((teacher) => [`teacher:${teacher.id}`, teacher.id]),
      );

      const assignments = generated.project.assignments.map((assignment) => {
        const classCode = generatedClassCode.get(assignment.classId) ?? "";
        const subjectCode = generatedSubjectCode.get(assignment.subjectId) ?? "";
        const planTeacherId = staffingTeacherId.get(assignment.teacherId) ?? "";
        const teacherCode = teacherCodes.get(planTeacherId) ?? "";
        return {
          assignmentCode: assignment.assignmentCode,
          classId: classIdByCode.get(classCode),
          subjectId: subjectIdByCode.get(subjectCode),
          teacherId: projectTeacherByCode.get(teacherCode),
          group: assignment.group,
          weeklyPeriods: assignment.weeklyPeriods,
          lessonShape: assignment.lessonShape,
          doublePeriodsCount: assignment.doublePeriodsCount,
          parallelKey: assignment.parallelKey,
          rotationKey: assignment.rotationKey,
          rotationLeg: assignment.rotationLeg,
          rotationPlacement: assignment.rotationPlacement,
          additionalClassIds: assignment.additionalClassIds.map((generatedId) => {
            const additionalCode = generatedClassCode.get(generatedId) ?? "";
            return classIdByCode.get(additionalCode) ?? "";
          }).filter(Boolean),
        };
      });

      for (let index = 0; index < assignments.length; index += 1) {''',
)

# UI: CJ/M one-period split has only one editable teacher and explains the same-teacher rule.
replace(
    path,
    '''  const validation = validateTeachingPlanRow(row, plan, staffingPlan);
  const sortedTeachers = (subjectCode: string) =>''',
    '''  const validation = validateTeachingPlanRow(row, plan, staffingPlan);
  const sameTeacherPartial = isSameTeacherPartialSplit(row);
  const sortedTeachers = (subjectCode: string) =>''',
)
replace(
    path,
    '''          {row.organization === "SPLIT" ? (
            <div className="mt-3 rounded-xl border border-success-border bg-success-subtle p-4 text-sm text-success-strong">
              <strong>Obě skupiny budou vždy ve stejnou dobu.</strong> Solver
              zabrání kolizi obou učitelů.
            </div>
          ) : null}''',
    '''          {row.organization === "SPLIT" ? (
            <div className="mt-3 rounded-xl border border-success-border bg-success-subtle p-4 text-sm text-success-strong">
              {sameTeacherPartial ? (
                <>
                  <strong>Jedna hodina je půlená a obě skupiny učí stejný učitel.</strong>{" "}
                  ČJ a M se v této hodině vystřídají ve dvou ramenech.
                </>
              ) : (
                <>
                  <strong>Obě skupiny budou vždy ve stejnou dobu.</strong> Solver
                  zabrání kolizi obou učitelů.
                </>
              )}
            </div>
          ) : null}''',
)
replace(
    path,
    '''            className={
              row.organization === "WHOLE"
                ? "mt-3 max-w-xl"
                : "mt-3 grid gap-4 md:grid-cols-2"
            }''',
    '''            className={
              row.organization === "WHOLE" || sameTeacherPartial
                ? "mt-3 max-w-xl"
                : "mt-3 grid gap-4 md:grid-cols-2"
            }''',
)
replace(
    path,
    '''                  : row.organization === "SPLIT"
                    ? "Skupina 1"
                    : "Celá třída"''',
    '''                  : sameTeacherPartial
                    ? "Stejný učitel celé třídy i obou skupin"
                    : row.organization === "SPLIT"
                      ? "Skupina 1"
                      : "Celá třída"''',
)
replace(
    path,
    '''              onChange={(value) =>
                update((current) => ({ ...current, primaryTeacherId: value }))
              }''',
    '''              onChange={(value) =>
                update((current) => ({
                  ...current,
                  primaryTeacherId: value,
                  secondaryTeacherId: isSameTeacherPartialSplit(current)
                    ? value
                    : current.secondaryTeacherId,
                }))
              }''',
)
replace(
    path,
    '''            {row.organization !== "WHOLE" ? (
              <TeacherSelect''',
    '''            {row.organization !== "WHOLE" && !sameTeacherPartial ? (
              <TeacherSelect''',
)
replace(
    path,
    '''                : `${humanBlockSummary(row)} · ${row.organization === "SPLIT" ? "dvě souběžné skupiny" : "celá třída"}`}''',
    '''                : `${humanBlockSummary(row)} · ${sameTeacherPartial ? "1 hodina půlená, stejný učitel pro obě skupiny" : row.organization === "SPLIT" ? "dvě souběžné skupiny" : "celá třída"}`}''',
)

# Update obsolete coverage expectations: CJ/M now have one teacher role, not two.
test_path = "apps/web/tests/mandatory-school-splits.test.ts"
replace(test_path, "assert.equal(czech?.requiredSlots, 2);", "assert.equal(czech?.requiredSlots, 1);")
replace(test_path, "assert.equal(math?.requiredSlots, 2);", "assert.equal(math?.requiredSlots, 1);")
