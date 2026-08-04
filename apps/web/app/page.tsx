"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import type { ReadinessReport } from "@/lib/domain/contracts";
import { buildCoverageOverview } from "@/lib/domain/coverage-overview";
import {
  getLocalProject,
  LOCAL_SCHOOL_YEAR_ID,
  localApiFetch,
  subscribeLocalProject,
  type LocalProject,
} from "@/lib/local/api";
import {
  preparedInputState,
  type PreparedInputState,
} from "@/lib/local/school-input-state";
import {
  MAX_WEEKLY_TEACHER_LOAD,
  loadStaffingPlan,
  subscribeStaffingPlan,
  type StaffingPlan,
} from "@/lib/local/staffing-plan";
import {
  loadTeachingPlan,
  subscribeTeachingPlan,
  validateTeachingPlan,
  type TeachingPlan,
} from "@/lib/local/teaching-plan";

interface DashboardState {
  staffing: StaffingPlan;
  teaching: TeachingPlan;
  project: LocalProject;
  readiness: ReadinessReport | null;
  prepared: PreparedInputState;
}

const emptyStaffing: StaffingPlan = { version: 1, updatedAt: "", teachers: [] };
const emptyTeaching: TeachingPlan = {
  version: 1,
  updatedAt: "",
  classes: [],
  rows: [],
};

function preparationLabel(state: PreparedInputState): string {
  if (state === "CURRENT") return "Připraveno";
  if (state === "STALE") return "Připravená data jsou zastaralá";
  return "Ještě nebyla připravena";
}

