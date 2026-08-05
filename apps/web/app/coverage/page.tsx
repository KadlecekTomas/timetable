"use client";

import {
  AlertTriangle,
  ArrowRight,
  BookOpenCheck,
  CheckCircle2,
  CircleHelp,
  FileSpreadsheet,
  Filter,
  Sparkles,
  Upload,
  UsersRound,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChangeEvent, useEffect, useMemo, useState } from "react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  buildCoverageOverview,
  coverageCellKey,
  type CoverageCell,
  type CoverageStatus,
} from "@/lib/domain/coverage-overview";
import { autoCoverTeachingPlan } from "@/lib/domain/auto-cover-teaching-plan";
import {
  analyzeStaffingWorkbook,
  type StaffingWorkbookAnalysis,
} from "@/lib/import/staffing-workbook";
import { LOCAL_SCHOOL_YEAR_ID } from "@/lib/local/api";
import {
  STAFFING_PLAN_CHANGE_EVENT,
  createEmptyStaffingPlan,
  loadStaffingPlan,
  saveStaffingPlan,
  type StaffingPlan,
} from "@/lib/local/staffing-plan";
import {
  TEACHING_PLAN_CHANGE_EVENT,
  createEmptyTeachingPlan,
  loadTeachingPlan,
  saveTeachingPlan,
  type TeachingPlan,
} from "@/lib/local/teaching-plan";
import { cn } from "@/lib/utils";

const cellStyles: Record<CoverageStatus, string> = {
  FULL: "border-success-border bg-success-subtle text-success-strong hover:ring-success",
  PARTIAL:
    "border-warning-border bg-warning-subtle text-warning-strong hover:ring-warning",
  MISSING:
    "border-danger-border bg-danger-subtle text-danger-strong hover:ring-danger",
};

const statusLabels: Record<CoverageStatus, string> = {
  FULL: "Pokryto",
  PARTIAL: "Částečně",
  MISSING: "Chybí",
};

function formatHours(value: number): string {
  return value.toLocaleString("cs-CZ", {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 1,
    maximumFractionDigits: 1,
  });
}

function percentage(value: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((value / total) * 100)));
}

function issueLocation(issue: {
  row: number | null;
  field: string | null;
}): string {
  const parts = [
    issue.row ? `řádek ${issue.row}` : "",
    issue.field ? issue.field : "",
  ].filter(Boolean);
  return parts.length > 0 ? `${parts.join(" · ")}: ` : "";
}

