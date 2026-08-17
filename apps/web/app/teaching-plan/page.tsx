"use client";

import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Download,
  Dumbbell,
  FileSpreadsheet,
  Plus,
  Repeat2,
  Save,
  Trash2,
  Upload,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChangeEvent, useEffect, useMemo, useState } from "react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { proposeCzechMathRotations } from "@/lib/domain/rotation-proposal";
import {
  analyzeTeachingPlanWorkbook,
  createTeachingPlanWorkbook,
  type TeachingPlanWorkbookAnalysis,
} from "@/lib/import/teaching-plan-workbook";
import { LOCAL_SCHOOL_YEAR_ID, localApiFetch } from "@/lib/local/api";
import { buildSchoolProjectForGeneration } from "@/lib/local/school-project-generation";
import {
  createPendingTeachingPlanImport,
  savePendingTeachingPlanImport,
} from "@/lib/local/teaching-plan-import-review";
import {
  STAFFING_SUBJECTS,
  loadStaffingPlan,
  teacherCodesForPlan,
  type StaffingPlan,
  type StaffingTeacher,
} from "@/lib/local/staffing-plan";
import {
  TEACHING_CLASS_PROFILES,
  TEACHING_ORGANIZATIONS,
  TEACHING_ROTATION_PLACEMENTS,
  TEACHING_SHAPES,
  classProfileLabel,
  createEmptyTeachingPlan,
  createTeachingPlanClass,
  createTeachingPlanRow,
  humanBlockSummary,
  isSameTeacherPartialSplit,
  lessonBlockDurations,
  loadTeachingPlan,
  normalizeClassCode,
  rotationPlacementLabel,
  rotationSummary,
  rowClassPeriods,
  rowTeacherPeriods,
  saveTeachingPlan,
  validateTeachingPlan,
  validateTeachingPlanRow,
  type TeachingClassProfile,
  type TeachingPlan,
  type TeachingPlanRow,
} from "@/lib/local/teaching-plan";

const inputClass =
  "h-11 w-full rounded-lg border border-border-strong bg-surface px-3 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