export default function HomePage() {
  const [state, setState] = useState<DashboardState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const context = `schoolYearId=${encodeURIComponent(LOCAL_SCHOOL_YEAR_ID)}`;

  const load = useCallback(async () => {
    try {
      const staffing = loadStaffingPlan();
      const teaching = loadTeachingPlan();
      const [project, readinessResponse] = await Promise.all([
        getLocalProject(),
        localApiFetch(`/api/school-years/${LOCAL_SCHOOL_YEAR_ID}/readiness`, {
          cache: "no-store",
        }),
      ]);
      const readiness = readinessResponse.ok
        ? ((await readinessResponse.json()) as ReadinessReport)
        : null;
      setState({
        staffing,
        teaching,
        project,
        readiness,
        prepared: preparedInputState(project, staffing, teaching),
      });
      setError(null);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Přehled se nepodařilo načíst.",
      );
    }
  }, []);

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

  const staffing = state?.staffing ?? emptyStaffing;
  const teaching = state?.teaching ?? emptyTeaching;
  const coverage = useMemo(
    () => buildCoverageOverview(teaching, staffing),
    [teaching, staffing],
  );
  const teachingBlockers = useMemo(
    () => validateTeachingPlan(teaching, staffing),
    [teaching, staffing],
  );
  const overloaded = staffing.teachers.filter(
    (teacher) => teacher.targetWeeklyLoad > MAX_WEEKLY_TEACHER_LOAD,
  );
  const overloadHours = overloaded.reduce(
    (total, teacher) =>
      total + teacher.targetWeeklyLoad - MAX_WEEKLY_TEACHER_LOAD,
    0,
  );
  const freeHours = coverage.teachers.reduce(
    (total, teacher) => total + Math.max(0, teacher.difference),
    0,
  );
  const splitCount = teaching.rows.filter(
    (row) => row.organization === "SPLIT",
  ).length;
  const rotationCount = teaching.rows.filter(
    (row) => row.organization === "ROTATION",
  ).length;

  const cta =
    staffing.teachers.length === 0
      ? { label: "Začít nahráním učitelů", href: `/staffing?${context}` }
      : overloaded.length > 0
        ? { label: "Opravit úvazky", href: `/staffing?${context}` }
        : coverage.summary.missingTeacherHours > 0
          ? { label: "Doplnit pokrytí", href: `/coverage?${context}` }
          : state?.prepared !== "CURRENT"
            ? {
                label: "Připravit data pro rozvrh",
                href: `/generate?${context}`,
              }
            : { label: "Vytvořit rozvrh", href: `/generate?${context}` };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Přehled"
        title="Příprava školního rozvrhu"
        description="Postupujte od personálního plánu přes pokrytí výuky až k přípravě dat pro generátor."
        actions={
          <Button asChild>
            <Link href={cta.href}>
              {cta.label}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </Button>
        }
      />

      {error ? (
        <div className="rounded-lg border border-danger-border bg-danger-subtle p-4 text-sm text-danger-strong">
          {error}
        </div>
      ) : null}

      <section className="rounded-xl border border-info-border bg-info-subtle p-5 text-sm text-text-secondary">
        Pracovní data obsahují{" "}
        <strong>{staffing.teachers.length} učitelů</strong> a{" "}
        <strong>{teaching.classes.length} tříd</strong>.{" "}
        {state?.prepared === "CURRENT"
          ? "Data jsou připravena pro generátor."
          : state?.prepared === "STALE"
            ? "Připravená data je potřeba obnovit."
            : "Data zatím nebyla připravena pro generátor."}
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <WorkflowCard
          step="1"
          title="Učitelé a úvazky"
          href={`/staffing?${context}`}
          action="Nahrát učitele a úvazky"
          status={
            staffing.teachers.length === 0
              ? "Nezadáno"
              : overloaded.length
                ? "Vyžaduje opravu"
                : "Hotovo"
          }
          tone={
            staffing.teachers.length === 0
              ? "neutral"
              : overloaded.length
                ? "danger"
                : "success"
          }
          values={[
            ["Učitelé", staffing.teachers.length],
            ["Přetížení učitelé", overloaded.length],
            ["Hodiny nad limitem", `${overloadHours} h`],
            ["Volné učitelské hodiny", `${freeHours} h`],
          ]}
        />
        <WorkflowCard
          step="2"
          title="Pokrytí výuky"
          href={`/coverage?${context}`}
          action="Zkontrolovat pokrytí"
          status={
            coverage.summary.missingTeacherHours > 0
              ? "Vyžaduje doplnění"
              : coverage.cells.length
                ? "Hotovo"
                : "Nezadáno"
          }
          tone={
            coverage.summary.missingTeacherHours > 0
              ? "warning"
              : coverage.cells.length
                ? "success"
                : "neutral"
          }
          values={[
            ["Pokrytí", `${coverage.summary.coveragePercent} %`],
            ["Plně pokryto", coverage.summary.fullCells],
            ["Částečně", coverage.summary.partialCells],
            [
              "Nepokryté učitelské hodiny",
              `${coverage.summary.missingTeacherHours} h`,
            ],
          ]}
        />
        <WorkflowCard
          step="3"
          title="Výukový plán"
          href={`/teaching-plan?${context}`}
          action="Otevřít podrobný editor"
          status={
            teaching.rows.length === 0
              ? "Nezadáno"
              : teachingBlockers.length
                ? "Vyžaduje opravu"
                : "Hotovo"
          }
          tone={
            teaching.rows.length === 0
              ? "neutral"
              : teachingBlockers.length
                ? "danger"
                : "success"
          }
          values={[
            ["Třídy", teaching.classes.length],
            ["Řádky výuky", teaching.rows.length],
            ["Dělená výuka", splitCount],
            ["Rotace", rotationCount],
            ["Blokující problémy", teachingBlockers.length],
          ]}
        />
        <WorkflowCard
          step="4"
          title="Data pro generátor"
          href={`/generate?${context}`}
          action={
            state?.prepared === "CURRENT"
              ? "Přejít k tvorbě rozvrhu"
              : "Připravit a zkontrolovat data"
          }
          status={preparationLabel(state?.prepared ?? "EMPTY")}
          tone={
            state?.prepared === "CURRENT"
              ? "success"
              : state?.prepared === "STALE"
                ? "warning"
                : "neutral"
          }
          values={[
            ["Učitelé", state?.project.teachers.length ?? 0],
            ["Třídy", state?.project.classes.length ?? 0],
            ["Předměty", state?.project.subjects.length ?? 0],
            ["Výukové vazby", state?.project.assignments.length ?? 0],
            [
              "Kontrola generátoru",
              state?.readiness?.ready ? "Prošla" : "Čeká",
            ],
          ]}
        />
      </section>
    </div>
  );
}

function WorkflowCard({
  step,
  title,
  href,
  action,
  status,
  tone,
  values,
}: {
  step: string;
  title: string;
  href: string;
  action: string;
  status: string;
  tone: "neutral" | "success" | "warning" | "danger";
  values: Array<[string, ReactNode]>;
}) {
  return (
    <article className="rounded-xl border border-border bg-surface p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
            {step}
          </div>
          <h2 className="font-semibold text-text-primary">{title}</h2>
        </div>
        <StatusBadge tone={tone}>{status}</StatusBadge>
      </div>
      <dl className="mt-5 grid grid-cols-2 gap-3">
        {values.map(([label, value]) => (
          <div key={label} className="rounded-lg bg-surface-subtle p-3">
            <dt className="text-xs text-text-muted">{label}</dt>
            <dd className="mt-1 text-lg font-semibold text-text-primary">
              {value}
            </dd>
          </div>
        ))}
      </dl>
      <Button asChild variant="outline" className="mt-5 w-full">
        <Link href={href}>
          {action}
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </Button>
    </article>
  );
}