export default function CoveragePage() {
  const searchParams = useSearchParams();
  const schoolYearId = searchParams.get("schoolYearId") ?? LOCAL_SCHOOL_YEAR_ID;
  const context = `schoolYearId=${encodeURIComponent(schoolYearId)}`;

  const [staffingPlan, setStaffingPlan] = useState<StaffingPlan>(() =>
    createEmptyStaffingPlan(),
  );
  const [teachingPlan, setTeachingPlan] = useState<TeachingPlan>(() =>
    createEmptyTeachingPlan(),
  );
  const [loaded, setLoaded] = useState(false);
  const [problemOnly, setProblemOnly] = useState(false);
  const [selectedKey, setSelectedKey] = useState("");
  const [analysis, setAnalysis] = useState<StaffingWorkbookAnalysis | null>(
    null,
  );
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const refresh = () => {
      setStaffingPlan(loadStaffingPlan());
      setTeachingPlan(loadTeachingPlan());
      setLoaded(true);
    };

    refresh();
    window.addEventListener(STAFFING_PLAN_CHANGE_EVENT, refresh);
    window.addEventListener(TEACHING_PLAN_CHANGE_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(STAFFING_PLAN_CHANGE_EVENT, refresh);
      window.removeEventListener(TEACHING_PLAN_CHANGE_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const overview = useMemo(
    () => buildCoverageOverview(teachingPlan, staffingPlan),
    [teachingPlan, staffingPlan],
  );
  const selectedCell = selectedKey
    ? (overview.cellByKey.get(selectedKey) ?? null)
    : null;
  const hasStaffing = staffingPlan.teachers.length > 0;
  const allCovered =
    overview.summary.requiredTeacherHours > 0 &&
    overview.summary.missingTeacherHours === 0;

  const visibleClasses = problemOnly
    ? overview.classes.filter((classCode) =>
        overview.problems.some((problem) => problem.classCode === classCode),
      )
    : overview.classes;
  const visibleSubjects = problemOnly
    ? overview.subjects.filter((subject) =>
        overview.problems.some(
          (problem) => problem.subjectCode === subject.code,
        ),
      )
    : overview.subjects;

  const warningIssues = analysis?.issues.filter(
    (issue) => issue.severity === "WARNING",
  );
  const errorIssues = analysis?.issues.filter(
    (issue) => issue.severity === "ERROR",
  );

  async function importStaffingWorkbook(
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
      if (!result.valid) {
        setError(
          "Excel obsahuje blokující chyby. Nic se nepřepsalo; konkrétní místa jsou vypsaná níže.",
        );
        return;
      }
      if (
        staffingPlan.teachers.length > 0 &&
        !window.confirm(
          "Nahradit současný seznam učitelů a úvazků tímto Excelem?",
        )
      ) {
        return;
      }

      const savedStaffing = saveStaffingPlan(result.plan);
      const refreshedTeaching = loadTeachingPlan();
      setStaffingPlan(savedStaffing);
      setTeachingPlan(refreshedTeaching);

      const warnings = result.issues.filter(
        (issue) => issue.severity === "WARNING",
      ).length;
      setMessage(
        warnings > 0
          ? `Excel byl načten. Našli jsme ${warnings} míst k doplnění; jsou barevně označená v přehledu.`
          : "Excel byl načten a všechny rozpoznané vazby jsou pokryté.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Excel se nepodařilo přečíst.",
      );
    } finally {
      setBusy(false);
      event.target.value = "";
    }
  }


  function completeCoverage(): void {
    setError(null);
    setMessage(null);

    try {
      const result = autoCoverTeachingPlan(teachingPlan, staffingPlan);
      if (result.unresolved.length > 0) {
        const details = result.unresolved
          .slice(0, 3)
          .map(
            (item) =>
              `${item.classCode || item.roleLabel} ${item.subjectCode}: ${item.reason}`,
          )
          .join(" ");
        setError(
          `Automatické doplnění nelze bezpečně dokončit. ${details}`,
        );
        return;
      }

      const savedStaffing = saveStaffingPlan(result.staffingPlan);
      const savedTeaching = saveTeachingPlan(result.teachingPlan);
      setStaffingPlan(savedStaffing);
      setTeachingPlan(savedTeaching);
      setSelectedKey("");

      const assignmentLabel =
        result.assignments.length === 1
          ? "chybějící místo"
          : result.assignments.length >= 2 && result.assignments.length <= 4
            ? "chybějící místa"
            : "chybějících míst";
      const summary = [
        `Automaticky doplněno ${result.assignments.length} ${assignmentLabel}.`,
      ];
      if (result.totalIncreasedHours > 0) {
        summary.push(
          `Úvazek byl navýšen u ${result.increasedTeachers.length} učitelů celkem o ${formatHours(result.totalIncreasedHours)} h.`,
        );
      }
      if (result.forcedAssignmentCount > 0) {
        summary.push(
          `Pozor: ${result.forcedAssignmentCount} přiřazení nemělo v datech uvedenou aprobaci; byl použit nejméně zatížený dostupný učitel.`,
        );
      }
      setMessage(summary.join(" "));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Automatické doplnění se nepodařilo.",
      );
    }
  }

  if (!loaded) {
    return <p className="text-sm text-text-muted">Načítám pokrytí výuky…</p>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Krok 2"
        title="Pokrytí hodinové dotace"
        description="Jednoduchý pohled na to, které hodiny mají učitele, které jsou pokryté jen zčásti a kde učitel úplně chybí."
        actions={
          <div className="flex flex-wrap gap-2">
            {hasStaffing && !allCovered ? (
              <Button type="button" onClick={completeCoverage}>
                <Sparkles className="size-4" aria-hidden="true" />
                Doplnit vše automaticky
              </Button>
            ) : null}
            <Button asChild variant="outline">
              <Link href={`/teaching-plan?${context}`}>
                <Wrench className="size-4" aria-hidden="true" />
                Podrobný editor
              </Link>
            </Button>
          </div>
        }
      />

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <article className="rounded-2xl border border-border bg-surface p-6">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary-subtle text-primary">
                <FileSpreadsheet className="size-6" aria-hidden="true" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-text-primary">
                  Nahrát učitele a úvazky
                </h2>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-text-secondary">
                  Nahrajte i nehotový druhý Excel. Neúplná místa import
                  nezahodí: zobrazí je oranžově nebo červeně a přesně vypíše, co
                  chybí.
                </p>
                {fileName ? (
                  <p className="mt-2 text-xs text-text-muted">
                    Poslední soubor: {fileName}
                  </p>
                ) : null}
              </div>
            </div>
            <label className="inline-flex h-11 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 focus-within:ring-2 focus-within:ring-primary">
              <Upload className="size-4" aria-hidden="true" />
              {busy ? "Načítám…" : "Nahrát Excel"}
              <input
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="sr-only"
                disabled={busy}
                onChange={(event) => void importStaffingWorkbook(event)}
                aria-label="Nahrát Excel s učiteli a úvazky"
              />
            </label>
          </div>
        </article>

        <article className="rounded-2xl border border-border bg-surface p-6">
          <div className="flex items-start gap-3">
            <BookOpenCheck
              className="mt-0.5 size-5 text-primary"
              aria-hidden="true"
            />
            <div>
              <h2 className="font-semibold text-text-primary">
                Časová dotace je připravená
              </h2>
              <p className="mt-1 text-sm leading-6 text-text-secondary">
                {overview.classes.length} tříd ·{" "}
                {formatHours(overview.summary.requiredClassPeriods)} hodin výuky
                tříd týdně. Data vycházejí z dodaného prvního Excelu.
              </p>
            </div>
          </div>
        </article>
      </section>

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

      {analysis && (warningIssues?.length || errorIssues?.length) ? (
        <section className="rounded-2xl border border-border bg-surface p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle
              className={cn(
                "mt-0.5 size-5 shrink-0",
                errorIssues?.length ? "text-danger" : "text-warning",
              )}
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold text-text-primary">
                Co bylo v Excelu nalezeno
              </h2>
              <p className="mt-1 text-sm text-text-secondary">
                Zobrazeno je konkrétní místo, ne pouze jeden celkový počet.
              </p>
              <div className="mt-4 grid gap-2 lg:grid-cols-2">
                {[...(errorIssues ?? []), ...(warningIssues ?? [])]
                  .slice(0, 20)
                  .map((issue, index) => (
                    <div
                      key={`${issue.row}-${issue.field}-${index}`}
                      className={cn(
                        "rounded-lg border p-3 text-sm",
                        issue.severity === "ERROR"
                          ? "border-danger-border bg-danger-subtle text-danger-strong"
                          : "border-warning-border bg-warning-subtle text-warning-strong",
                      )}
                    >
                      <span className="font-semibold">
                        {issueLocation(issue)}
                      </span>
                      {issue.message}
                    </div>
                  ))}
              </div>
              {(errorIssues?.length ?? 0) + (warningIssues?.length ?? 0) >
              20 ? (
                <p className="mt-3 text-xs text-text-muted">
                  Další upozornění jsou dostupná v podrobném editoru.
                </p>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      <section
        className={cn(
          "rounded-2xl border p-6",
          allCovered
            ? "border-success-border bg-success-subtle"
            : hasStaffing
              ? "border-warning-border bg-warning-subtle"
              : "border-info-border bg-info-subtle",
        )}
      >
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-4">
            {allCovered ? (
              <CheckCircle2
                className="mt-0.5 size-7 shrink-0 text-success"
                aria-hidden="true"
              />
            ) : hasStaffing ? (
              <AlertTriangle
                className="mt-0.5 size-7 shrink-0 text-warning"
                aria-hidden="true"
              />
            ) : (
              <CircleHelp
                className="mt-0.5 size-7 shrink-0 text-info"
                aria-hidden="true"
              />
            )}
            <div>
              <h2 className="text-xl font-semibold text-text-primary">
                {allCovered
                  ? "Všechny hodiny mají potřebné učitele"
                  : hasStaffing
                    ? `Chybí pokrýt ${formatHours(overview.summary.missingTeacherHours)} učitelských hodin`
                    : "Nahrajte druhý Excel a uvidíte skutečné pokrytí"}
              </h2>
              <p className="mt-1 text-sm leading-6 text-text-secondary">
                {hasStaffing
                  ? "Každá chybějící hodina je níže rozpadnutá podle třídy, předmětu a chybějící skupiny."
                  : "Červená nyní znamená, že ještě nebyl načten seznam učitelů — nikoli chybu v časové dotaci."}
              </p>
            </div>
          </div>
          <StatusBadge
            tone={allCovered ? "success" : hasStaffing ? "warning" : "info"}
            className="shrink-0 px-3 py-2 text-sm"
          >
            {overview.summary.coveragePercent} % pokryto
          </StatusBadge>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-xl border border-border bg-surface p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            Dotace tříd
          </p>
          <p className="mt-2 text-3xl font-semibold text-text-primary">
            {formatHours(overview.summary.requiredClassPeriods)} h
          </p>
          <p className="mt-1 text-sm text-text-secondary">
            podle učebního plánu
          </p>
        </article>
        <article className="rounded-xl border border-success-border bg-success-subtle p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-success-strong">
            Plně pokryto
          </p>
          <p className="mt-2 text-3xl font-semibold text-success-strong">
            {overview.summary.fullCells}
          </p>
          <p className="mt-1 text-sm text-success-strong">
            kombinací třída × předmět
          </p>
        </article>
        <article className="rounded-xl border border-warning-border bg-warning-subtle p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-warning-strong">
            Částečně pokryto
          </p>
          <p className="mt-2 text-3xl font-semibold text-warning-strong">
            {overview.summary.partialCells}
          </p>
          <p className="mt-1 text-sm text-warning-strong">
            například 1/2 skupin
          </p>
        </article>
        <article className="rounded-xl border border-danger-border bg-danger-subtle p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-danger-strong">
            Bez učitele
          </p>
          <p className="mt-2 text-3xl font-semibold text-danger-strong">
            {overview.summary.missingCells}
          </p>
          <p className="mt-1 text-sm text-danger-strong">konkrétních buněk</p>
        </article>
      </section>

      <section className="overflow-hidden rounded-2xl border border-border bg-surface">
        <div className="flex flex-col gap-4 border-b border-border p-5 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">
              Hodinová dotace a její pokrytí
            </h2>
            <p className="mt-1 text-sm text-text-secondary">
              Kliknutím na barevnou buňku zobrazíte učitele a přesný důvod
              problému.
            </p>
          </div>
          <Button
            type="button"
            variant={problemOnly ? "default" : "outline"}
            onClick={() => setProblemOnly((value) => !value)}
          >
            <Filter className="size-4" aria-hidden="true" />
            {problemOnly ? "Zobrazit vše" : "Jen problémy"}
          </Button>
        </div>

        <div className="flex flex-wrap gap-4 border-b border-border bg-surface-subtle px-5 py-3 text-xs font-medium">
          <span className="inline-flex items-center gap-2 text-success-strong">
            <span className="size-3 rounded border border-success-border bg-success-subtle" />
            Zelená: všichni potřební učitelé
          </span>
          <span className="inline-flex items-center gap-2 text-warning-strong">
            <span className="size-3 rounded border border-warning-border bg-warning-subtle" />
            Oranžová: část skupin, například 1/2
          </span>
          <span className="inline-flex items-center gap-2 text-danger-strong">
            <span className="size-3 rounded border border-danger-border bg-danger-subtle" />
            Červená: žádný učitel
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 z-20 min-w-24 border-b border-r border-border bg-surface px-4 py-3 text-left font-semibold text-text-primary">
                  Třída
                </th>
                {visibleSubjects.map((subject) => (
                  <th
                    key={subject.code}
                    title={subject.label}
                    className="min-w-24 border-b border-r border-border bg-surface-subtle px-2 py-3 text-center"
                  >
                    <span className="block font-semibold text-text-primary">
                      {subject.code}
                    </span>
                    <span className="mt-0.5 block truncate text-[10px] font-normal text-text-muted">
                      {subject.label}
                    </span>
                  </th>
                ))}
                <th className="sticky right-0 z-10 min-w-28 border-b border-border bg-surface px-3 py-3 text-center font-semibold text-text-primary">
                  Stav třídy
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleClasses.map((classCode) => {
                const classCells = overview.cells.filter(
                  (cell) => cell.classCode === classCode,
                );
                const classProblems = classCells.filter(
                  (cell) => cell.status !== "FULL",
                );
                const classPercent = percentage(
                  classCells.reduce(
                    (total, cell) => total + cell.assignedTeacherHours,
                    0,
                  ),
                  classCells.reduce(
                    (total, cell) => total + cell.requiredTeacherHours,
                    0,
                  ),
                );
                return (
                  <tr key={classCode}>
                    <th className="sticky left-0 z-10 border-b border-r border-border bg-surface px-4 py-3 text-left text-base font-semibold text-text-primary">
                      {classCode}
                    </th>
                    {visibleSubjects.map((subject) => {
                      const key = coverageCellKey(classCode, subject.code);
                      const cell = overview.cellByKey.get(key);
                      if (!cell) {
                        return (
                          <td
                            key={key}
                            className="border-b border-r border-border bg-surface px-2 py-2 text-center text-text-muted"
                          >
                            —
                          </td>
                        );
                      }
                      return (
                        <td
                          key={key}
                          className="border-b border-r border-border bg-surface p-1.5"
                        >
                          <button
                            type="button"
                            data-testid={`coverage-${classCode}-${subject.code}`}
                            data-status={cell.status}
                            onClick={() => setSelectedKey(key)}
                            className={cn(
                              "flex min-h-14 w-full flex-col items-center justify-center rounded-lg border px-2 py-2 text-center transition hover:ring-2 focus-visible:outline-none focus-visible:ring-2",
                              cellStyles[cell.status],
                              selectedKey === key && "ring-2",
                            )}
                            aria-label={`${classCode} ${subject.label}: ${statusLabels[cell.status]}, ${cell.assignedSlots} z ${cell.requiredSlots} učitelů nebo skupin`}
                          >
                            <span className="text-base font-bold">
                              {cell.assignedSlots}/{cell.requiredSlots}
                            </span>
                            <span className="text-[10px] font-medium">
                              {formatHours(cell.requiredClassPeriods)} h
                            </span>
                          </button>
                        </td>
                      );
                    })}
                    <td className="sticky right-0 border-b border-border bg-surface px-3 py-2 text-center">
                      <StatusBadge
                        tone={
                          classProblems.length === 0
                            ? "success"
                            : classPercent > 0
                              ? "warning"
                              : "danger"
                        }
                        className="justify-center"
                      >
                        {classProblems.length === 0
                          ? "Hotovo"
                          : `${classProblems.length} problémů`}
                      </StatusBadge>
                      <p className="mt-1 text-xs text-text-muted">
                        {classPercent} %
                      </p>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {visibleClasses.length === 0 || visibleSubjects.length === 0 ? (
          <div className="p-8 text-center text-sm text-text-muted">
            V tomto filtru nejsou žádné problémy.
          </div>
        ) : null}
      </section>

      {selectedCell ? (
        <CoverageCellDetail
          cell={selectedCell}
          onClose={() => setSelectedKey("")}
          editorHref={`/teaching-plan?${context}`}
        />
      ) : null}

      {overview.problems.length > 0 ? (
        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <article className="rounded-2xl border border-border bg-surface p-5">
            <h2 className="font-semibold text-text-primary">
              Konkrétní místa k doplnění
            </h2>
            <p className="mt-1 text-sm text-text-secondary">
              Největší problémy jsou nahoře. Kliknutím otevřete detail buňky.
            </p>
            <div className="mt-4 space-y-2">
              {overview.problems.slice(0, 12).map((problem) => (
                <button
                  key={problem.key}
                  type="button"
                  onClick={() => setSelectedKey(problem.key)}
                  className="flex w-full items-center justify-between gap-3 rounded-lg border border-border p-3 text-left hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <span className="min-w-0">
                    <span className="block font-semibold text-text-primary">
                      {problem.classCode} · {problem.subjectLabel}
                    </span>
                    <span className="mt-0.5 block text-xs text-text-muted">
                      {problem.missingRoles.join(", ")}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <StatusBadge
                      tone={problem.status === "PARTIAL" ? "warning" : "danger"}
                    >
                      {problem.assignedSlots}/{problem.requiredSlots}
                    </StatusBadge>
                    <ArrowRight
                      className="size-4 text-text-muted"
                      aria-hidden="true"
                    />
                  </span>
                </button>
              ))}
            </div>
          </article>

          <BreakdownCard
            title="Rozpad podle tříd"
            items={overview.classBreakdown}
          />
          <BreakdownCard
            title="Rozpad podle předmětů"
            items={overview.subjectBreakdown}
          />
        </section>
      ) : null}

      {hasStaffing ? (
        <section className="overflow-hidden rounded-2xl border border-border bg-surface">
          <div className="border-b border-border p-5">
            <div className="flex items-start gap-3">
              <UsersRound
                className="mt-0.5 size-5 text-primary"
                aria-hidden="true"
              />
              <div>
                <h2 className="font-semibold text-text-primary">
                  Jednoduchá kontrola úvazků
                </h2>
                <p className="mt-1 text-sm text-text-secondary">
                  Výuka je počítaná ze skutečně přiřazených buněk. Nevýukové
                  funkce, například 5 hodin vedení ICT, jsou uvedené zvlášť.
                </p>
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-surface-subtle text-left text-xs uppercase tracking-wide text-text-muted">
                <tr>
                  <th className="px-5 py-3">Učitel</th>
                  <th className="px-4 py-3 text-right">Výuka</th>
                  <th className="px-4 py-3 text-right">Nevýuka</th>
                  <th className="px-4 py-3 text-right">Celkem</th>
                  <th className="px-4 py-3 text-right">Úvazek</th>
                  <th className="px-5 py-3 text-right">Stav</th>
                </tr>
              </thead>
              <tbody>
                {overview.teachers.slice(0, 20).map((teacher) => (
                  <tr
                    key={teacher.teacherId}
                    className="border-t border-border"
                  >
                    <td className="px-5 py-3 font-medium text-text-primary">
                      {teacher.teacherName}
                    </td>
                    <td className="px-4 py-3 text-right text-text-secondary">
                      {formatHours(teacher.scheduledTeachingHours)} h
                    </td>
                    <td className="px-4 py-3 text-right text-text-secondary">
                      {formatHours(teacher.nonTeachingHours)} h
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-text-primary">
                      {formatHours(teacher.totalUsedHours)} h
                    </td>
                    <td className="px-4 py-3 text-right text-text-secondary">
                      {formatHours(teacher.targetWeeklyLoad)} h
                    </td>
                    <td className="px-5 py-3 text-right">
                      <StatusBadge
                        tone={
                          teacher.status === "FULL"
                            ? "success"
                            : teacher.status === "UNDER"
                              ? "warning"
                              : "danger"
                        }
                      >
                        {teacher.status === "FULL"
                          ? "Sedí"
                          : teacher.status === "UNDER"
                            ? `Chybí ${formatHours(teacher.difference)} h`
                            : `Navíc ${formatHours(Math.abs(teacher.difference))} h`}
                      </StatusBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {overview.teachers.length > 20 ? (
            <p className="border-t border-border p-4 text-center text-xs text-text-muted">
              Zobrazeno prvních 20 učitelů. Kompletní úpravy jsou v podrobném
              editoru.
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function CoverageCellDetail({
  cell,
  onClose,
  editorHref,
}: {
  cell: CoverageCell;
  onClose: () => void;
  editorHref: string;
}) {
  const rotationHours = Math.max(
    0,
    ...cell.rows
      .filter((row) => row.roleLabel.includes("rotačně"))
      .map((row) => row.teacherHours),
  );
  const residualHours =
    cell.rows
      .filter((row) => !row.roleLabel.includes("rotačně"))
      .reduce((total, row) => total + row.teacherHours, 0) / 2;
  return (
    <section className="rounded-2xl border-2 border-primary bg-surface p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold text-text-primary">
              {cell.classCode} · {cell.subjectLabel}
            </h2>
            <StatusBadge
              tone={
                cell.status === "FULL"
                  ? "success"
                  : cell.status === "PARTIAL"
                    ? "warning"
                    : "danger"
              }
            >
              {statusLabels[cell.status]}
            </StatusBadge>
          </div>
          <p className="mt-2 text-sm text-text-secondary">
            Dotace {formatHours(cell.requiredClassPeriods)} h týdně · obsazeno{" "}
            {cell.assignedSlots}/{cell.requiredSlots} potřebných učitelů nebo
            skupin.
          </p>
          {rotationHours > 0 && residualHours > 0 ? (
            <p className="mt-2 text-sm font-medium text-warning-strong">
              {formatHours(rotationHours)} h obě skupiny rotačně,{" "}
              {formatHours(residualHours)} h pouze jedna skupina.
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-sm font-medium text-text-secondary hover:text-text-primary"
        >
          Zavřít detail
        </button>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-surface-subtle p-4">
          <h3 className="font-semibold text-text-primary">Přiřazení</h3>
          <div className="mt-3 space-y-2">
            {cell.rows.map((row, index) => (
              <div
                key={`${row.rowId}-${row.roleLabel}-${index}`}
                className="flex items-center justify-between gap-3 rounded-lg bg-surface px-3 py-2"
              >
                <span>
                  <span className="block text-sm font-medium text-text-primary">
                    {row.roleLabel}
                  </span>
                  <span className="block text-xs text-text-muted">
                    {formatHours(row.teacherHours)} učitelských hodin
                  </span>
                </span>
                <StatusBadge tone={row.assigned ? "success" : "danger"}>
                  {row.assigned ? row.teacherName : "Chybí učitel"}
                </StatusBadge>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface-subtle p-4">
          <h3 className="font-semibold text-text-primary">Co udělat</h3>
          {cell.missingRoles.length > 0 ? (
            <>
              <p className="mt-2 text-sm text-text-secondary">
                Doplňte: {cell.missingRoles.join(", ")}.
              </p>
              <p className="mt-2 text-sm text-text-secondary">
                Celkem chybí {formatHours(cell.missingTeacherHours)} učitelských
                hodin týdně.
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-success-strong">
              Tato položka je kompletně pokrytá.
            </p>
          )}
          <Button asChild className="mt-4" variant="outline">
            <Link href={editorHref}>
              Otevřít podrobnou úpravu
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

function BreakdownCard({
  title,
  items,
}: {
  title: string;
  items: Array<{
    code: string;
    label: string;
    requiredClassPeriods: number;
    missingClassPeriods: number;
    problemCells: number;
  }>;
}) {
  const relevant = items.filter((item) => item.problemCells > 0).slice(0, 10);
  return (
    <article className="rounded-2xl border border-border bg-surface p-5">
      <h2 className="font-semibold text-text-primary">{title}</h2>
      <p className="mt-1 text-sm text-text-secondary">
        Nepokrytá část dotace, nikoli jen jeden souhrnný počet.
      </p>
      <div className="mt-4 space-y-3">
        {relevant.map((item) => {
          const ratio = percentage(
            item.requiredClassPeriods - item.missingClassPeriods,
            item.requiredClassPeriods,
          );
          return (
            <div key={item.code}>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate font-medium text-text-primary">
                  {item.label}
                </span>
                <span className="shrink-0 text-danger-strong">
                  chybí {formatHours(item.missingClassPeriods)} h
                </span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-danger-subtle">
                <div
                  className="h-full rounded-full bg-success"
                  style={{ width: `${ratio}%` }}
                />
              </div>
            </div>
          );
        })}
        {relevant.length === 0 ? (
          <div className="flex items-center gap-2 rounded-lg bg-success-subtle p-3 text-sm text-success-strong">
            <CheckCircle2 className="size-4" aria-hidden="true" />
            Bez problému
          </div>
        ) : null}
      </div>
    </article>
  );
}
