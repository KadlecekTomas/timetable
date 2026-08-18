"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Play,
  RefreshCw,
  Square,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import type { ReadinessReport } from "@/lib/domain/contracts";
import { generationFailureMessage } from "@/lib/generation-errors";
import {
  getLocalProject,
  localApiFetch,
  subscribeLocalProject,
} from "@/lib/local/api";
import {
  preparedInputState,
  type PreparedInputState,
} from "@/lib/local/school-input-state";
import {
  loadStaffingPlan,
  subscribeStaffingPlan,
} from "@/lib/local/staffing-plan";
import {
  loadTeachingPlan,
  subscribeTeachingPlan,
} from "@/lib/local/teaching-plan";
import { formatCzechCount, generationStatusLabels } from "@/lib/ui-labels";

interface RunView {
  id: string;
  status: string;
  qualityScore: number | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  candidateVersion: {
    id: string;
    name: string;
    qualityScore: number | null;
  } | null;
  explanation?: unknown;
}

interface PreparationView {
  staffingTeachers: number;
  teachingClasses: number;
  teachingRows: number;
  projectTeachers: number;
  projectClasses: number;
  projectSubjects: number;
  projectAssignments: number;
  state: PreparedInputState;
}

function runTone(
  status: string,
): "neutral" | "success" | "warning" | "danger" | "info" {
  if (["FEASIBLE", "OPTIMAL"].includes(status)) return "success";
  if (["FAILED", "INFEASIBLE"].includes(status)) return "danger";
  if (status === "CANCELLED") return "warning";
  if (status === "RUNNING") return "info";
  return "neutral";
}

