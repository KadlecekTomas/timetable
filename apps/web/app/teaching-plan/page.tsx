"use client";

import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Plus,
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
import {
  analyzeTeachingPlanWorkbook,
  createTeachingPlanWorkbook,
  type TeachingPlanWorkbookAnalysis,
} from "@/lib/import/teaching-plan-workbook";
import { LOCAL_SCHOOL_YEAR_ID, localApiFetch } from "@/lib/local/api";
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
  TEACHING_ORGANIZATIONS,
  TEACHING_SHAPES,
  createEmptyTeachingPlan,
  createTeachingPlanClass,
  createTeachingPlanRow,
  humanBlockSummary,
  lessonBlockDurations,
  loadTeachingPlan,
  normalizeClassCode,
  saveTeachingPlan,
  validateTeachingPlan,
  validateTeachingPlanRow,
  type TeachingLessonShape,
  type TeachingOrganization,
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
  for (const row of plan.rows) {
    if (row.primaryTeacherId) {
      result.set(
        row.primaryTeacherId,
        (result.get(row.primaryTeacherId) ?? 0) + row.weeklyPeriods,
      );
    }
    if (row.organization === "SPLIT" && row.secondaryTeacherId) {
      result.set(
        row.secondaryTeacherId,
        (result.get(row.secondaryTeacherId) ?? 0) + row.weeklyPeriods,
      );
    }
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
        `Excel byl potvrzen a převzat do editoru. Zkontrolujte případné poslední úpravy a potom výuku uložte do projektu.`,
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
  const splitCount = plan.rows.filter(
    (row) => row.organization === "SPLIT",
  ).length;
  const doubleBlockCount = plan.rows.reduce(
    (total, row) =>
      total +
      lessonBlockDurations(row).filter((duration) => duration === 2).length,
    0,
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
      anchor.download = "02-tridy-predmety-dvojhodiny-a-deleni.xlsx";
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
    const currentWorkload = workloadMessages;
    if (currentValidation.length > 0 || currentWorkload.length > 0) {
      setError(
        currentValidation[0] ?? currentWorkload[0] ?? "Plán není hotový.",
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

      const existingClassCodes = new Set(
        classesResponse.items.map((item) => textValue(item, "code")),
      );
      for (const schoolClass of plan.classes) {
        if (existingClassCodes.has(schoolClass.code)) continue;
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
            }),
          },
        );
        version = payload.schoolYearVersion ?? version + 1;
      }

      const usedSubjectCodes = [
        ...new Set(plan.rows.map((row) => row.subjectCode)),
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

      const assignments = plan.rows.flatMap((row) => {
        const common = {
          classId: classIdByCode.get(row.classCode),
          subjectId: subjectIdByCode.get(row.subjectCode),
          weeklyPeriods: row.weeklyPeriods,
          lessonShape:
            row.lessonShape === "SEPARATE"
              ? "SINGLE"
              : row.lessonShape === "DOUBLE"
                ? "DOUBLE"
                : "MIXED",
          doublePeriodsCount:
            row.lessonShape === "DOUBLE"
              ? row.weeklyPeriods / 2
              : row.lessonShape === "MIXED"
                ? row.doublePeriodsCount
                : 0,
        };
        const primaryCode = teacherCodes.get(row.primaryTeacherId)!;
        if (row.organization === "WHOLE") {
          return [
            {
              ...common,
              assignmentCode: `${safeCode(row.classCode)}-${row.subjectCode}-WHOLE`,
              teacherId: projectTeacherByCode.get(primaryCode),
              group: "WHOLE",
            },
          ];
        }
        const secondaryCode = teacherCodes.get(row.secondaryTeacherId)!;
        return [
          {
            ...common,
            assignmentCode: `${safeCode(row.classCode)}-${row.subjectCode}-G1`,
            teacherId: projectTeacherByCode.get(primaryCode),
            group: "GROUP_1",
          },
          {
            ...common,
            assignmentCode: `${safeCode(row.classCode)}-${row.subjectCode}-G2`,
            teacherId: projectTeacherByCode.get(secondaryCode),
            group: "GROUP_2",
          },
        ];
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
        `Hotovo. Uloženo ${plan.rows.length} předmětů jako ${assignments.length} výukových vazeb včetně dvojhodin a dělených skupin.`,
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
            U dělených hodin musíme vědět, kdo může učit první a druhou skupinu.
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
        description="U každého předmětu odpovězte jen na čtyři otázky: kolik hodin, jak po sobě, zda se třída dělí a kdo učí."
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
          ["1", "Třída a předmět", "Například 8.A · výtvarná výchova."],
          [
            "2",
            "Počet a bloky",
            "Dvě samostatné hodiny nebo jedna dvojhodina.",
          ],
          ["3", "Celá nebo dělená", "U dělení vzniknou dvě souběžné skupiny."],
          ["4", "Učitelé", "Každá skupina může mít vlastního učitele."],
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
            Excel obsahuje rozbalovací seznamy s učiteli z Kroku 1 a přímo
            kontroluje lichý počet dvojhodin i chybějícího druhého učitele. Po
            nahrání se nic nepřepíše — nejdřív projdete učitele, každou třídu,
            dotace, dělení a dvojhodiny v bezpečném kontrolním průvodci.
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

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Třídy", plan.classes.length],
          ["Předměty ve třídách", plan.rows.length],
          ["Dělené předměty", splitCount],
          ["Dvojhodinové bloky", doubleBlockCount],
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
              Kliknutím vyberete třídu, jejíž předměty právě upravujete.
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
                <span className="ml-2 text-xs font-normal opacity-75">
                  {
                    plan.rows.filter(
                      (row) => row.classCode === schoolClass.code,
                    ).length
                  }
                </span>
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
              Přidejte první třídu nebo použijte připravenou sadu 6.–9. ročníku.
            </p>
          ) : null}
        </div>
      </section>

      {selectedClass ? (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                Právě upravujete
              </p>
              <h2 className="mt-1 text-2xl font-semibold text-text-primary">
                Třída {selectedClass}
              </h2>
              <p className="mt-1 text-sm text-text-secondary">
                Každý předmět přidejte pouze jednou. Dělení vyřešíte přímo v
                jeho kartě.
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
                Přidejte první předmět a nastavte jeho hodiny jedním průchodem.
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
              Dělená hodina se započítá oběma učitelům, protože oba skutečně učí
              současně.
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
                  ? `${plan.rows.length} předmětů · ${splitCount} dělených · ${doubleBlockCount} dvojhodinových bloků · všechny úvazky sedí.`
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
  const sortedTeachers = [...staffingPlan.teachers].sort((left, right) => {
    const leftMatch = teacherMatchesSubject(left, row.subjectCode) ? 0 : 1;
    const rightMatch = teacherMatchesSubject(right, row.subjectCode) ? 0 : 1;
    if (leftMatch !== rightMatch) return leftMatch - rightMatch;
    return teacherLabel(left).localeCompare(teacherLabel(right), "cs-CZ");
  });

  function selectTeacher(
    value: string,
    target: "primaryTeacherId" | "secondaryTeacherId",
  ): void {
    update((current) => ({ ...current, [target]: value }));
  }

  return (
    <article
      data-testid={`teaching-row-${index}`}
      className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border bg-surface-subtle px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-full bg-primary-subtle font-semibold text-primary">
            {index + 1}
          </div>
          <div>
            <h3 className="font-semibold text-text-primary">
              {subjectLabel(row.subjectCode)}
            </h3>
            <p className="mt-0.5 text-xs text-text-muted">
              {row.weeklyPeriods} h týdně · {humanBlockSummary(row)}
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
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_180px]">
          <label className="space-y-1.5 text-sm font-medium text-text-primary">
            1. Který předmět?
            <select
              value={row.subjectCode}
              onChange={(event) =>
                update((current) => ({
                  ...current,
                  subjectCode: event.target.value,
                  primaryTeacherId: "",
                  secondaryTeacherId: "",
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
          <label className="space-y-1.5 text-sm font-medium text-text-primary">
            Kolik hodin týdně?
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
          <p className="mt-1 text-sm text-text-secondary">
            Nezadáváte technický počet bloků. Vyberte variantu, která odpovídá
            běžnému školnímu týdnu.
          </p>
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

          <div
            className="mt-4 rounded-xl border border-primary/30 bg-primary-subtle p-4"
            data-testid={`block-preview-${index}`}
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">
              Takto to uvidí solver
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {validation.blockDurations.length > 0 ? (
                validation.blockDurations.map((duration, blockIndex) => (
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
                ))
              ) : (
                <p className="text-sm text-danger-strong">
                  Toto rozložení zatím nejde vytvořit.
                </p>
              )}
            </div>
            <p className="mt-3 text-sm font-medium text-text-primary">
              {humanBlockSummary(row)}
            </p>
          </div>
        </div>

        <div>
          <h4 className="font-semibold text-text-primary">
            3. Učí se celá třída společně?
          </h4>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
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
                    }))
                  }
                  className={
                    selected
                      ? "rounded-xl border-2 border-primary bg-primary-subtle p-4 text-left"
                      : "rounded-xl border border-border-strong bg-surface p-4 text-left hover:border-primary/50 hover:bg-primary-subtle/40"
                  }
                >
                  <div className="flex items-center gap-3">
                    <div className="flex size-9 items-center justify-center rounded-full bg-surface text-primary">
                      {organization.value === "SPLIT" ? "2" : "1"}
                    </div>
                    <div>
                      <p className="font-semibold text-text-primary">
                        {organization.label}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-text-secondary">
                        {organization.description}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          {row.organization === "SPLIT" ? (
            <div className="mt-3 rounded-xl border border-success-border bg-success-subtle p-4 text-sm text-success-strong">
              <strong>Obě skupiny budou vždy ve stejnou dobu.</strong> Solver je
              umístí paralelně a zabrání kolizi obou učitelů.
            </div>
          ) : null}
        </div>

        <div>
          <h4 className="font-semibold text-text-primary">4. Kdo bude učit?</h4>
          <p className="mt-1 text-sm text-text-secondary">
            Učitelé, kteří mají tento předmět uvedený v úvazku, jsou v seznamu
            nahoře.
          </p>
          <div
            className={
              row.organization === "SPLIT"
                ? "mt-3 grid gap-4 md:grid-cols-2"
                : "mt-3 max-w-xl"
            }
          >
            <TeacherSelect
              label={row.organization === "SPLIT" ? "Skupina 1" : "Celá třída"}
              value={row.primaryTeacherId}
              teachers={sortedTeachers}
              subjectCode={row.subjectCode}
              onChange={(value) => selectTeacher(value, "primaryTeacherId")}
              ariaLabel={`Učitel 1 předmětu ${index + 1}`}
            />
            {row.organization === "SPLIT" ? (
              <TeacherSelect
                label="Skupina 2"
                value={row.secondaryTeacherId}
                teachers={sortedTeachers}
                subjectCode={row.subjectCode}
                onChange={(value) => selectTeacher(value, "secondaryTeacherId")}
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
                  {validation.messages.map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-xl border border-success-border bg-success-subtle p-4 text-success-strong">
            <CheckCircle2 className="size-5" aria-hidden="true" />
            <p className="font-semibold">
              Hotovo — {humanBlockSummary(row)} ·{" "}
              {row.organization === "SPLIT"
                ? "dvě souběžné skupiny"
                : "celá třída"}
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