const CURRENT_SCHOOL_CLASSES = [
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

interface ResourceResponse {
  items: Array<Record<string, unknown>>;
}

interface SchoolYearResponse {
  version: number;
}

function textValue(record: Record<string, unknown>, key: string): string {
  return typeof record[key] === "string" ? String(record[key]) : "";
}

function numberValue(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function teacherLabel(teacher: StaffingTeacher): string {
  return `${teacher.firstName} ${teacher.lastName}`.trim();
}

function subjectLabel(code: string): string {
  const subject = STAFFING_SUBJECTS.find((item) => item.code === code);
  return subject
    ? `${subject.label} (${subject.code})`
    : code || "Nový předmět";
}

function safeCode(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toUpperCase();
}

function workloadByTeacher(plan: TeachingPlan): Map<string, number> {
  const result = new Map<string, number>();
  const teacherIds = new Set(
    plan.rows.flatMap((row) => [row.primaryTeacherId, row.secondaryTeacherId]),
  );
  for (const teacherId of teacherIds) {
    if (!teacherId) continue;
    result.set(
      teacherId,
      plan.rows.reduce(
        (total, row) => total + rowTeacherPeriods(row, teacherId),
        0,
      ),
    );
  }
  return result;
}

function teacherMatchesSubject(
  teacher: StaffingTeacher,
  subjectCode: string,
): boolean {
  return teacher.subjectLoads.some(
    (item) => item.subjectCode === subjectCode && item.weeklyPeriods > 0,
  );
}

export default function TeachingPlanPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const schoolYearId = searchParams.get("schoolYearId") ?? LOCAL_SCHOOL_YEAR_ID;
  const context = `schoolYearId=${encodeURIComponent(schoolYearId)}`;

  const [staffingPlan, setStaffingPlan] = useState<StaffingPlan>(() => ({
    version: 1,
    updatedAt: new Date(0).toISOString(),
    teachers: [],
  }));
  const [plan, setPlan] = useState<TeachingPlan>(() =>
    createEmptyTeachingPlan(),
  );
  const [loaded, setLoaded] = useState(false);
  const [selectedClass, setSelectedClass] = useState("");
  const [newClassCode, setNewClassCode] = useState("");
  const [analysis, setAnalysis] = useState<TeachingPlanWorkbookAnalysis | null>(
    null,
  );
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const nextStaffing = loadStaffingPlan();
    const nextPlan = loadTeachingPlan();
    setStaffingPlan(nextStaffing);
    setPlan(nextPlan);
    setSelectedClass(nextPlan.classes[0]?.code ?? "");
    if (new URLSearchParams(window.location.search).get("imported") === "1") {
      setMessage(
        "Excel byl potvrzen a převzat do editoru. Zkontrolujte případné poslední úpravy a potom výuku uložte do projektu.",
      );
    }
    setLoaded(true);
  }, []);

  const teacherWorkloads = useMemo(() => workloadByTeacher(plan), [plan]);
  const validationMessages = useMemo(
    () => validateTeachingPlan(plan, staffingPlan),
    [plan, staffingPlan],
  );
  const workloadMessages = useMemo(
    () =>
      staffingPlan.teachers.flatMap((teacher) => {
        const assigned = teacherWorkloads.get(teacher.id) ?? 0;
        const difference = teacher.targetWeeklyLoad - assigned;
        if (difference === 0) return [];
        return [
          difference > 0
            ? `${teacherLabel(teacher)}: ještě chybí přidělit ${difference} hodin.`
            : `${teacherLabel(teacher)}: přiděleno je o ${Math.abs(difference)} hodin více než úvazek.`,
        ];
      }),
    [staffingPlan.teachers, teacherWorkloads],
  );
  const allReady =
    plan.rows.length > 0 &&
    validationMessages.length === 0 &&
    workloadMessages.length === 0;
  const selectedRows = plan.rows.filter(
    (row) => row.classCode === selectedClass,
  );
  const selectedClassItem = plan.classes.find(
    (schoolClass) => schoolClass.code === selectedClass,
  );
  const splitCount = plan.rows.filter(
    (row) => row.organization === "SPLIT",
  ).length;
  const rotationCount = plan.rows.filter(
    (row) => row.organization === "ROTATION",
  ).length;
  const doubleBlockCount = plan.rows.reduce(
    (total, row) =>
      total +
      lessonBlockDurations(row).filter((duration) => duration === 2).length *
        (row.organization === "ROTATION" ? 2 : 1),
    0,
  );
  const rotationProposal = useMemo(
    () => proposeCzechMathRotations(plan, staffingPlan),
    [plan, staffingPlan],
  );

  function commit(next: TeachingPlan): void {
    const saved = saveTeachingPlan(next);
    setPlan(saved);
    setMessage(null);
    setError(null);
  }

  function updateRow(
    rowId: string,
    update: (row: TeachingPlanRow) => TeachingPlanRow,
  ): void {
    commit({
      ...plan,
      rows: plan.rows.map((row) => (row.id === rowId ? update(row) : row)),
    });
  }

  function addClass(rawCode: string): void {
    const code = normalizeClassCode(rawCode);
    if (!code) {
      setError("Zadejte označení třídy, například 8.A.");
      return;
    }
    if (plan.classes.some((item) => item.code === code)) {
      setSelectedClass(code);
      setNewClassCode("");
      return;
    }
    commit({
      ...plan,
      classes: [...plan.classes, createTeachingPlanClass(code)],
    });
    setSelectedClass(code);
    setNewClassCode("");
  }

  function addCurrentSchoolClasses(): void {
    const existing = new Set(plan.classes.map((item) => item.code));
    const additions = CURRENT_SCHOOL_CLASSES.filter(
      (code) => !existing.has(code),
    ).map((code) => createTeachingPlanClass(code));
    commit({ ...plan, classes: [...plan.classes, ...additions] });
    setSelectedClass(plan.classes[0]?.code ?? additions[0]?.code ?? "");
  }

  function updateClassProfile(profile: TeachingClassProfile): void {
    if (!selectedClass) return;
    commit({
      ...plan,
      classes: plan.classes.map((schoolClass) =>
        schoolClass.code === selectedClass
          ? { ...schoolClass, profile }
          : schoolClass,
      ),
    });
  }

  function removeClass(code: string): void {
    if (
      !window.confirm(`Odstranit třídu ${code} včetně všech jejích předmětů?`)
    ) {
      return;
    }
    const nextClasses = plan.classes.filter((item) => item.code !== code);
    commit({
      ...plan,
      classes: nextClasses,
      rows: plan.rows.filter((row) => row.classCode !== code),
    });
    setSelectedClass(nextClasses[0]?.code ?? "");
  }

  function addSubjectRow(): void {
    if (!selectedClass) {
      setError("Nejdřív přidejte a vyberte třídu.");
      return;
    }
    commit({
      ...plan,
      rows: [...plan.rows, createTeachingPlanRow(selectedClass)],
    });
  }

  function removeRow(rowId: string): void {
    commit({ ...plan, rows: plan.rows.filter((row) => row.id !== rowId) });
  }

  async function downloadWorkbook(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const bytes = await createTeachingPlanWorkbook(staffingPlan, plan);
      const copy = new Uint8Array(bytes.byteLength);
      copy.set(bytes);
      const blob = new Blob([copy.buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "02-tridy-predmety-dvojhodiny-deleni-a-vymeny.xlsx";
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Excel se nepodařilo vytvořit.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function importWorkbook(
    event: ChangeEvent<HTMLInputElement>,
  ): Promise<void> {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    setFileName(file.name);
    try {
      const result = await analyzeTeachingPlanWorkbook(
        await file.arrayBuffer(),
        staffingPlan,
      );
      setAnalysis(result);
      if (!result.valid) return;
      savePendingTeachingPlanImport(
        createPendingTeachingPlanImport({
          fileName: file.name,
          schoolYearId,
          analysis: result,
        }),
      );
      router.push(`/teaching-plan/review?${context}`);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Excel se nepodařilo načíst.",
      );
    } finally {
      setBusy(false);
      event.target.value = "";
    }
  }

  async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await localApiFetch(url, init);
    const payload = (await response.json()) as T & {
      error?: { message?: string };
    };
    if (!response.ok) {
      throw new Error(payload.error?.message ?? "Operace se nepodařila.");
    }
    return payload;
  }

  async function syncToProject(): Promise<void> {
    const currentValidation = validateTeachingPlan(plan, staffingPlan);
    if (currentValidation.length > 0 || workloadMessages.length > 0) {
      setError(
        currentValidation[0] ?? workloadMessages[0] ?? "Plán není hotový.",
      );
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      setProgress("Kontroluji školní data…");
      const [
        schoolYear,
        teachersResponse,
        classesResponse,
        subjectsResponse,
        assignmentsResponse,
      ] = await Promise.all([
        requestJson<SchoolYearResponse>(`/api/school-years/${schoolYearId}`),
        requestJson<ResourceResponse>(
          `/api/school-years/${schoolYearId}/teachers`,
        ),
        requestJson<ResourceResponse>(
          `/api/school-years/${schoolYearId}/classes`,
        ),
        requestJson<ResourceResponse>(
          `/api/school-years/${schoolYearId}/subjects`,
        ),
        requestJson<ResourceResponse>(
          `/api/school-years/${schoolYearId}/assignments`,
        ),
      ]);
      let version = schoolYear.version;

      const teacherCodes = teacherCodesForPlan(staffingPlan);
      const projectTeacherByCode = new Map(
        teachersResponse.items.map((item) => [
          textValue(item, "code"),
          textValue(item, "id"),
        ]),
      );
      for (const teacher of staffingPlan.teachers) {
        const code = teacherCodes.get(teacher.id)!;
        if (!projectTeacherByCode.has(code)) {
          throw new Error(
            `Učitel ${teacherLabel(teacher)} ještě není uložený v projektu. Vraťte se do Kroku 1 a použijte tlačítko Uložit učitele do projektu.`,
          );
        }
      }

      if (
        assignmentsResponse.items.length > 0 &&
        !window.confirm(
          `Projekt už obsahuje ${assignmentsResponse.items.length} výukových vazeb. Nahradit je tímto zkontrolovaným plánem?`,
        )
      ) {
        return;
      }

      for (
        let index = 0;
        index < assignmentsResponse.items.length;
        index += 1
      ) {
        const assignment = assignmentsResponse.items[index]!;
        setProgress(
          `Nahrazuji starý plán ${index + 1}/${assignmentsResponse.items.length}…`,
        );
        const payload = await requestJson<{ schoolYearVersion?: number }>(
          `/api/school-years/${schoolYearId}/assignments/${encodeURIComponent(textValue(assignment, "id"))}`,
          {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ expectedSchoolYearVersion: version }),
          },
        );
        version = payload.schoolYearVersion ?? version + 1;
      }

      const existingClassByCode = new Map(
        classesResponse.items.map((item) => [textValue(item, "code"), item]),
      );
      for (const schoolClass of plan.classes) {
        const desiredProfile = schoolClass.profile ?? "REGULAR";
        const existingClass = existingClassByCode.get(schoolClass.code);
        if (existingClass) {
          if (textValue(existingClass, "profile") !== desiredProfile) {
            setProgress(`Aktualizuji profil třídy ${schoolClass.code}…`);
            const payload = await requestJson<{ schoolYearVersion?: number }>(
              `/api/school-years/${schoolYearId}/classes/${encodeURIComponent(textValue(existingClass, "id"))}`,
              {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  expectedSchoolYearVersion: version,
                  grade: schoolClass.grade,
                  name: schoolClass.code,
                  profile: desiredProfile,
                }),
              },
            );
            version = payload.schoolYearVersion ?? version + 1;
          }
          continue;
        }
        setProgress(`Zakládám třídu ${schoolClass.code}…`);
        const payload = await requestJson<{ schoolYearVersion?: number }>(
          `/api/school-years/${schoolYearId}/classes`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              expectedSchoolYearVersion: version,
              code: schoolClass.code,
              grade: schoolClass.grade,
              name: schoolClass.code,
              profile: desiredProfile,
            }),
          },
        );
        version = payload.schoolYearVersion ?? version + 1;
      }

      const usedSubjectCodes = [
        ...new Set(
          plan.rows.flatMap((row) => [
            row.subjectCode,
            ...(row.organization === "ROTATION" && row.secondarySubjectCode
              ? [row.secondarySubjectCode]
              : []),
          ]),
        ),
      ];
      const existingSubjectCodes = new Set(
        subjectsResponse.items.map((item) => textValue(item, "code")),
      );
      for (const code of usedSubjectCodes) {
        if (existingSubjectCodes.has(code)) continue;
        const subject = STAFFING_SUBJECTS.find((item) => item.code === code)!;
        setProgress(`Zakládám předmět ${subject.label}…`);
        const payload = await requestJson<{ schoolYearVersion?: number }>(
          `/api/school-years/${schoolYearId}/subjects`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              expectedSchoolYearVersion: version,
              code,
              name: subject.label,
              defaultRoomTypeId: null,
            }),
          },
        );
        version = payload.schoolYearVersion ?? version + 1;
      }

      const [storedClasses, storedSubjects] = await Promise.all([
        requestJson<ResourceResponse>(
          `/api/school-years/${schoolYearId}/classes`,
        ),
        requestJson<ResourceResponse>(
          `/api/school-years/${schoolYearId}/subjects`,
        ),
      ]);
      const classIdByCode = new Map(
        storedClasses.items.map((item) => [
          textValue(item, "code"),
          textValue(item, "id"),
        ]),
      );
      const subjectIdByCode = new Map(
        storedSubjects.items.map((item) => [
          textValue(item, "code"),
          textValue(item, "id"),
        ]),
      );

      const generated = buildSchoolProjectForGeneration({
        existingProject: {
          schemaVersion: 1,
          id: LOCAL_SCHOOL_YEAR_ID,
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
        staffingPlan.teachers.map((teacher) => [
          `teacher:${teacher.id}`,
          teacher.id,
        ]),
      );

      const assignments = generated.project.assignments.map((assignment) => {
        const classCode = generatedClassCode.get(assignment.classId) ?? "";
        const subjectCode =
          generatedSubjectCode.get(assignment.subjectId) ?? "";
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
          additionalClassIds: assignment.additionalClassIds
            .map((generatedId) => {
              const additionalCode = generatedClassCode.get(generatedId) ?? "";
              return classIdByCode.get(additionalCode) ?? "";
            })
            .filter(Boolean),
        };
      });

      for (let index = 0; index < assignments.length; index += 1) {
        const assignment = assignments[index]!;
        setProgress(
          `Ukládám výuku ${index + 1}/${assignments.length}: ${assignment.assignmentCode}…`,
        );
        const payload = await requestJson<{ schoolYearVersion?: number }>(
          `/api/school-years/${schoolYearId}/assignments`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              expectedSchoolYearVersion: version,
              ...assignment,
              requiredRoomId: null,
              maxPerDay: null,
              minDayGap: null,
            }),
          },
        );
        version = payload.schoolYearVersion ?? version + 1;
      }

      setMessage(
        `Hotovo. Uloženo ${plan.rows.length} nastavení jako ${assignments.length} výukových vazeb včetně dvojhodin, dělení a výměn předmětů.`,
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Uložení se nepodařilo.",
      );
    } finally {
      setBusy(false);
      setProgress("");
    }
  }

  if (!loaded) {
    return <p className="text-sm text-text-muted">Načítám výuku tříd…</p>;
  }

  if (staffingPlan.teachers.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Krok 2"
          title="Výuka tříd"
          description="Nejdřív potřebujeme seznam učitelů z prvního kroku."
        />
        <section className="rounded-2xl border border-warning-border bg-warning-subtle p-8 text-center">
          <UsersRound
            className="mx-auto size-10 text-warning"
            aria-hidden="true"
          />
          <h2 className="mt-4 text-lg font-semibold text-text-primary">
            Nejprve dokončete učitele a úvazky
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-text-secondary">
            U dělených hodin a výměn musíme znát oba učitele i jejich
            dostupnost.
          </p>
          <Button asChild className="mt-5">
            <Link href={`/staffing?${context}`}>Přejít na Krok 1</Link>
          </Button>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Krok 2"
        title="Výuka tříd"
        description="Nastavte dotace každé třídy, dvojhodiny, dělení i přesné výměny předmětů mezi skupinami."
        actions={
          <Button
            type="button"
            variant="outline"
            onClick={() => void downloadWorkbook()}
            disabled={busy}
          >
            <Download className="size-4" aria-hidden="true" />
            Stáhnout Excel pro třídy
          </Button>
        }
      />

      <section className="grid gap-3 md:grid-cols-4">
        {[
          ["1", "Profil třídy", "Běžná, sportovní nebo vlastní skladba."],
          [
            "2",
            "Předměty a dotace",
            "Každá třída má své skutečné počty hodin.",
          ],
          [
            "3",
            "Bloky a skupiny",
            "Samostatně, dvojhodiny nebo paralelní skupiny.",
          ],
          ["4", "Výměna předmětů", "ČJ/M a podobné dvojice se přesně prohodí."],
        ].map(([number, title, description]) => (
          <article
            key={number}
            className="rounded-xl border border-border bg-surface p-5"
          >
            <div className="flex size-9 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
              {number}
            </div>
            <h2 className="mt-4 font-semibold text-text-primary">{title}</h2>
            <p className="mt-1 text-sm leading-6 text-text-secondary">
              {description}
            </p>
          </article>
        ))}
      </section>

      <section className="rounded-xl border border-border bg-surface p-6">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
          <div>
            <div className="flex items-center gap-2">
              <Repeat2 className="size-5 text-primary" aria-hidden="true" />
              <h2 className="font-semibold text-text-primary">
                Návrh rotací ČJ / M
              </h2>
            </div>
            <p className="mt-2 text-sm text-text-secondary">
              Nalezeno {rotationProposal.candidates.length} možných rotací ·
              odmítnuto {rotationProposal.rejected.length} tříd · zůstane{" "}
              {rotationProposal.residualUncoveredHours} nepokrytých hodin.
            </p>
            {rotationProposal.candidates.length ? (
              <ul className="mt-3 space-y-1 text-xs text-text-muted">
                {rotationProposal.candidates.map((candidate) => (
                  <li key={candidate.classCode}>
                    {candidate.classCode}: {candidate.rotationHours} h rotačně
                    {candidate.residualHours
                      ? `, ${candidate.residualHours} h zbytek`
                      : ""}
                    ; zatížení{" "}
                    {Object.keys(candidate.teacherLoadsAfter)
                      .map(
                        (teacherId) =>
                          `${teacherLabel(staffingPlan.teachers.find((teacher) => teacher.id === teacherId)!)} ${candidate.teacherLoadsBefore[teacherId]}→${candidate.teacherLoadsAfter[teacherId]} h`,
                      )
                      .join(", ")}
                  </li>
                ))}
              </ul>
            ) : null}
            {rotationProposal.rejected.length ? (
              <ul className="mt-3 space-y-1 text-xs text-warning-strong">
                {rotationProposal.rejected.map((item) => (
                  <li key={`${item.classCode}-${item.reason}`}>
                    {item.classCode}: {item.reason}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={rotationProposal.candidates.length === 0}
            onClick={() => {
              if (
                !window.confirm(
                  `Použít ${rotationProposal.candidates.length} navržených rotací ČJ / M?`,
                )
              )
                return;
              commit(rotationProposal.plan);
              setMessage(
                `Použito ${rotationProposal.candidates.length} rotací ČJ / M. Zkontrolujte ${rotationProposal.residualUncoveredHours} zbytkových nepokrytých hodin.`,
              );
            }}
          >
            Navrhnout a potvrdit rotace
          </Button>
        </div>
      </section>

      <section className="rounded-xl border-2 border-dashed border-primary/40 bg-primary-subtle p-6">
        <div className="flex flex-col items-center text-center">
          <FileSpreadsheet
            className="size-10 text-primary"
            aria-hidden="true"
          />
          <h2 className="mt-3 text-lg font-semibold text-text-primary">
            Velké množství tříd vyplňte v Excelu
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-text-secondary">
            Excel podporuje sportovní profily, rozdílné dotace po třídách,
            dvojhodiny i výměnu dvou předmětů. Po nahrání se nic nepřepíše —
            nejdřív projdete bezpečný kontrolní průvodce.
          </p>
          <label className="mt-5 inline-flex cursor-pointer items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
            <Upload className="size-4" aria-hidden="true" />
            {busy ? "Pracuji…" : "Nahrát vyplněný Excel"}
            <input
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="sr-only"
              disabled={busy}
              onChange={(event) => void importWorkbook(event)}
              aria-label="Nahrát vyplněný Excel"
            />
          </label>
          {fileName ? (
            <p className="mt-3 text-xs text-text-muted">Soubor: {fileName}</p>
          ) : null}
        </div>
      </section>

      {analysis && !analysis.valid ? (
        <section className="rounded-xl border border-danger-border bg-danger-subtle p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle
              className="mt-0.5 size-5 text-danger"
              aria-hidden="true"
            />
            <div>
              <h2 className="font-semibold text-text-primary">
                Excel potřebuje opravit
              </h2>
              <p className="mt-1 text-sm text-text-secondary">
                Nic se nepřepsalo. Opravte uvedené řádky a nahrajte soubor
                znovu.
              </p>
              <ul className="mt-3 space-y-1 text-sm text-danger-strong">
                {analysis.issues.slice(0, 12).map((issue, index) => (
                  <li key={`${issue.sheet}-${issue.row}-${index}`}>
                    {issue.row ? `${issue.sheet}, řádek ${issue.row}: ` : ""}
                    {issue.message}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      ) : null}

      {message ? (
        <div className="rounded-xl border border-success-border bg-success-subtle p-4 text-sm text-success-strong">
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-xl border border-danger-border bg-danger-subtle p-4 text-sm text-danger-strong">
          {error}
        </div>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ["Třídy", plan.classes.length],
          [
            "Sportovní třídy",
            plan.classes.filter((item) => item.profile === "SPORTS").length,
          ],
          ["Předměty / dvojice", plan.rows.length],
          ["Dělené předměty", splitCount],
          ["Výměny předmětů", rotationCount],
        ].map(([label, value]) => (
          <article
            key={label}
            className="rounded-xl border border-border bg-surface p-4"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
              {label}
            </p>
            <p className="mt-2 text-2xl font-semibold text-text-primary">
              {value}
            </p>
          </article>
        ))}
      </section>

      <section className="rounded-2xl border border-border bg-surface p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Třídy</h2>
            <p className="mt-1 text-sm text-text-secondary">
              B a D se pro tuto školu automaticky nabídnou jako sportovní,
              profil lze ručně změnit.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="flex gap-2">
              <input
                value={newClassCode}
                onChange={(event) => setNewClassCode(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addClass(newClassCode);
                  }
                }}
                className={`${inputClass} w-32`}
                placeholder="8.A"
                aria-label="Nová třída"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => addClass(newClassCode)}
              >
                <Plus className="size-4" aria-hidden="true" />
                Přidat
              </Button>
            </div>
            <Button
              type="button"
              variant="ghost"
              onClick={addCurrentSchoolClasses}
            >
              Přidat třídy 6.–9. ročníku
            </Button>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {plan.classes.map((schoolClass) => (
            <div key={schoolClass.id} className="flex items-center">
              <button
                type="button"
                onClick={() => setSelectedClass(schoolClass.code)}
                className={
                  selectedClass === schoolClass.code
                    ? "rounded-l-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground"
                    : "rounded-l-lg border border-r-0 border-border-strong bg-surface px-4 py-3 text-sm font-semibold text-text-secondary hover:bg-surface-subtle"
                }
              >
                {schoolClass.code}
                {schoolClass.profile === "SPORTS" ? (
                  <span className="ml-2 rounded bg-surface/20 px-1.5 py-0.5 text-[10px] uppercase">
                    sport
                  </span>
                ) : null}
              </button>
              <button
                type="button"
                onClick={() => removeClass(schoolClass.code)}
                className={
                  selectedClass === schoolClass.code
                    ? "rounded-r-lg bg-primary px-2 py-3 text-primary-foreground hover:bg-danger"
                    : "rounded-r-lg border border-border-strong bg-surface px-2 py-3 text-text-muted hover:bg-danger-subtle hover:text-danger"
                }
                aria-label={`Odstranit třídu ${schoolClass.code}`}
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </button>
            </div>
          ))}
          {plan.classes.length === 0 ? (
            <p className="text-sm text-text-muted">
              Přidejte první třídu nebo připravenou sadu 6.–9. ročníku.
            </p>
          ) : null}
        </div>
      </section>

      {selectedClass && selectedClassItem ? (
        <section className="space-y-4">
          <div className="rounded-2xl border border-border bg-surface p-5">
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-center">
              <div className="flex items-start gap-4">
                <div
                  className={
                    selectedClassItem.profile === "SPORTS"
                      ? "flex size-12 items-center justify-center rounded-xl bg-success-subtle text-success"
                      : "flex size-12 items-center justify-center rounded-xl bg-primary-subtle text-primary"
                  }
                >
                  {selectedClassItem.profile === "SPORTS" ? (
                    <Dumbbell className="size-6" aria-hidden="true" />
                  ) : (
                    <BookOpen className="size-6" aria-hidden="true" />
                  )}
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                    Právě upravujete
                  </p>
                  <h2 className="mt-1 text-2xl font-semibold text-text-primary">
                    Třída {selectedClass}
                  </h2>
                  <p className="mt-1 text-sm text-text-secondary">
                    {selectedRows.reduce(
                      (total, row) => total + rowClassPeriods(row),
                      0,
                    )}{" "}
                    hodin třídy týdně · {selectedRows.length} nastavení.
                  </p>
                </div>
              </div>
              <label className="text-sm font-medium text-text-primary">
                Profil a hodinová dotace třídy
                <select
                  value={selectedClassItem.profile ?? "REGULAR"}
                  onChange={(event) =>
                    updateClassProfile(
                      event.target.value as TeachingClassProfile,
                    )
                  }
                  className={`${inputClass} mt-1.5`}
                  aria-label={`Profil třídy ${selectedClass}`}
                >
                  {TEACHING_CLASS_PROFILES.map((profile) => (
                    <option key={profile.value} value={profile.value}>
                      {profile.label}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-xs font-normal text-text-muted">
                  {classProfileLabel(selectedClassItem.profile ?? "REGULAR")} má
                  vlastní skutečné řádky níže; profil žádné hodiny tajně
                  nekopíruje.
                </span>
              </label>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-text-primary">
                Předměty a skupiny
              </h2>
              <p className="mt-1 text-sm text-text-secondary">
                Výměnu ČJ/M vložte jako jeden společný řádek, ne jako čtyři
                technické vazby.
              </p>
            </div>
            <Button type="button" onClick={addSubjectRow}>
              <Plus className="size-4" aria-hidden="true" />
              Přidat předmět
            </Button>
          </div>

          {selectedRows.length === 0 ? (
            <article className="rounded-2xl border border-dashed border-border-strong bg-surface p-10 text-center">
              <BookOpen
                className="mx-auto size-10 text-text-muted"
                aria-hidden="true"
              />
              <h3 className="mt-4 font-semibold text-text-primary">
                Třída zatím nemá žádné předměty
              </h3>
              <p className="mt-1 text-sm text-text-secondary">
                Přidejte první předmět nebo výměnnou dvojici.
              </p>
            </article>
          ) : null}

          {selectedRows.map((row, index) => (
            <TeachingRowCard
              key={row.id}
              row={row}
              index={index}
              plan={plan}
              staffingPlan={staffingPlan}
              update={(update) => updateRow(row.id, update)}
              remove={() => removeRow(row.id)}
            />
          ))}
        </section>
      ) : null}

      <section className="rounded-2xl border border-border bg-surface p-6">
        <div className="flex items-start gap-3">
          <UsersRound
            className="mt-0.5 size-6 text-primary"
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-text-primary">
              Kontrola úvazků učitelů
            </h2>
            <p className="mt-1 text-sm text-text-secondary">
              U výměny učí každý učitel oba díly třídy, proto se mu započítá
              dvojnásobek dotace uvedené pro jednu skupinu.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {staffingPlan.teachers.map((teacher) => {
                const assigned = teacherWorkloads.get(teacher.id) ?? 0;
                const exact = assigned === teacher.targetWeeklyLoad;
                return (
                  <div
                    key={teacher.id}
                    className={
                      exact
                        ? "rounded-xl border border-success-border bg-success-subtle p-4"
                        : "rounded-xl border border-border bg-surface-subtle p-4"
                    }
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-text-primary">
                          {teacherLabel(teacher)}
                        </p>
                        <p className="mt-1 text-xs text-text-muted">
                          Přiděleno / úvazek
                        </p>
                      </div>
                      {exact ? (
                        <CheckCircle2
                          className="size-5 text-success"
                          aria-hidden="true"
                        />
                      ) : null}
                    </div>
                    <p
                      className={
                        exact
                          ? "mt-3 text-xl font-bold text-success-strong"
                          : assigned > teacher.targetWeeklyLoad
                            ? "mt-3 text-xl font-bold text-danger"
                            : "mt-3 text-xl font-bold text-text-primary"
                      }
                    >
                      {assigned} / {teacher.targetWeeklyLoad} h
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section
        className={
          allReady
            ? "rounded-2xl border border-success-border bg-success-subtle p-6"
            : "rounded-2xl border border-warning-border bg-warning-subtle p-6"
        }
      >
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            {allReady ? (
              <CheckCircle2
                className="mt-0.5 size-6 text-success"
                aria-hidden="true"
              />
            ) : (
              <AlertTriangle
                className="mt-0.5 size-6 text-warning"
                aria-hidden="true"
              />
            )}
            <div>
              <h2 className="text-lg font-semibold text-text-primary">
                {allReady
                  ? "Výuka tříd je připravená"
                  : "Ještě je potřeba plán dokončit"}
              </h2>
              <p className="mt-1 text-sm text-text-secondary">
                {allReady
                  ? `${plan.rows.length} nastavení · ${splitCount} dělených · ${rotationCount} výměn · ${doubleBlockCount} dvojhodinových bloků · všechny úvazky sedí.`
                  : (validationMessages[0] ??
                    workloadMessages[0] ??
                    "Přidejte třídy a předměty.")}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              onClick={() => void syncToProject()}
              disabled={!allReady || busy}
            >
              <Save className="size-4" aria-hidden="true" />
              {progress || "Uložit výuku do projektu"}
            </Button>
            {message?.startsWith("Hotovo") ? (
              <Button asChild variant="outline">
                <Link href={`/generate?${context}`}>
                  Pokračovat k tvorbě rozvrhu
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </Button>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}

function TeachingRowCard({
  row,
  index,
  plan,
  staffingPlan,
  update,
  remove,
}: {
  row: TeachingPlanRow;
  index: number;
  plan: TeachingPlan;
  staffingPlan: StaffingPlan;
  update: (update: (row: TeachingPlanRow) => TeachingPlanRow) => void;
  remove: () => void;
}) {
  const validation = validateTeachingPlanRow(row, plan, staffingPlan);
  const sameTeacherPartial = isSameTeacherPartialSplit(row);
  const sortedTeachers = (subjectCode: string) =>
    [...staffingPlan.teachers].sort((left, right) => {
      const leftMatch = teacherMatchesSubject(left, subjectCode) ? 0 : 1;
      const rightMatch = teacherMatchesSubject(right, subjectCode) ? 0 : 1;
      if (leftMatch !== rightMatch) return leftMatch - rightMatch;
      return teacherLabel(left).localeCompare(teacherLabel(right), "cs-CZ");
    });

  return (
    <article
      data-testid={`teaching-row-${index}`}
      className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border bg-surface-subtle px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-full bg-primary-subtle font-semibold text-primary">
            {row.organization === "ROTATION" ? (
              <Repeat2 className="size-5" aria-hidden="true" />
            ) : (
              index + 1
            )}
          </div>
          <div>
            <h3 className="font-semibold text-text-primary">
              {subjectLabel(row.subjectCode)}
              {row.organization === "ROTATION" && row.secondarySubjectCode
                ? ` ↔ ${subjectLabel(row.secondarySubjectCode)}`
                : ""}
            </h3>
            <p className="mt-0.5 text-xs text-text-muted">
              {rowClassPeriods(row)} hodin třídy týdně ·{" "}
              {humanBlockSummary(row)}
              {row.organization === "ROTATION" ? " v každém rameni" : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge tone={validation.valid ? "success" : "danger"}>
            {validation.valid ? "Nastavení sedí" : "Doplňte nastavení"}
          </StatusBadge>
          <button
            type="button"
            onClick={remove}
            className="rounded-md p-2 text-text-muted hover:bg-danger-subtle hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label={`Odstranit ${row.subjectCode || "předmět"}`}
          >
            <Trash2 className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="space-y-7 p-5">
        <div
          className={
            row.organization === "ROTATION"
              ? "grid gap-4 md:grid-cols-3"
              : "grid gap-4 md:grid-cols-[minmax(0,1fr)_180px]"
          }
        >
          <label className="space-y-1.5 text-sm font-medium text-text-primary">
            1. Který předmět?
            <select
              value={row.subjectCode}
              onChange={(event) =>
                update((current) => ({
                  ...current,
                  subjectCode: event.target.value,
                  primaryTeacherId: "",
                }))
              }
              className={inputClass}
              aria-label={`Předmět ${index + 1}`}
            >
              <option value="">Vyberte předmět</option>
              {STAFFING_SUBJECTS.map((subject) => (
                <option key={subject.code} value={subject.code}>
                  {subject.label} ({subject.code})
                </option>
              ))}
            </select>
          </label>
          {row.organization === "ROTATION" ? (
            <label className="space-y-1.5 text-sm font-medium text-text-primary">
              Druhý předmět pro výměnu
              <select
                value={row.secondarySubjectCode}
                onChange={(event) =>
                  update((current) => ({
                    ...current,
                    secondarySubjectCode: event.target.value,
                    secondaryTeacherId: "",
                  }))
                }
                className={inputClass}
                aria-label={`Druhý předmět ${index + 1}`}
              >
                <option value="">Vyberte druhý předmět</option>
                {STAFFING_SUBJECTS.map((subject) => (
                  <option key={subject.code} value={subject.code}>
                    {subject.label} ({subject.code})
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="space-y-1.5 text-sm font-medium text-text-primary">
            {row.organization === "ROTATION"
              ? "Kolik hodin každého předmětu pro každou skupinu?"
              : "Kolik hodin týdně?"}
            <div className="relative">
              <input
                type="number"
                min={1}
                max={20}
                step={1}
                value={row.weeklyPeriods}
                onChange={(event) => {
                  const weeklyPeriods = numberValue(event.target.value);
                  update((current) => ({
                    ...current,
                    weeklyPeriods,
                    lessonShape:
                      current.lessonShape === "DOUBLE" &&
                      weeklyPeriods % 2 !== 0
                        ? "SEPARATE"
                        : current.lessonShape,
                    doublePeriodsCount:
                      current.lessonShape === "MIXED"
                        ? Math.min(
                            current.doublePeriodsCount,
                            Math.max(0, Math.floor((weeklyPeriods - 1) / 2)),
                          )
                        : current.doublePeriodsCount,
                  }));
                }}
                className={`${inputClass} pr-9`}
                aria-label={`Hodin týdně ${index + 1}`}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-text-muted">
                h
              </span>
            </div>
          </label>
        </div>

        <div>
          <h4 className="font-semibold text-text-primary">
            2. Jak mají hodiny probíhat?
          </h4>
          <div className="mt-3 grid gap-3 lg:grid-cols-3">
            {TEACHING_SHAPES.map((shape) => {
              const disabled =
                shape.value === "DOUBLE" && row.weeklyPeriods % 2 !== 0;
              const selected = row.lessonShape === shape.value;
              return (
                <button
                  key={shape.value}
                  type="button"
                  disabled={disabled}
                  aria-pressed={selected}
                  aria-label={`${shape.label}${disabled ? " – vyžaduje sudý počet hodin" : ""}`}
                  onClick={() =>
                    update((current) => ({
                      ...current,
                      lessonShape: shape.value,
                      doublePeriodsCount:
                        shape.value === "DOUBLE"
                          ? current.weeklyPeriods / 2
                          : shape.value === "MIXED"
                            ? Math.max(
                                1,
                                Math.min(
                                  current.doublePeriodsCount || 1,
                                  Math.floor((current.weeklyPeriods - 1) / 2),
                                ),
                              )
                            : 0,
                    }))
                  }
                  className={
                    selected
                      ? "rounded-xl border-2 border-primary bg-primary-subtle p-4 text-left"
                      : disabled
                        ? "cursor-not-allowed rounded-xl border border-border bg-surface-subtle p-4 text-left opacity-45"
                        : "rounded-xl border border-border-strong bg-surface p-4 text-left hover:border-primary/50 hover:bg-primary-subtle/40"
                  }
                >
                  <p className="font-semibold text-text-primary">
                    {shape.shortLabel}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-text-secondary">
                    {shape.description}
                  </p>
                </button>
              );
            })}
          </div>
          {row.lessonShape === "MIXED" ? (
            <div className="mt-4 rounded-xl border border-border bg-surface-subtle p-4">
              <label className="flex flex-wrap items-center justify-between gap-3 text-sm font-medium text-text-primary">
                Kolik dvojhodin má být v týdnu?
                <input
                  type="number"
                  min={1}
                  max={Math.max(1, Math.floor((row.weeklyPeriods - 1) / 2))}
                  value={row.doublePeriodsCount}
                  onChange={(event) =>
                    update((current) => ({
                      ...current,
                      doublePeriodsCount: numberValue(event.target.value),
                    }))
                  }
                  className={`${inputClass} w-28`}
                  aria-label={`Počet dvojhodin ${index + 1}`}
                />
              </label>
            </div>
          ) : null}
        </div>

        <div>
          <div
            className="rounded-xl border border-primary/30 bg-primary-subtle p-4"
            data-testid={`block-preview-${index}`}
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">
              Takto to uvidí algoritmus
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {validation.blockDurations.map((duration, blockIndex) => (
                <div
                  key={`${duration}-${blockIndex}`}
                  className={
                    duration === 2
                      ? "flex h-12 min-w-36 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"
                      : "flex h-12 min-w-24 items-center justify-center rounded-lg border border-primary/40 bg-surface px-4 text-sm font-semibold text-primary"
                  }
                >
                  {duration === 2 ? "2 hodiny v kuse" : "1 hodina"}
                </div>
              ))}
            </div>
            <p className="mt-3 text-sm font-medium text-text-primary">
              {humanBlockSummary(row)}
              {row.organization === "ROTATION" ? " v každém rameni" : ""}
            </p>
          </div>
        </div>

        <div>
          <h4 className="font-semibold text-text-primary">
            3. Jak se třída organizuje?
          </h4>
          <div className="mt-3 grid gap-3 lg:grid-cols-3">
            {TEACHING_ORGANIZATIONS.map((organization) => {
              const selected = row.organization === organization.value;
              return (
                <button
                  key={organization.value}
                  type="button"
                  aria-pressed={selected}
                  aria-label={organization.label}
                  onClick={() =>
                    update((current) => ({
                      ...current,
                      organization: organization.value,
                      secondaryTeacherId:
                        organization.value === "WHOLE"
                          ? ""
                          : current.secondaryTeacherId,
                      secondarySubjectCode:
                        organization.value === "ROTATION"
                          ? current.secondarySubjectCode
                          : "",
                      rotationPlacement:
                        organization.value === "ROTATION"
                          ? (current.rotationPlacement ?? "SAME_DAY")
                          : current.rotationPlacement,
                    }))
                  }
                  className={
                    selected
                      ? "rounded-xl border-2 border-primary bg-primary-subtle p-4 text-left"
                      : "rounded-xl border border-border-strong bg-surface p-4 text-left hover:border-primary/50 hover:bg-primary-subtle/40"
                  }
                >
                  <p className="font-semibold text-text-primary">
                    {organization.label}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-text-secondary">
                    {organization.description}
                  </p>
                </button>
              );
            })}
          </div>

          {row.organization === "SPLIT" ? (
            <div className="mt-3 rounded-xl border border-success-border bg-success-subtle p-4 text-sm text-success-strong">
              {sameTeacherPartial ? (
                <>
                  <strong>
                    Jedna hodina je půlená a obě skupiny učí stejný učitel.
                  </strong>{" "}
                  ČJ a M se v této hodině vystřídají ve dvou ramenech.
                </>
              ) : (
                <>
                  <strong>Obě skupiny budou vždy ve stejnou dobu.</strong>{" "}
                  Solver zabrání kolizi obou učitelů.
                </>
              )}
            </div>
          ) : null}

          {row.organization === "ROTATION" ? (
            <div
              className="mt-4 rounded-2xl border-2 border-primary/40 bg-primary-subtle p-5"
              data-testid={`rotation-preview-${index}`}
            >
              <div className="flex items-start gap-3">
                <Repeat2
                  className="mt-0.5 size-6 shrink-0 text-primary"
                  aria-hidden="true"
                />
                <div>
                  <h5 className="font-semibold text-text-primary">
                    Povinná výměna ve dvou ramenech
                  </h5>
                  <p className="mt-1 text-sm leading-6 text-text-secondary">
                    Solver vytvoří obě ramena, přesně prohodí předměty i učitele
                    a sám smí otočit jejich pořadí podle dostupnosti.
                  </p>
                </div>
              </div>
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                <div className="rounded-xl border border-primary/30 bg-surface p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                    1. rameno
                  </p>
                  <p className="mt-2 font-semibold text-text-primary">
                    Skupina 1: {row.subjectCode || "první předmět"}
                  </p>
                  <p className="mt-1 font-semibold text-text-primary">
                    Skupina 2: {row.secondarySubjectCode || "druhý předmět"}
                  </p>
                </div>
                <div className="rounded-xl border border-primary/30 bg-surface p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                    2. rameno – prohozeno
                  </p>
                  <p className="mt-2 font-semibold text-text-primary">
                    Skupina 1: {row.secondarySubjectCode || "druhý předmět"}
                  </p>
                  <p className="mt-1 font-semibold text-text-primary">
                    Skupina 2: {row.subjectCode || "první předmět"}
                  </p>
                </div>
              </div>
              <div className="mt-5">
                <p className="text-sm font-semibold text-text-primary">
                  Kdy se mají skupiny vystřídat?
                </p>
                <div className="mt-3 grid gap-3 lg:grid-cols-3">
                  {TEACHING_ROTATION_PLACEMENTS.map((placement) => {
                    const selected =
                      (row.rotationPlacement ?? "SAME_DAY") === placement.value;
                    return (
                      <button
                        key={placement.value}
                        type="button"
                        aria-pressed={selected}
                        aria-label={placement.label}
                        onClick={() =>
                          update((current) => ({
                            ...current,
                            rotationPlacement: placement.value,
                          }))
                        }
                        className={
                          selected
                            ? "rounded-xl border-2 border-primary bg-surface p-4 text-left"
                            : "rounded-xl border border-primary/30 bg-primary-subtle/40 p-4 text-left hover:border-primary"
                        }
                      >
                        <p className="font-semibold text-text-primary">
                          {placement.shortLabel}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-text-secondary">
                          {placement.description}
                        </p>
                      </button>
                    );
                  })}
                </div>
                <p className="mt-3 text-sm font-medium text-primary">
                  Zvoleno: {rotationPlacementLabel(row.rotationPlacement)}
                </p>
              </div>
              {row.subjectCode && row.secondarySubjectCode ? (
                <p className="mt-3 text-sm font-medium text-primary">
                  {rotationSummary(row)}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <div>
          <h4 className="font-semibold text-text-primary">4. Kdo bude učit?</h4>
          <p className="mt-1 text-sm text-text-secondary">
            U výměny je učitel svázaný s předmětem, nikoli natrvalo se skupinou.
          </p>
          <div
            className={
              row.organization === "WHOLE" || sameTeacherPartial
                ? "mt-3 max-w-xl"
                : "mt-3 grid gap-4 md:grid-cols-2"
            }
          >
            <TeacherSelect
              label={
                row.organization === "ROTATION"
                  ? `Učitel předmětu ${row.subjectCode || "1"}`
                  : sameTeacherPartial
                    ? "Stejný učitel celé třídy i obou skupin"
                    : row.organization === "SPLIT"
                      ? "Skupina 1"
                      : "Celá třída"
              }
              value={row.primaryTeacherId}
              teachers={sortedTeachers(row.subjectCode)}
              subjectCode={row.subjectCode}
              onChange={(value) =>
                update((current) => ({
                  ...current,
                  primaryTeacherId: value,
                  secondaryTeacherId: isSameTeacherPartialSplit(current)
                    ? value
                    : current.secondaryTeacherId,
                }))
              }
              ariaLabel={`Učitel 1 předmětu ${index + 1}`}
            />
            {row.organization !== "WHOLE" && !sameTeacherPartial ? (
              <TeacherSelect
                label={
                  row.organization === "ROTATION"
                    ? `Učitel předmětu ${row.secondarySubjectCode || "2"}`
                    : "Skupina 2"
                }
                value={row.secondaryTeacherId}
                teachers={sortedTeachers(
                  row.organization === "ROTATION"
                    ? (row.secondarySubjectCode ?? "")
                    : row.subjectCode,
                )}
                subjectCode={
                  row.organization === "ROTATION"
                    ? (row.secondarySubjectCode ?? "")
                    : row.subjectCode
                }
                onChange={(value) =>
                  update((current) => ({
                    ...current,
                    secondaryTeacherId: value,
                  }))
                }
                ariaLabel={`Učitel 2 předmětu ${index + 1}`}
              />
            ) : null}
          </div>
        </div>

        {!validation.valid ? (
          <div className="rounded-xl border border-danger-border bg-danger-subtle p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle
                className="mt-0.5 size-5 shrink-0 text-danger"
                aria-hidden="true"
              />
              <div>
                <p className="font-semibold text-text-primary">
                  Tato výuka ještě není hotová
                </p>
                <ul className="mt-2 space-y-1 text-sm text-danger-strong">
                  {validation.messages.map((validationMessage) => (
                    <li key={validationMessage}>{validationMessage}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-xl border border-success-border bg-success-subtle p-4 text-success-strong">
            <CheckCircle2 className="size-5" aria-hidden="true" />
            <p className="font-semibold">
              Hotovo —{" "}
              {row.organization === "ROTATION"
                ? `${row.subjectCode} a ${row.secondarySubjectCode} se povinně prohodí · ${rotationPlacementLabel(row.rotationPlacement)}`
                : `${humanBlockSummary(row)} · ${sameTeacherPartial ? "1 hodina půlená, stejný učitel pro obě skupiny" : row.organization === "SPLIT" ? "dvě souběžné skupiny" : "celá třída"}`}
              .
            </p>
          </div>
        )}
      </div>
    </article>
  );
}

function TeacherSelect({
  label,
  value,
  teachers,
  subjectCode,
  onChange,
  ariaLabel,
}: {
  label: string;
  value: string;
  teachers: StaffingTeacher[];
  subjectCode: string;
  onChange: (value: string) => void;
  ariaLabel: string;
}) {
  const matching = teachers.filter((teacher) =>
    teacherMatchesSubject(teacher, subjectCode),
  );
  const other = teachers.filter(
    (teacher) => !teacherMatchesSubject(teacher, subjectCode),
  );
  return (
    <label className="block text-sm font-medium text-text-primary">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`${inputClass} mt-1.5`}
        aria-label={ariaLabel}
      >
        <option value="">Vyberte učitele</option>
        {matching.length > 0 ? (
          <optgroup label="Má tento předmět v úvazku">
            {matching.map((teacher) => (
              <option key={teacher.id} value={teacher.id}>
                {teacherLabel(teacher)}
              </option>
            ))}
          </optgroup>
        ) : null}
        {other.length > 0 ? (
          <optgroup label="Ostatní učitelé">
            {other.map((teacher) => (
              <option key={teacher.id} value={teacher.id}>
                {teacherLabel(teacher)}
              </option>
            ))}
          </optgroup>
        ) : null}
      </select>
    </label>
  );
}