export default function GeneratePage() {
  const searchParams = useSearchParams();
  const schoolYearId = searchParams.get("schoolYearId");
  const [readiness, setReadiness] = useState<ReadinessReport | null>(null);
  const [runs, setRuns] = useState<RunView[]>([]);
  const [timeLimitSeconds, setTimeLimitSeconds] = useState(180);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preparation, setPreparation] = useState<PreparationView | null>(null);
  const [preparationMessage, setPreparationMessage] = useState<string | null>(
    null,
  );

  const load = useCallback(async () => {
    if (!schoolYearId) return;
    const [readinessResponse, runsResponse, project] = await Promise.all([
      localApiFetch(`/api/school-years/${schoolYearId}/readiness`, {
        cache: "no-store",
      }),
      localApiFetch(`/api/school-years/${schoolYearId}/generation-runs`, {
        cache: "no-store",
      }),
      getLocalProject(),
    ]);
    if (readinessResponse.ok)
      setReadiness((await readinessResponse.json()) as ReadinessReport);
    if (runsResponse.ok) {
      const payload = (await runsResponse.json()) as { items: RunView[] };
      setRuns(payload.items);
    }
    const staffing = loadStaffingPlan();
    const teaching = loadTeachingPlan();
    setPreparation({
      staffingTeachers: staffing.teachers.length,
      teachingClasses: teaching.classes.length,
      teachingRows: teaching.rows.length,
      projectTeachers: project.teachers.length,
      projectClasses: project.classes.length,
      projectSubjects: project.subjects.length,
      projectAssignments: project.assignments.length,
      state: preparedInputState(project, staffing, teaching),
    });
  }, [schoolYearId]);

  useEffect(() => {
    void load();
    const unsubscribeProject = subscribeLocalProject(() => void load());
    const unsubscribeStaffing = subscribeStaffingPlan(() => void load());
    const unsubscribeTeaching = subscribeTeachingPlan(() => void load());
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => {
      unsubscribeProject();
      unsubscribeStaffing();
      unsubscribeTeaching();
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  useEffect(() => {
    if (!runs.some((run) => ["QUEUED", "RUNNING"].includes(run.status))) return;
    const timer = window.setInterval(() => void load(), 2000);
    return () => window.clearInterval(timer);
  }, [load, runs]);

  async function start() {
    if (!schoolYearId) return;
    setBusy(true);
    setError(null);
    try {
      const response = await localApiFetch(
        `/api/school-years/${schoolYearId}/generation-runs`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ timeLimitSeconds }),
        },
      );
      const payload = (await response.json()) as {
        error?: { message?: string; details?: { readiness?: ReadinessReport } };
      };
      if (!response.ok) {
        if (payload.error?.details?.readiness)
          setReadiness(payload.error.details.readiness);
        throw new Error(
          payload.error?.message ??
            "Úlohu se nepodařilo zařadit ke zpracování.",
        );
      }
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Úlohu se nepodařilo zařadit ke zpracování.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function prepare(forceReplaceGeneratedData = false) {
    if (!schoolYearId) return;
    setBusy(true);
    setError(null);
    setPreparationMessage(null);
    try {
      let response = await localApiFetch(
        `/api/school-years/${schoolYearId}/prepare-generation`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ forceReplaceGeneratedData }),
        },
      );
      let payload = (await response.json()) as {
        teachers?: number;
        classes?: number;
        subjects?: number;
        assignments?: number;
        error?: { message?: string };
      };
      if (response.status === 409 && !forceReplaceGeneratedData) {
        if (
          !window.confirm(
            "Příprava nových vstupních dat odstraní dosavadní návrhy rozvrhu.",
          )
        )
          return;
        response = await localApiFetch(
          `/api/school-years/${schoolYearId}/prepare-generation`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ forceReplaceGeneratedData: true }),
          },
        );
        payload = await response.json();
      }
      if (!response.ok)
        throw new Error(payload.error?.message ?? "Data nelze připravit.");
      setPreparationMessage(
        `Připraveno: ${formatCzechCount(payload.teachers ?? 0, ["učitel", "učitelé", "učitelů"])}, ${formatCzechCount(payload.classes ?? 0, ["třída", "třídy", "tříd"])}, ${formatCzechCount(payload.subjects ?? 0, ["předmět", "předměty", "předmětů"])} a ${formatCzechCount(payload.assignments ?? 0, ["výuková vazba", "výukové vazby", "výukových vazeb"])}.`,
      );
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Data nelze připravit.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function cancel(runId: string) {
    const response = await localApiFetch(`/api/generation-runs/${runId}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      const payload = (await response.json()) as {
        error?: { message?: string };
      };
      setError(payload.error?.message ?? "Výpočet nelze zrušit.");
    }
    await load();
  }

  if (!schoolYearId) {
    return (
      <div className="rounded-xl border border-warning-border bg-warning-subtle p-6">
        <h1 className="text-lg font-semibold">Nejprve vyberte školní rok</h1>
        <Button asChild className="mt-4">
          <Link href="/">Vrátit se na přehled</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Fáze 5–6"
        title="Tvorba rozvrhu"
        description="Po spuštění se návrh vytvoří a uloží do tohoto prohlížeče. Před výpočtem musí projít kontrola zadání."
        actions={
          <Button variant="outline" onClick={() => void load()}>
            <RefreshCw className="size-4" aria-hidden="true" />
            Obnovit
          </Button>
        }
      />

      {error ? (
        <div className="rounded-lg border border-danger-border bg-danger-subtle p-4 text-sm text-danger-strong">
          {error}
        </div>
      ) : null}

      <section className="rounded-xl border border-border bg-surface p-5">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h2 className="font-semibold text-text-primary">
              Připravit data pro tvorbu rozvrhu
            </h2>
            <p className="mt-1 text-sm text-text-secondary">
              Personální plán:{" "}
              {formatCzechCount(preparation?.staffingTeachers ?? 0, [
                "učitel",
                "učitelé",
                "učitelů",
              ])}
              {" · "}učební plán:{" "}
              {formatCzechCount(preparation?.teachingClasses ?? 0, [
                "třída",
                "třídy",
                "tříd",
              ])}{" "}
              a{" "}
              {formatCzechCount(preparation?.teachingRows ?? 0, [
                "řádek",
                "řádky",
                "řádků",
              ])}
              .
            </p>
            <p className="mt-1 text-xs text-text-muted">
              Připravený projekt:{" "}
              {formatCzechCount(preparation?.projectTeachers ?? 0, [
                "učitel",
                "učitelé",
                "učitelů",
              ])}
              {" · "}
              {formatCzechCount(preparation?.projectClasses ?? 0, [
                "třída",
                "třídy",
                "tříd",
              ])}
              {" · "}
              {formatCzechCount(preparation?.projectSubjects ?? 0, [
                "předmět",
                "předměty",
                "předmětů",
              ])}
              {" · "}
              {formatCzechCount(preparation?.projectAssignments ?? 0, [
                "výuková vazba",
                "výukové vazby",
                "výukových vazeb",
              ])}
              {" · "}
              {preparation?.state === "CURRENT"
                ? "aktuální"
                : preparation?.state === "STALE"
                  ? "zastaralý"
                  : "ještě nepřipravený"}
              .
            </p>
          </div>
          <Button onClick={() => void prepare()} disabled={busy}>
            Připravit a zkontrolovat data
          </Button>
        </div>
        {preparationMessage ? (
          <p className="mt-4 text-sm text-success-strong">
            {preparationMessage}
          </p>
        ) : null}
        <p className="mt-3 text-xs text-text-muted">
          <Link
            className="font-medium text-primary hover:underline"
            href={`/data?schoolYearId=${encodeURIComponent(schoolYearId)}`}
          >
            Volitelně upravit učebny
          </Link>
        </p>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <article className="rounded-xl border border-border bg-surface p-5">
          <div className="flex items-start gap-3">
            {readiness?.ready ? (
              <CheckCircle2
                className="mt-0.5 size-5 text-success"
                aria-hidden="true"
              />
            ) : (
              <AlertTriangle
                className="mt-0.5 size-5 text-warning"
                aria-hidden="true"
              />
            )}
            <div>
              <h2 className="font-semibold text-text-primary">
                {readiness == null
                  ? "Kontroluji připravenost…"
                  : readiness.ready
                    ? "Zadání je připravené"
                    : "Před tvorbou je potřeba opravit zadání"}
              </h2>
              <p className="mt-1 text-sm text-text-secondary">
                {readiness?.ready
                  ? `${formatCzechCount(readiness.summary.assignments, ["výuková vazba", "výukové vazby", "výukových vazeb"])} · ${formatCzechCount(readiness.summary.weekly_periods, ["hodina týdně", "hodiny týdně", "hodin týdně"])}`
                  : (readiness?.blockers[0]?.message ??
                    "Načítám kontrolu připravenosti…")}
              </p>
            </div>
          </div>
          {readiness?.blockers.length ? (
            <ul className="mt-4 space-y-2 rounded-lg bg-danger-subtle p-4 text-sm text-danger-strong">
              {readiness.blockers.slice(0, 6).map((item) => (
                <li key={`${item.code}-${item.message}`}>{item.message}</li>
              ))}
            </ul>
          ) : null}
        </article>

        <article className="rounded-xl border border-border bg-surface p-5">
          <label
            htmlFor="time-limit"
            className="text-sm font-medium text-text-primary"
          >
            Časový limit výpočtu
          </label>
          <select
            id="time-limit"
            value={timeLimitSeconds}
            onChange={(event) =>
              setTimeLimitSeconds(Number(event.target.value))
            }
            className="mt-2 h-10 w-full rounded-md border border-border-strong bg-surface px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <option value={30}>30 sekund · rychlý náhled</option>
            <option value={60}>1 minuta · orientační návrh</option>
            <option value={180}>3 minuty · doporučeno pro celou školu</option>
            <option value={300}>5 minut · maximum s bezpečnou rezervou</option>
          </select>
          <p className="mt-2 text-xs text-text-muted">
            Delší výpočet výrazně pomáhá omezit mezery tříd a učitelů.
            Pětiminutový režim na produkci ukončí solver s rezervou před
            serverovým timeoutem, aby se nejlepší nalezený návrh stihl uložit.
          </p>
          <Button
            className="mt-4 w-full"
            onClick={() => void start()}
            disabled={busy || !readiness?.ready}
          >
            <Play className="size-4" aria-hidden="true" />
            {busy ? "Počítám rozvrh…" : "Vytvořit nový návrh"}
          </Button>
        </article>
      </section>

      <section className="overflow-hidden rounded-xl border border-border bg-surface">
        <div className="border-b border-border px-5 py-4">
          <h2 className="font-semibold text-text-primary">
            Průběh tvorby rozvrhu
          </h2>
          <p className="mt-1 text-xs text-text-muted">
            Lokálně uložené výpočty a výsledné verze.
          </p>
        </div>
        {runs.length ? (
          <div className="divide-y divide-border">
            {runs.map((run) => (
              <div
                key={run.id}
                className="flex flex-wrap items-center justify-between gap-4 px-5 py-4"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-subtle">
                    <Clock3
                      className="size-4 text-text-muted"
                      aria-hidden="true"
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-mono text-xs text-text-primary">
                        {run.id}
                      </p>
                      <StatusBadge tone={runTone(run.status)}>
                        {generationStatusLabels[run.status] ?? run.status}
                      </StatusBadge>
                      {run.qualityScore != null ? (
                        <StatusBadge tone="success">
                          Skóre {run.qualityScore}/100
                        </StatusBadge>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-text-muted">
                      Vytvořeno{" "}
                      {new Date(run.createdAt).toLocaleString("cs-CZ")}
                    </p>
                    {["FAILED", "INFEASIBLE"].includes(run.status) ? (
                      <p className="mt-1 max-w-xl text-xs text-danger-strong">
                        {generationFailureMessage(run.explanation) ??
                          "Výpočet skončil bez výsledku. Zkuste jej spustit znovu."}
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {run.candidateVersion ? (
                    <Button asChild size="sm">
                      <a
                        href={`/timetable?schoolYearId=${encodeURIComponent(schoolYearId)}&versionId=${encodeURIComponent(run.candidateVersion.id)}`}
                      >
                        Otevřít návrh
                      </a>
                    </Button>
                  ) : null}
                  {["QUEUED", "RUNNING"].includes(run.status) ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void cancel(run.id)}
                    >
                      <Square className="size-3.5" aria-hidden="true" />
                      Zrušit
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-8 text-center text-sm text-text-muted">
            Zatím nebyl vytvořen žádný návrh. Jakmile zadání projde kontrolou,
            spusťte tvorbu výše.
          </div>
        )}
      </section>
    </div>
  );
}
