"use client";

import {
  AlertTriangle,
  ArrowRight,
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
import { useSearchParams } from "next/navigation";
import {
  ChangeEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  analyzeStaffingWorkbook,
  createStaffingWorkbookTemplate,
  type StaffingWorkbookAnalysis,
} from "@/lib/import/staffing-workbook";
import { LOCAL_SCHOOL_YEAR_ID, localApiFetch } from "@/lib/local/api";
import {
  STAFFING_DAYS,
  MAX_WEEKLY_TEACHER_LOAD,
  STAFFING_SUBJECTS,
  assignedWeeklyLoad,
  createEmptyStaffingTeacher,
  createEmptySubjectLoad,
  loadStaffingPlan,
  saveStaffingPlan,
  teacherCodesForPlan,
  validateStaffingPlan,
  validateStaffingTeacher,
  type StaffingDayCode,
  type StaffingPlan,
  type StaffingTeacher,
} from "@/lib/local/staffing-plan";

const inputClass =
  "h-11 w-full rounded-lg border border-border-strong bg-surface px-3 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

const unsavedNavigationMessage =
  "Máte neuložené změny u učitelů. Opravdu chcete stránku opustit?";

type TeacherFilter = "ALL" | "PROBLEMS" | "UNSAVED";

interface ResourceResponse {
  items: Array<Record<string, unknown>>;
}

interface SchoolYearResponse {
  version: number;
  periodsPerDay: number[];
}

function numberValue(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nextVersion(
  payload: { schoolYearVersion?: number },
  fallback: number,
): number {
  return payload.schoolYearVersion ?? fallback + 1;
}

function teacherFingerprint(teacher: StaffingTeacher): string {
  return JSON.stringify({
    firstName: teacher.firstName,
    lastName: teacher.lastName,
    targetWeeklyLoad: teacher.targetWeeklyLoad,
    subjectLoads: teacher.subjectLoads,
    unavailableDays: teacher.unavailableDays,
  });
}

function teacherLabel(teacher: StaffingTeacher, fallbackIndex: number): string {
  const name = `${teacher.firstName} ${teacher.lastName}`.trim();
  return name || `Nový učitel ${fallbackIndex + 1}`;
}

export default function StaffingPage() {
  const searchParams = useSearchParams();
  const schoolYearId = searchParams.get("schoolYearId") ?? LOCAL_SCHOOL_YEAR_ID;
  const context = `schoolYearId=${encodeURIComponent(schoolYearId)}`;

  const [plan, setPlan] = useState<StaffingPlan>(() => ({
    version: 1,
    updatedAt: new Date(0).toISOString(),
    teachers: [],
  }));
  const [savedPlan, setSavedPlan] = useState<StaffingPlan>(() => ({
    version: 1,
    updatedAt: new Date(0).toISOString(),
    teachers: [],
  }));
  const [loaded, setLoaded] = useState(false);
  const [fileName, setFileName] = useState("");
  const [analysis, setAnalysis] = useState<StaffingWorkbookAnalysis | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [syncProgress, setSyncProgress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [filter, setFilter] = useState<TeacherFilter>("ALL");
  const allowNavigationRef = useRef(false);

  useEffect(() => {
    const stored = loadStaffingPlan();
    setPlan(stored);
    setSavedPlan(stored);
    setLoaded(true);
  }, []);

  const validations = useMemo(
    () =>
      new Map(
        plan.teachers.map((teacher) => [
          teacher.id,
          validateStaffingTeacher(teacher),
        ]),
      ),
    [plan.teachers],
  );

  const duplicateTeacherIds = useMemo(() => {
    const idsByName = new Map<string, string[]>();
    for (const teacher of plan.teachers) {
      const key =
        `${teacher.lastName.trim()}|${teacher.firstName.trim()}`.toLocaleLowerCase(
          "cs-CZ",
        );
      if (key === "|") continue;
      idsByName.set(key, [...(idsByName.get(key) ?? []), teacher.id]);
    }
    return new Set(
      [...idsByName.values()]
        .filter((ids) => ids.length > 1)
        .flatMap((ids) => ids),
    );
  }, [plan.teachers]);

  const problemTeacherIds = useMemo(
    () =>
      new Set(
        plan.teachers
          .filter(
            (teacher) =>
              !validations.get(teacher.id)?.valid ||
              duplicateTeacherIds.has(teacher.id),
          )
          .map((teacher) => teacher.id),
      ),
    [duplicateTeacherIds, plan.teachers, validations],
  );

  const dirtyTeacherIds = useMemo(() => {
    const savedById = new Map(
      savedPlan.teachers.map((teacher) => [teacher.id, teacher]),
    );
    return new Set(
      plan.teachers
        .filter((teacher) => {
          const saved = savedById.get(teacher.id);
          return !saved || teacherFingerprint(saved) !== teacherFingerprint(teacher);
        })
        .map((teacher) => teacher.id),
    );
  }, [plan.teachers, savedPlan.teachers]);

  const hasUnsavedChanges = dirtyTeacherIds.size > 0;

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges || allowNavigationRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };

    const handleDocumentClick = (event: MouseEvent) => {
      if (!hasUnsavedChanges || event.defaultPrevented || event.button !== 0) {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const destination = new URL(anchor.href, window.location.href);
      if (
        destination.href === window.location.href ||
        (destination.pathname === window.location.pathname &&
          destination.search === window.location.search &&
          destination.hash !== window.location.hash)
      ) {
        return;
      }
      if (!window.confirm(unsavedNavigationMessage)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      allowNavigationRef.current = true;
      window.setTimeout(() => {
        allowNavigationRef.current = false;
      }, 0);
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("click", handleDocumentClick, true);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("click", handleDocumentClick, true);
    };
  }, [hasUnsavedChanges]);

  const planMessages = useMemo(() => validateStaffingPlan(plan), [plan]);
  const allValid = plan.teachers.length > 0 && planMessages.length === 0;
  const totalTarget = plan.teachers.reduce(
    (total, teacher) => total + teacher.targetWeeklyLoad,
    0,
  );
  const totalAssigned = plan.teachers.reduce(
    (total, teacher) => total + assignedWeeklyLoad(teacher),
    0,
  );
  const unavailableDays = plan.teachers.reduce(
    (total, teacher) => total + teacher.unavailableDays.length,
    0,
  );

  const visibleTeachers = useMemo(() => {
    const ordered = plan.teachers
      .map((teacher, originalIndex) => ({ teacher, originalIndex }))
      .sort((left, right) => {
        const problemDifference =
          Number(problemTeacherIds.has(right.teacher.id)) -
          Number(problemTeacherIds.has(left.teacher.id));
        if (problemDifference !== 0) return problemDifference;
        const dirtyDifference =
          Number(dirtyTeacherIds.has(right.teacher.id)) -
          Number(dirtyTeacherIds.has(left.teacher.id));
        return dirtyDifference || left.originalIndex - right.originalIndex;
      });

    if (filter === "PROBLEMS") {
      return ordered.filter(({ teacher }) =>
        problemTeacherIds.has(teacher.id),
      );
    }
    if (filter === "UNSAVED") {
      return ordered.filter(({ teacher }) => dirtyTeacherIds.has(teacher.id));
    }
    return ordered;
  }, [dirtyTeacherIds, filter, plan.teachers, problemTeacherIds]);

  function updateTeacher(
    teacherId: string,
    update: (teacher: StaffingTeacher) => StaffingTeacher,
  ): void {
    setPlan((currentPlan) => ({
      ...currentPlan,
      teachers: currentPlan.teachers.map((teacher) =>
        teacher.id === teacherId ? update(teacher) : teacher,
      ),
    }));
    setMessage((current) =>
      current?.startsWith("Uloženo:") ? null : current,
    );
  }

  function addTeacher(): void {
    setPlan((currentPlan) => ({
      ...currentPlan,
      teachers: [...currentPlan.teachers, createEmptyStaffingTeacher()],
    }));
    setFilter("ALL");
  }

  function saveTeacher(teacherId: string): void {
    const teacher = plan.teachers.find((item) => item.id === teacherId);
    if (!teacher) return;

    try {
      const savedById = new Map(
        savedPlan.teachers.map((item) => [item.id, item]),
      );
      const nextSavedTeachers = plan.teachers
        .filter((item) => item.id === teacherId || savedById.has(item.id))
        .map((item) =>
          item.id === teacherId ? teacher : savedById.get(item.id)!,
        );
      const saved = saveStaffingPlan({
        ...savedPlan,
        teachers: nextSavedTeachers,
      });
      setSavedPlan(saved);
      setPlan((currentPlan) => ({
        ...currentPlan,
        updatedAt: saved.updatedAt,
      }));
      setError(null);
      setMessage(
        `Uloženo: ${teacherLabel(teacher, plan.teachers.indexOf(teacher))}.`,
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? `Uložení karty selhalo: ${cause.message}`
          : "Uložení karty selhalo. Změny zůstaly otevřené na stránce.",
      );
    }
  }

  function removeTeacher(teacher: StaffingTeacher): void {
    if (
      !window.confirm(
        `Opravdu odstranit ${teacher.firstName || "tohoto učitele"} ${teacher.lastName}?`,
      )
    ) {
      return;
    }

    try {
      const wasSaved = savedPlan.teachers.some((item) => item.id === teacher.id);
      if (wasSaved) {
        const saved = saveStaffingPlan({
          ...savedPlan,
          teachers: savedPlan.teachers.filter((item) => item.id !== teacher.id),
        });
        setSavedPlan(saved);
      }
      setPlan((currentPlan) => ({
        ...currentPlan,
        teachers: currentPlan.teachers.filter((item) => item.id !== teacher.id),
      }));
      setMessage(null);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? `Odstranění učitele selhalo: ${cause.message}`
          : "Odstranění učitele selhalo.",
      );
    }
  }

  async function downloadTemplate(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const bytes = await createStaffingWorkbookTemplate();
      const copy = new Uint8Array(bytes.byteLength);
      copy.set(bytes);
      const blob = new Blob([copy.buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "01-ucitele-a-uvazky.xlsx";
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Šablonu se nepodařilo vytvořit.",
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
      const result = await analyzeStaffingWorkbook(await file.arrayBuffer());
      setAnalysis(result);
      if (!result.valid) return;
      if (
        plan.teachers.length > 0 &&
        !window.confirm(
          "Nahradit aktuálně rozepsané učitele obsahem tohoto Excelu? Neuložené změny se zahodí.",
        )
      ) {
        return;
      }
      setPlan(result.plan);
      setFilter("ALL");
      setMessage(
        `Načteno ${result.summary.teachers} učitelů. Problémové karty jsou nahoře; každou změněnou kartu uložte jejím tlačítkem Uložit.`,
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Soubor se nepodařilo přečíst.",
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
    if (hasUnsavedChanges) {
      setError("Nejdřív uložte všechny změněné karty učitelů.");
      return;
    }
    const validationMessages = validateStaffingPlan(plan);
    if (validationMessages.length > 0) {
      setError(validationMessages[0]!);
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      setSyncProgress("Kontroluji současná data školy…");
      const [schoolYear, teachers, assignments, availability] =
        await Promise.all([
          requestJson<SchoolYearResponse>(`/api/school-years/${schoolYearId}`),
          requestJson<ResourceResponse>(
            `/api/school-years/${schoolYearId}/teachers`,
          ),
          requestJson<ResourceResponse>(
            `/api/school-years/${schoolYearId}/assignments`,
          ),
          requestJson<ResourceResponse>(
            `/api/school-years/${schoolYearId}/availability`,
          ),
        ]);

      if (assignments.items.length > 0) {
        throw new Error(
          "Učitele zatím nelze hromadně nahradit, protože už jsou použiti ve výukových vazbách. Tento krok patří na začátek před rozdělením tříd.",
        );
      }

      let version = schoolYear.version;
      const deleteRecord = async (resource: string, id: string) => {
        const payload = await requestJson<{ schoolYearVersion?: number }>(
          `/api/school-years/${schoolYearId}/${resource}/${encodeURIComponent(id)}`,
          {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ expectedSchoolYearVersion: version }),
          },
        );
        version = nextVersion(payload, version);
      };

      const teacherAvailability = availability.items.filter(
        (item) => item.entityType === "TEACHER" && typeof item.id === "string",
      );
      for (let index = 0; index < teacherAvailability.length; index += 1) {
        setSyncProgress(
          `Mažu starou dostupnost ${index + 1}/${teacherAvailability.length}…`,
        );
        await deleteRecord(
          "availability",
          String(teacherAvailability[index]!.id),
        );
      }

      for (let index = 0; index < teachers.items.length; index += 1) {
        const teacher = teachers.items[index]!;
        if (typeof teacher.id !== "string") continue;
        setSyncProgress(
          `Nahrazuji seznam učitelů ${index + 1}/${teachers.items.length}…`,
        );
        await deleteRecord("teachers", teacher.id);
      }

      const codes = teacherCodesForPlan(plan);
      for (let index = 0; index < plan.teachers.length; index += 1) {
        const teacher = plan.teachers[index]!;
        setSyncProgress(
          `Ukládám učitele ${index + 1}/${plan.teachers.length}: ${teacher.lastName}…`,
        );
        const payload = await requestJson<{ schoolYearVersion?: number }>(
          `/api/school-years/${schoolYearId}/teachers`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              expectedSchoolYearVersion: version,
              code: codes.get(teacher.id),
              firstName: teacher.firstName,
              lastName: teacher.lastName,
              targetWeeklyLoad: teacher.targetWeeklyLoad,
              minWeeklyLoad: null,
              maxWeeklyLoad: null,
            }),
          },
        );
        version = nextVersion(payload, version);
      }

      const storedTeachers = await requestJson<ResourceResponse>(
        `/api/school-years/${schoolYearId}/teachers`,
      );
      const teacherIdByCode = new Map(
        storedTeachers.items
          .filter(
            (
              item,
            ): item is Record<string, unknown> & { id: string; code: string } =>
              typeof item.id === "string" && typeof item.code === "string",
          )
          .map((item) => [item.code, item.id]),
      );

      const availabilityTasks = plan.teachers.flatMap((teacher) => {
        const teacherCode = codes.get(teacher.id)!;
        const teacherId = teacherIdByCode.get(teacherCode);
        if (!teacherId) return [];
        return teacher.unavailableDays.flatMap((dayCode) => {
          const day = STAFFING_DAYS.find((item) => item.code === dayCode)!;
          const periods = schoolYear.periodsPerDay[day.dayIndex] ?? 0;
          return Array.from({ length: periods }, (_, period) => ({
            teacher,
            teacherId,
            day,
            period,
          }));
        });
      });

      for (let index = 0; index < availabilityTasks.length; index += 1) {
        const task = availabilityTasks[index]!;
        setSyncProgress(
          `Ukládám nedostupné dny ${index + 1}/${availabilityTasks.length}…`,
        );
        const payload = await requestJson<{ schoolYearVersion?: number }>(
          `/api/school-years/${schoolYearId}/availability`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              expectedSchoolYearVersion: version,
              entityType: "TEACHER",
              entityId: task.teacherId,
              dayOfWeek: task.day.dayIndex,
              period: task.period,
              kind: "UNAVAILABLE",
              weight: null,
              reason: `${task.teacher.firstName} ${task.teacher.lastName} nemůže celý den ${task.day.label.toLocaleLowerCase("cs-CZ")}.`,
            }),
          },
        );
        version = nextVersion(payload, version);
      }

      setMessage(
        `Hotovo. Uloženo ${plan.teachers.length} učitelů včetně celých nedostupných dnů.`,
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Uložení se nepodařilo.",
      );
    } finally {
      setBusy(false);
      setSyncProgress("");
    }
  }

  if (!loaded) {
    return <p className="text-sm text-text-muted">Načítám personální plán…</p>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Krok 1"
        title="Učitelé a úvazky"
        description="Nejdřív zapište pouze lidi, jejich celkový úvazek, rozdělení hodin mezi předměty a celé dny, kdy nemohou učit. Každou kartu uložte samostatně."
        actions={
          <Button
            type="button"
            variant="outline"
            onClick={() => void downloadTemplate()}
            disabled={busy}
          >
            <Download className="size-4" aria-hidden="true" />
            Stáhnout jednoduchý Excel
          </Button>
        }
      />

      <section
        data-testid="staffing-manual-save-status"
        aria-live="polite"
        className={
          hasUnsavedChanges
            ? "flex items-start gap-3 rounded-xl border border-warning-border bg-warning-subtle p-4"
            : "flex items-start gap-3 rounded-xl border border-success-border bg-success-subtle p-4"
        }
      >
        {hasUnsavedChanges ? (
          <AlertTriangle
            className="mt-0.5 size-5 shrink-0 text-warning"
            aria-hidden="true"
          />
        ) : (
          <CheckCircle2
            className="mt-0.5 size-5 shrink-0 text-success"
            aria-hidden="true"
          />
        )}
        <div>
          <h2 className="font-semibold text-text-primary">
            {hasUnsavedChanges
              ? `${dirtyTeacherIds.size} ${dirtyTeacherIds.size === 1 ? "neuložená karta" : "neuložené karty"}`
              : "Všechny změny jsou uložené v tomto prohlížeči"}
          </h2>
          <p className="mt-1 text-sm leading-6 text-text-secondary">
            {hasUnsavedChanges
              ? "U každé změněné karty klikněte na Uložit. Při odchodu ze stránky vás aplikace upozorní."
              : "Další úpravy se samy neuloží. Po změně použijte tlačítko Uložit přímo u učitele."}
          </p>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        {[
          ["1", "Stáhněte Excel", "Jeden učitel = jeden jednoduchý řádek."],
          [
            "2",
            "Vyplňte hodiny",
            "Součet předmětů musí přesně sedět na úvazek.",
          ],
          [
            "3",
            "Uložte každou kartu",
            "Neuložené změny jsou označené přímo u učitele.",
          ],
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
            Nahrajte vyplněný Excel
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-text-secondary">
            Soubor se nejprve zkontroluje. Problémové karty budou v seznamu
            automaticky nahoře a všechny změny uložíte ručně.
          </p>
          <label className="mt-5 inline-flex cursor-pointer items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
            <Upload className="size-4" aria-hidden="true" />
            {busy ? "Pracuji…" : "Vybrat Excel"}
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
                Soubor neobsahuje použitelný pracovní koncept. Opravte označené
                řádky a nahrajte ho znovu.
              </p>
              <ul className="mt-3 space-y-1 text-sm text-danger-strong">
                {analysis.issues.slice(0, 10).map((issue, index) => (
                  <li key={`${issue.row}-${issue.field}-${index}`}>
                    {issue.row ? `Řádek ${issue.row}: ` : ""}
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
          ["Učitelé", plan.teachers.length],
          ["Úvazky celkem", `${totalTarget} h`],
          ["Rozděleno do předmětů", `${totalAssigned} h`],
          ["Celé nedostupné dny", unavailableDays],
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

      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">
              Seznam učitelů
            </h2>
            <p className="mt-1 text-sm text-text-secondary">
              Karty s chybou jsou vždy první. Pomocí filtrů můžete zobrazit jen
              problémy nebo jen neuložené změny.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div
              className="flex flex-wrap gap-2"
              role="group"
              aria-label="Filtrovat učitele"
            >
              {[
                ["ALL", `Všichni (${plan.teachers.length})`],
                ["PROBLEMS", `K opravě (${problemTeacherIds.size})`],
                ["UNSAVED", `Neuložené (${dirtyTeacherIds.size})`],
              ].map(([value, label]) => (
                <Button
                  key={value}
                  type="button"
                  variant={filter === value ? "default" : "outline"}
                  onClick={() => setFilter(value as TeacherFilter)}
                  aria-pressed={filter === value}
                >
                  {label}
                </Button>
              ))}
            </div>
            <Button type="button" variant="outline" onClick={addTeacher}>
              <Plus className="size-4" aria-hidden="true" />
              Přidat učitele ručně
            </Button>
          </div>
        </div>

        {plan.teachers.length === 0 ? (
          <article className="rounded-xl border border-border bg-surface p-10 text-center">
            <UsersRound
              className="mx-auto size-10 text-text-muted"
              aria-hidden="true"
            />
            <h3 className="mt-4 font-semibold text-text-primary">
              Zatím tu není žádný učitel
            </h3>
            <p className="mt-1 text-sm text-text-secondary">
              Nahrajte jednoduchý Excel nebo přidejte prvního učitele ručně.
            </p>
          </article>
        ) : null}

        {plan.teachers.length > 0 && visibleTeachers.length === 0 ? (
          <article className="rounded-xl border border-border bg-surface p-8 text-center">
            <CheckCircle2
              className="mx-auto size-9 text-success"
              aria-hidden="true"
            />
            <h3 className="mt-3 font-semibold text-text-primary">
              Tento filtr nemá žádné výsledky
            </h3>
            <p className="mt-1 text-sm text-text-secondary">
              Zvolte jiný filtr nebo přidejte nového učitele.
            </p>
          </article>
        ) : null}

        {visibleTeachers.map(({ teacher, originalIndex }) => {
          const validation = validations.get(teacher.id)!;
          const duplicate = duplicateTeacherIds.has(teacher.id);
          const hasProblem = problemTeacherIds.has(teacher.id);
          const dirty = dirtyTeacherIds.has(teacher.id);
          const cardMessages = duplicate
            ? [
                ...validation.messages,
                "Učitel se stejným jménem je uveden vícekrát.",
              ]
            : validation.messages;
          const percentage =
            teacher.targetWeeklyLoad > 0
              ? Math.min(
                  100,
                  Math.round(
                    (validation.assignedWeeklyLoad / teacher.targetWeeklyLoad) *
                      100,
                  ),
                )
              : validation.assignedWeeklyLoad === 0
                ? 100
                : 0;
          const label = teacherLabel(teacher, originalIndex);
          return (
            <article
              key={teacher.id}
              data-testid={`teacher-card-${teacher.id}`}
              className={
                hasProblem
                  ? "overflow-hidden rounded-2xl border border-danger-border bg-surface shadow-sm"
                  : "overflow-hidden rounded-2xl border border-border bg-surface shadow-sm"
              }
            >
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border bg-surface-subtle px-5 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-full bg-primary-subtle font-semibold text-primary">
                    {originalIndex + 1}
                  </div>
                  <div>
                    <h3 className="font-semibold text-text-primary">{label}</h3>
                    <p className="text-xs text-text-muted">
                      {validation.assignedWeeklyLoad} z{" "}
                      {teacher.targetWeeklyLoad} hodin
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <StatusBadge tone={hasProblem ? "danger" : "success"}>
                    {hasProblem ? "Je potřeba opravit" : "Úvazek sedí"}
                  </StatusBadge>
                  {dirty ? (
                    <StatusBadge tone="warning">Neuloženo</StatusBadge>
                  ) : (
                    <StatusBadge tone="neutral">Uloženo</StatusBadge>
                  )}
                  <Button
                    type="button"
                    variant={dirty ? "default" : "outline"}
                    onClick={() => saveTeacher(teacher.id)}
                    disabled={!dirty}
                    aria-label={`Uložit ${label}`}
                  >
                    <Save className="size-4" aria-hidden="true" />
                    {dirty ? "Uložit" : "Uloženo"}
                  </Button>
                  <button
                    type="button"
                    onClick={() => removeTeacher(teacher)}
                    className="rounded-md p-2 text-text-muted hover:bg-danger-subtle hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    aria-label={`Odstranit ${label}`}
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </button>
                </div>
              </div>

              <div className="space-y-6 p-5">
                <div className="grid gap-4 md:grid-cols-[1fr_1fr_180px]">
                  <label className="space-y-1.5 text-sm font-medium text-text-primary">
                    Jméno
                    <input
                      value={teacher.firstName}
                      onChange={(event) =>
                        updateTeacher(teacher.id, (current) => ({
                          ...current,
                          firstName: event.target.value,
                        }))
                      }
                      className={inputClass}
                      placeholder="Jana"
                    />
                  </label>
                  <label className="space-y-1.5 text-sm font-medium text-text-primary">
                    Příjmení
                    <input
                      value={teacher.lastName}
                      onChange={(event) =>
                        updateTeacher(teacher.id, (current) => ({
                          ...current,
                          lastName: event.target.value,
                        }))
                      }
                      className={inputClass}
                      placeholder="Nováková"
                    />
                  </label>
                  <label className="space-y-1.5 text-sm font-medium text-text-primary">
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
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <h4 className="font-semibold text-text-primary">
                        Co učí a kolik hodin
                      </h4>
                      <p className="mt-1 text-sm text-text-secondary">
                        Součet musí být přesně {teacher.targetWeeklyLoad} hodin.
                      </p>
                    </div>
                    <div className="text-right">
                      <p
                        className={
                          validation.valid
                            ? "text-lg font-bold text-success"
                            : "text-lg font-bold text-danger"
                        }
                      >
                        {validation.assignedWeeklyLoad} /{" "}
                        {teacher.targetWeeklyLoad} h
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 h-3 overflow-hidden rounded-full bg-surface-subtle">
                    <div
                      className={
                        validation.valid
                          ? "h-full rounded-full bg-success transition-all"
                          : "h-full rounded-full bg-danger transition-all"
                      }
                      style={{ width: `${percentage}%` }}
                    />
                  </div>

                  <div className="mt-4 space-y-2">
                    {teacher.subjectLoads.map((load) => (
                      <div
                        key={load.id}
                        className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_130px_40px]"
                      >
                        <select
                          value={load.subjectCode}
                          onChange={(event) =>
                            updateTeacher(teacher.id, (current) => ({
                              ...current,
                              subjectLoads: current.subjectLoads.map((item) =>
                                item.id === load.id
                                  ? { ...item, subjectCode: event.target.value }
                                  : item,
                              ),
                            }))
                          }
                          className={inputClass}
                          aria-label="Předmět"
                        >
                          <option value="">Vyberte předmět</option>
                          {STAFFING_SUBJECTS.map((subject) => (
                            <option key={subject.code} value={subject.code}>
                              {subject.label} ({subject.code})
                            </option>
                          ))}
                        </select>
                        <div className="relative">
                          <input
                            type="number"
                            min={0}
                            max={40}
                            step={1}
                            value={load.weeklyPeriods}
                            onChange={(event) =>
                              updateTeacher(teacher.id, (current) => ({
                                ...current,
                                subjectLoads: current.subjectLoads.map(
                                  (item) =>
                                    item.id === load.id
                                      ? {
                                          ...item,
                                          weeklyPeriods: numberValue(
                                            event.target.value,
                                          ),
                                        }
                                      : item,
                                ),
                              }))
                            }
                            className={`${inputClass} pr-9`}
                            aria-label="Počet hodin předmětu"
                          />
                          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-text-muted">
                            h
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            updateTeacher(teacher.id, (current) => ({
                              ...current,
                              subjectLoads: current.subjectLoads.filter(
                                (item) => item.id !== load.id,
                              ),
                            }))
                          }
                          className="flex h-11 items-center justify-center rounded-lg border border-border text-text-muted hover:border-danger-border hover:bg-danger-subtle hover:text-danger"
                          aria-label="Odstranit předmět"
                        >
                          <Trash2 className="size-4" aria-hidden="true" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    className="mt-2"
                    onClick={() =>
                      updateTeacher(teacher.id, (current) => ({
                        ...current,
                        subjectLoads: [
                          ...current.subjectLoads,
                          createEmptySubjectLoad(),
                        ],
                      }))
                    }
                  >
                    <Plus className="size-4" aria-hidden="true" />
                    Přidat další předmět
                  </Button>
                </div>

                <div>
                  <h4 className="font-semibold text-text-primary">
                    Které celé dny nemůže učit?
                  </h4>
                  <p className="mt-1 text-sm text-text-secondary">
                    Klikněte pouze na dny, kdy učitel nemůže přijít vůbec. Modré
                    tlačítko znamená „nemůže“.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {STAFFING_DAYS.map((day) => {
                      const selected = teacher.unavailableDays.includes(
                        day.code,
                      );
                      return (
                        <button
                          key={day.code}
                          type="button"
                          aria-label={`${day.shortLabel} ${selected ? "nemůže" : "může"}`}
                          aria-pressed={selected}
                          onClick={() =>
                            updateTeacher(teacher.id, (current) => ({
                              ...current,
                              unavailableDays: selected
                                ? current.unavailableDays.filter(
                                    (item) => item !== day.code,
                                  )
                                : [
                                    ...current.unavailableDays,
                                    day.code as StaffingDayCode,
                                  ],
                            }))
                          }
                          className={
                            selected
                              ? "min-w-24 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground"
                              : "min-w-24 rounded-lg border border-border-strong bg-surface px-4 py-3 text-sm font-semibold text-text-secondary hover:bg-surface-subtle"
                          }
                        >
                          {day.shortLabel}
                          <span className="ml-2 text-xs font-normal opacity-80">
                            {selected ? "nemůže" : "může"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {hasProblem ? (
                  <div className="rounded-xl border border-danger-border bg-danger-subtle p-4">
                    <div className="flex items-start gap-3">
                      <AlertTriangle
                        className="mt-0.5 size-5 shrink-0 text-danger"
                        aria-hidden="true"
                      />
                      <div>
                        <p className="font-semibold text-text-primary">
                          Tato karta ještě není hotová
                        </p>
                        <ul className="mt-2 space-y-1 text-sm text-danger-strong">
                          {cardMessages.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 rounded-xl border border-success-border bg-success-subtle p-4 text-success-strong">
                    <CheckCircle2 className="size-5" aria-hidden="true" />
                    <p className="font-semibold">
                      Hotovo — úvazek i předměty přesně sedí.
                    </p>
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </section>

      {plan.teachers.length > 0 ? (
        <section
          className={
            allValid && !hasUnsavedChanges
              ? "rounded-2xl border border-success-border bg-success-subtle p-6"
              : "rounded-2xl border border-warning-border bg-warning-subtle p-6"
          }
        >
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-3">
              {allValid && !hasUnsavedChanges ? (
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
                  {hasUnsavedChanges
                    ? "Nejdřív uložte změněné karty"
                    : allValid
                      ? "Všichni učitelé jsou připraveni"
                      : "Ještě je potřeba něco doplnit"}
                </h2>
                <p className="mt-1 text-sm text-text-secondary">
                  {hasUnsavedChanges
                    ? `${dirtyTeacherIds.size} karet čeká na ruční uložení.`
                    : allValid
                      ? `${plan.teachers.length} učitelů · ${totalTarget} hodin · úvazky přesně sedí.`
                      : (planMessages[0] ??
                        "Zkontrolujte červeně označené karty.")}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                onClick={() => void syncToProject()}
                disabled={!allValid || hasUnsavedChanges || busy}
              >
                <Save className="size-4" aria-hidden="true" />
                {syncProgress || "Uložit učitele do projektu"}
              </Button>
              {message?.startsWith("Hotovo") ? (
                <Button asChild variant="outline">
                  <Link href={`/teaching-plan?${context}`}>
                    Pokračovat na výuku tříd
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </Link>
                </Button>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      <details className="rounded-xl border border-border bg-surface p-5">
        <summary className="cursor-pointer font-semibold text-text-primary">
          Pokročilé možnosti
        </summary>
        <p className="mt-3 text-sm leading-6 text-text-secondary">
          Jednotlivé zakázané hodiny, preference konkrétních časů, minimum a
          maximum úvazku nebo technické kódy se řeší později. V základním kroku
          je záměrně neukazujeme.
        </p>
        <Button asChild variant="ghost" className="mt-3">
          <Link href={`/data?${context}`}>
            Volitelně upravit učebny a omezení
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </Button>
      </details>
    </div>
  );
}
