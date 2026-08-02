"use client";

import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookCheck,
  CheckCircle2,
  FileSpreadsheet,
  Layers3,
  RotateCcw,
  UsersRound,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { LOCAL_SCHOOL_YEAR_ID } from "@/lib/local/api";
import {
  STAFFING_SUBJECTS,
  loadStaffingPlan,
  type StaffingPlan,
  type StaffingTeacher,
} from "@/lib/local/staffing-plan";
import {
  clearPendingTeachingPlanImport,
  loadPendingTeachingPlanImport,
  type PendingTeachingPlanImport,
} from "@/lib/local/teaching-plan-import-review";
import {
  classProfileLabel,
  humanBlockSummary,
  loadTeachingPlan,
  rotationSummary,
  rowClassPeriods,
  rowTeacherPeriods,
  saveTeachingPlan,
  type TeachingClassProfile,
  type TeachingPlan,
  type TeachingPlanRow,
} from "@/lib/local/teaching-plan";

const STEPS = [
  {
    number: 1,
    label: "Učitelé",
    description: "Kdo je v Excelu uvedený a kolik hodin dostává.",
    icon: UsersRound,
  },
  {
    number: 2,
    label: "Třídy a dotace",
    description: "Každou třídu projdete samostatně před pokračováním.",
    icon: BookCheck,
  },
  {
    number: 3,
    label: "Dělení a dvojhodiny",
    description: "Kontrola všech neobvyklých organizací výuky.",
    icon: Layers3,
  },
  {
    number: 4,
    label: "Finální souhrn",
    description: "Teprve zde se návrh skutečně převezme.",
    icon: CheckCircle2,
  },
] as const;

type ReviewStep = 0 | 1 | 2 | 3;

interface TeacherReviewItem {
  teacher: StaffingTeacher;
  assignedPeriods: number;
  classes: string[];
  subjects: string[];
}

function teacherLabel(teacher: StaffingTeacher | undefined): string {
  if (!teacher) return "Neznámý učitel";
  return `${teacher.firstName} ${teacher.lastName}`.trim();
}

function subjectLabel(code: string): string {
  return STAFFING_SUBJECTS.find((item) => item.code === code)?.label ?? code;
}

function rowTeachers(row: TeachingPlanRow, staffingPlan: StaffingPlan): string {
  const byId = new Map(
    staffingPlan.teachers.map((teacher) => [teacher.id, teacher] as const),
  );
  const primary = teacherLabel(byId.get(row.primaryTeacherId));
  if (row.organization === "WHOLE") return primary;
  const secondary = teacherLabel(byId.get(row.secondaryTeacherId));
  if (row.organization === "ROTATION") {
    return `${row.subjectCode}: ${primary} / ${row.secondarySubjectCode ?? "2. předmět"}: ${secondary}`;
  }
  return `${primary} · skupina 1 / ${secondary} · skupina 2`;
}

function teacherReviewItems(
  plan: TeachingPlan,
  staffingPlan: StaffingPlan,
): TeacherReviewItem[] {
  const rowsByTeacher = new Map<string, TeachingPlanRow[]>();
  for (const row of plan.rows) {
    if (row.primaryTeacherId) {
      rowsByTeacher.set(row.primaryTeacherId, [
        ...(rowsByTeacher.get(row.primaryTeacherId) ?? []),
        row,
      ]);
    }
    if (row.organization !== "WHOLE" && row.secondaryTeacherId) {
      rowsByTeacher.set(row.secondaryTeacherId, [
        ...(rowsByTeacher.get(row.secondaryTeacherId) ?? []),
        row,
      ]);
    }
  }

  return staffingPlan.teachers
    .filter((teacher) => rowsByTeacher.has(teacher.id))
    .map((teacher) => {
      const rows = rowsByTeacher.get(teacher.id) ?? [];
      return {
        teacher,
        assignedPeriods: rows.reduce(
          (total, row) => total + rowTeacherPeriods(row, teacher.id),
          0,
        ),
        classes: [...new Set(rows.map((row) => row.classCode))].sort((a, b) =>
          a.localeCompare(b, "cs-CZ", { numeric: true }),
        ),
        subjects: [...new Set(rows.map((row) => row.subjectCode))].sort(
          (a, b) => a.localeCompare(b, "cs-CZ"),
        ),
      };
    })
    .sort((left, right) =>
      teacherLabel(left.teacher).localeCompare(
        teacherLabel(right.teacher),
        "cs-CZ",
      ),
    );
}

export default function TeachingPlanReviewPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const schoolYearId = searchParams.get("schoolYearId") ?? LOCAL_SCHOOL_YEAR_ID;
  const context = `schoolYearId=${encodeURIComponent(schoolYearId)}`;

  const [pending, setPending] = useState<PendingTeachingPlanImport | null>(
    null,
  );
  const [staffingPlan, setStaffingPlan] = useState<StaffingPlan>(() => ({
    version: 1,
    updatedAt: new Date(0).toISOString(),
    teachers: [],
  }));
  const [existingPlan, setExistingPlan] = useState<TeachingPlan | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [step, setStep] = useState<ReviewStep>(0);
  const [currentClassIndex, setCurrentClassIndex] = useState(0);
  const [confirmedClasses, setConfirmedClasses] = useState<string[]>([]);
  const [finalConfirmed, setFinalConfirmed] = useState(false);

  useEffect(() => {
    setPending(loadPendingTeachingPlanImport());
    setStaffingPlan(loadStaffingPlan());
    setExistingPlan(loadTeachingPlan());
    setLoaded(true);
  }, []);

  const teachers = useMemo(
    () =>
      pending
        ? teacherReviewItems(pending.plan, staffingPlan)
        : ([] satisfies TeacherReviewItem[]),
    [pending, staffingPlan],
  );
  const classes = useMemo(
    () =>
      pending
        ? [...pending.plan.classes].sort((left, right) =>
            left.code.localeCompare(right.code, "cs-CZ", { numeric: true }),
          )
        : [],
    [pending],
  );
  const specialRows = useMemo(
    () =>
      pending
        ? pending.plan.rows.filter(
            (row) =>
              row.lessonShape !== "SEPARATE" || row.organization !== "WHOLE",
          )
        : [],
    [pending],
  );

  const currentClass = classes[currentClassIndex];
  const currentClassRows = useMemo(
    () =>
      pending && currentClass
        ? pending.plan.rows
            .filter((row) => row.classCode === currentClass.code)
            .sort((left, right) =>
              subjectLabel(left.subjectCode).localeCompare(
                subjectLabel(right.subjectCode),
                "cs-CZ",
              ),
            )
        : [],
    [currentClass, pending],
  );
  const currentClassPeriods = currentClassRows.reduce(
    (total, row) => total + rowClassPeriods(row),
    0,
  );

  function goBackToUpload(): void {
    clearPendingTeachingPlanImport();
    router.replace(`/teaching-plan?${context}`);
  }

  function confirmCurrentClass(): void {
    if (!currentClass) return;
    setConfirmedClasses((current) =>
      current.includes(currentClass.code)
        ? current
        : [...current, currentClass.code],
    );
    if (currentClassIndex < classes.length - 1) {
      setCurrentClassIndex((current) => current + 1);
      return;
    }
    setStep(2);
  }

  function previousClassOrStep(): void {
    if (currentClassIndex > 0) {
      setCurrentClassIndex((current) => current - 1);
      return;
    }
    setStep(0);
  }

  function acceptImport(): void {
    if (!pending || !finalConfirmed) return;
    saveTeachingPlan(pending.plan);
    clearPendingTeachingPlanImport();
    router.replace(`/teaching-plan?${context}&imported=1`);
  }

  if (!loaded) {
    return (
      <p className="text-sm text-text-muted">Připravuji kontrolu Excelu…</p>
    );
  }

  if (!pending) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Kontrola importu"
          title="Není zde žádný Excel ke kontrole"
          description="Návrh se uchovává pouze po dobu této relace a nic se bez finálního potvrzení neukládá."
        />
        <section className="rounded-2xl border border-warning-border bg-warning-subtle p-8 text-center">
          <FileSpreadsheet
            className="mx-auto size-10 text-warning"
            aria-hidden="true"
          />
          <h2 className="mt-4 text-lg font-semibold text-text-primary">
            Nahrajte Excel znovu
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-text-secondary">
            Po úspěšném načtení vás aplikace automaticky přenese do tohoto
            kontrolního průvodce.
          </p>
          <Button
            type="button"
            className="mt-5"
            onClick={() => router.replace(`/teaching-plan?${context}`)}
          >
            Zpět na nahrání Excelu
          </Button>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Kontrola před převzetím"
        title="Sedí údaje z Excelu?"
        description={`Soubor ${pending.fileName} je zatím pouze dočasný návrh. Do plánu se zapíše až po posledním potvrzení.`}
        actions={
          <Button type="button" variant="outline" onClick={goBackToUpload}>
            <RotateCcw className="size-4" aria-hidden="true" />
            Zahodit návrh a nahrát znovu
          </Button>
        }
      />

      <section
        className="grid gap-3 md:grid-cols-4"
        aria-label="Postup kontroly importu"
      >
        {STEPS.map((item, index) => {
          const Icon = item.icon;
          const completed = index < step;
          const active = index === step;
          return (
            <article
              key={item.number}
              className={
                active
                  ? "rounded-xl border-2 border-primary bg-primary-subtle p-4"
                  : completed
                    ? "rounded-xl border border-success-border bg-success-subtle p-4"
                    : "rounded-xl border border-border bg-surface p-4"
              }
            >
              <div className="flex items-center justify-between gap-3">
                <div
                  className={
                    completed
                      ? "flex size-9 items-center justify-center rounded-full bg-success text-success-foreground"
                      : active
                        ? "flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground"
                        : "flex size-9 items-center justify-center rounded-full bg-surface-subtle text-text-muted"
                  }
                >
                  {completed ? (
                    <CheckCircle2 className="size-5" aria-hidden="true" />
                  ) : (
                    item.number
                  )}
                </div>
                <Icon
                  className={
                    active
                      ? "size-5 text-primary"
                      : completed
                        ? "size-5 text-success"
                        : "size-5 text-text-muted"
                  }
                  aria-hidden="true"
                />
              </div>
              <h2 className="mt-3 font-semibold text-text-primary">
                {item.label}
              </h2>
              <p className="mt-1 text-xs leading-5 text-text-secondary">
                {item.description}
              </p>
            </article>
          );
        })}
      </section>

      <section className="rounded-xl border border-primary/30 bg-primary-subtle p-4">
        <div className="flex items-start gap-3">
          <CheckCircle2
            className="mt-0.5 size-5 shrink-0 text-primary"
            aria-hidden="true"
          />
          <p className="text-sm leading-6 text-text-secondary">
            <strong className="text-text-primary">Bezpečný import:</strong> při
            procházení těchto stránek se existující plán nemění. Můžete se
            vracet, kontrolu zahodit nebo opravit původní Excel.
          </p>
        </div>
      </section>

      {step === 0 ? (
        <TeacherReviewStep
          items={teachers}
          onBack={goBackToUpload}
          onConfirm={() => {
            setCurrentClassIndex(0);
            setStep(1);
          }}
        />
      ) : null}

      {step === 1 && currentClass ? (
        <ClassReviewStep
          classCode={currentClass.code}
          classProfile={currentClass.profile ?? "REGULAR"}
          classIndex={currentClassIndex}
          classCount={classes.length}
          rows={currentClassRows}
          weeklyPeriods={currentClassPeriods}
          staffingPlan={staffingPlan}
          confirmedClasses={confirmedClasses}
          onSelectClass={setCurrentClassIndex}
          allClasses={classes.map((item) => item.code)}
          onBack={previousClassOrStep}
          onConfirm={confirmCurrentClass}
        />
      ) : null}

      {step === 2 ? (
        <SpecialRulesReviewStep
          rows={specialRows}
          staffingPlan={staffingPlan}
          onBack={() => {
            setCurrentClassIndex(Math.max(0, classes.length - 1));
            setStep(1);
          }}
          onConfirm={() => setStep(3)}
        />
      ) : null}

      {step === 3 ? (
        <FinalReviewStep
          pending={pending}
          existingPlan={existingPlan}
          teacherCount={teachers.length}
          specialCount={specialRows.length}
          confirmed={finalConfirmed}
          onConfirmedChange={setFinalConfirmed}
          onBack={() => setStep(2)}
          onAccept={acceptImport}
        />
      ) : null}
    </div>
  );
}

function TeacherReviewStep({
  items,
  onBack,
  onConfirm,
}: {
  items: TeacherReviewItem[];
  onBack: () => void;
  onConfirm: () => void;
}) {
  return (
    <section
      className="rounded-2xl border border-border bg-surface p-6"
      data-testid="review-teachers-step"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
            Krok 1 ze 4
          </p>
          <h2 className="mt-1 text-2xl font-semibold text-text-primary">
            Souhlasí učitelé a jejich přidělené hodiny?
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-text-secondary">
            Zobrazeni jsou pouze učitelé, které importovaný plán skutečně
            používá. Přidělené hodiny zahrnují i dělené skupiny.
          </p>
        </div>
        <StatusBadge tone="neutral">{items.length} učitelů</StatusBadge>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => {
          const exact = item.assignedPeriods === item.teacher.targetWeeklyLoad;
          return (
            <article
              key={item.teacher.id}
              className={
                exact
                  ? "rounded-xl border border-success-border bg-success-subtle p-5"
                  : "rounded-xl border border-warning-border bg-warning-subtle p-5"
              }
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-text-primary">
                    {teacherLabel(item.teacher)}
                  </h3>
                  <p className="mt-1 text-xs text-text-muted">
                    {item.subjects.map(subjectLabel).join(", ")}
                  </p>
                </div>
                {exact ? (
                  <CheckCircle2
                    className="size-5 shrink-0 text-success"
                    aria-hidden="true"
                  />
                ) : (
                  <AlertTriangle
                    className="size-5 shrink-0 text-warning"
                    aria-hidden="true"
                  />
                )}
              </div>
              <p className="mt-4 text-2xl font-bold text-text-primary">
                {item.assignedPeriods} / {item.teacher.targetWeeklyLoad} h
              </p>
              <p className="mt-1 text-xs text-text-muted">
                přiděleno v Excelu / úvazek z Kroku 1
              </p>
              <p className="mt-4 text-sm leading-6 text-text-secondary">
                Třídy: {item.classes.join(", ")}
              </p>
            </article>
          );
        })}
      </div>

      <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button type="button" variant="outline" onClick={onBack}>
          <ArrowLeft className="size-4" aria-hidden="true" />
          Nesedí — vrátit se k Excelu
        </Button>
        <Button type="button" onClick={onConfirm}>
          Učitelé souhlasí
          <ArrowRight className="size-4" aria-hidden="true" />
        </Button>
      </div>
    </section>
  );
}

function ClassReviewStep({
  classCode,
  classProfile,
  classIndex,
  classCount,
  rows,
  weeklyPeriods,
  staffingPlan,
  confirmedClasses,
  allClasses,
  onSelectClass,
  onBack,
  onConfirm,
}: {
  classCode: string;
  classProfile: TeachingClassProfile;
  classIndex: number;
  classCount: number;
  rows: TeachingPlanRow[];
  weeklyPeriods: number;
  staffingPlan: StaffingPlan;
  confirmedClasses: string[];
  allClasses: string[];
  onSelectClass: (index: number) => void;
  onBack: () => void;
  onConfirm: () => void;
}) {
  return (
    <section
      className="rounded-2xl border border-border bg-surface p-6"
      data-testid="review-classes-step"
    >
      <div className="grid gap-6 xl:grid-cols-[220px_minmax(0,1fr)]">
        <aside>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
            Krok 2 ze 4
          </p>
          <h2 className="mt-1 text-lg font-semibold text-text-primary">
            Projít každou třídu
          </h2>
          <p className="mt-2 text-sm leading-6 text-text-secondary">
            Zelená značka znamená, že jste údaje dané třídy už vědomě potvrdili.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2 xl:grid-cols-1">
            {allClasses.map((code, index) => {
              const active = code === classCode;
              const confirmed = confirmedClasses.includes(code);
              return (
                <button
                  key={code}
                  type="button"
                  onClick={() => onSelectClass(index)}
                  className={
                    active
                      ? "flex items-center justify-between rounded-lg bg-primary px-3 py-2.5 text-left text-sm font-semibold text-primary-foreground"
                      : confirmed
                        ? "flex items-center justify-between rounded-lg border border-success-border bg-success-subtle px-3 py-2.5 text-left text-sm font-semibold text-success-strong"
                        : "flex items-center justify-between rounded-lg border border-border bg-surface-subtle px-3 py-2.5 text-left text-sm font-semibold text-text-secondary hover:border-primary/40"
                  }
                >
                  {code}
                  {confirmed ? (
                    <CheckCircle2 className="size-4" aria-hidden="true" />
                  ) : null}
                </button>
              );
            })}
          </div>
        </aside>

        <div>
          <div className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-medium text-text-muted">
                Třída {classIndex + 1} z {classCount}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-3">
                <h2 className="text-3xl font-semibold text-text-primary">
                  {classCode}
                </h2>
                <StatusBadge
                  tone={classProfile === "SPORTS" ? "success" : "neutral"}
                >
                  {classProfileLabel(classProfile)}
                </StatusBadge>
              </div>
              <p className="mt-2 text-sm text-text-secondary">
                Zkontrolujte počet hodin každého předmětu i celkovou týdenní
                dotaci.
              </p>
            </div>
            <div className="rounded-xl border border-primary/30 bg-primary-subtle px-5 py-4 text-right">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                Celkem za týden
              </p>
              <p className="mt-1 text-3xl font-bold text-text-primary">
                {weeklyPeriods} hodin
              </p>
              <p className="mt-1 text-xs text-text-muted">
                {rows.length} předmětů
              </p>
            </div>
          </div>

          <div className="mt-5 overflow-hidden rounded-xl border border-border">
            <div className="hidden grid-cols-[minmax(180px,1.3fr)_110px_minmax(170px,1fr)_minmax(170px,1.2fr)] gap-3 bg-surface-subtle px-4 py-3 text-xs font-semibold uppercase tracking-wide text-text-muted md:grid">
              <span>Předmět</span>
              <span>Dotace</span>
              <span>Rozložení</span>
              <span>Organizace a učitelé</span>
            </div>
            {rows.map((row) => (
              <article
                key={row.id}
                className="grid gap-3 border-t border-border px-4 py-4 first:border-t-0 md:grid-cols-[minmax(180px,1.3fr)_110px_minmax(170px,1fr)_minmax(170px,1.2fr)] md:items-center"
              >
                <div>
                  <p className="font-semibold text-text-primary">
                    {subjectLabel(row.subjectCode)}
                  </p>
                  <p className="mt-0.5 text-xs text-text-muted">
                    {row.organization === "ROTATION"
                      ? rotationSummary(row)
                      : row.subjectCode}
                  </p>
                </div>
                <p className="text-lg font-bold text-text-primary">
                  {rowClassPeriods(row)} h
                </p>
                <p className="text-sm text-text-secondary">
                  {humanBlockSummary(row)}
                </p>
                <div>
                  <StatusBadge
                    tone={row.organization === "SPLIT" ? "warning" : "neutral"}
                  >
                    {row.organization === "SPLIT"
                      ? "Dvě skupiny současně"
                      : "Celá třída"}
                  </StatusBadge>
                  <p className="mt-2 text-sm leading-5 text-text-secondary">
                    {rowTeachers(row, staffingPlan)}
                  </p>
                </div>
              </article>
            ))}
          </div>

          <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Button type="button" variant="outline" onClick={onBack}>
              <ArrowLeft className="size-4" aria-hidden="true" />
              Zpět
            </Button>
            <div className="text-center sm:text-right">
              <Button type="button" onClick={onConfirm}>
                {classCode} souhlasí
                <ArrowRight className="size-4" aria-hidden="true" />
              </Button>
              <p className="mt-2 text-xs text-text-muted">
                Potvrzením se zatím nic neukládá.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function SpecialRulesReviewStep({
  rows,
  staffingPlan,
  onBack,
  onConfirm,
}: {
  rows: TeachingPlanRow[];
  staffingPlan: StaffingPlan;
  onBack: () => void;
  onConfirm: () => void;
}) {
  return (
    <section
      className="rounded-2xl border border-border bg-surface p-6"
      data-testid="review-special-rules-step"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-primary">
        Krok 3 ze 4
      </p>
      <div className="mt-1 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-text-primary">
            Souhlasí dělení tříd, dvojhodiny a výměny?
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-text-secondary">
            Zde jsou vytažena pouze nastavení, která zásadně ovlivňují podobu
            rozvrhu. Běžné samostatné hodiny celé třídy se neopakují.
          </p>
        </div>
        <StatusBadge tone={rows.length > 0 ? "warning" : "success"}>
          {rows.length} zvláštních nastavení
        </StatusBadge>
      </div>

      {rows.length === 0 ? (
        <div className="mt-6 flex items-center gap-3 rounded-xl border border-success-border bg-success-subtle p-5 text-success-strong">
          <CheckCircle2 className="size-6" aria-hidden="true" />
          <p className="font-semibold">
            Excel neobsahuje žádné dělené předměty, dvojhodiny ani výměny.
          </p>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {rows.map((row) => (
            <article
              key={row.id}
              className="rounded-xl border border-warning-border bg-warning-subtle p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-warning-strong">
                    {row.classCode}
                  </p>
                  <h3 className="mt-1 text-lg font-semibold text-text-primary">
                    {subjectLabel(row.subjectCode)}
                  </h3>
                </div>
                <StatusBadge
                  tone={row.organization === "SPLIT" ? "warning" : "neutral"}
                >
                  {row.organization === "SPLIT" ? "Dvě skupiny" : "Celá třída"}
                </StatusBadge>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg bg-surface/70 p-3">
                  <p className="text-xs text-text-muted">Týdenní dotace</p>
                  <p className="mt-1 font-semibold text-text-primary">
                    {row.weeklyPeriods} h · {humanBlockSummary(row)}
                  </p>
                </div>
                <div className="rounded-lg bg-surface/70 p-3">
                  <p className="text-xs text-text-muted">Učitelé</p>
                  <p className="mt-1 text-sm font-semibold leading-5 text-text-primary">
                    {rowTeachers(row, staffingPlan)}
                  </p>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button type="button" variant="outline" onClick={onBack}>
          <ArrowLeft className="size-4" aria-hidden="true" />
          Zpět na třídy
        </Button>
        <Button type="button" onClick={onConfirm}>
          Dělení a dvojhodiny souhlasí
          <ArrowRight className="size-4" aria-hidden="true" />
        </Button>
      </div>
    </section>
  );
}

function FinalReviewStep({
  pending,
  existingPlan,
  teacherCount,
  specialCount,
  confirmed,
  onConfirmedChange,
  onBack,
  onAccept,
}: {
  pending: PendingTeachingPlanImport;
  existingPlan: TeachingPlan | null;
  teacherCount: number;
  specialCount: number;
  confirmed: boolean;
  onConfirmedChange: (value: boolean) => void;
  onBack: () => void;
  onAccept: () => void;
}) {
  return (
    <section
      className="rounded-2xl border border-border bg-surface p-6"
      data-testid="review-final-step"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-primary">
        Krok 4 ze 4
      </p>
      <h2 className="mt-1 text-2xl font-semibold text-text-primary">
        Finální souhrn před převzetím Excelu
      </h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-text-secondary">
        Toto je první a jediné místo, kde můžete importovaný návrh skutečně
        zapsat do editoru výuky tříd.
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ["Soubor", pending.fileName],
          ["Třídy", String(pending.summary.classes)],
          ["Předměty", String(pending.summary.subjects)],
          ["Použití učitelé", String(teacherCount)],
          ["Dělení / bloky", String(specialCount)],
        ].map(([label, value]) => (
          <article
            key={label}
            className="rounded-xl border border-border bg-surface-subtle p-4"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
              {label}
            </p>
            <p className="mt-2 break-words text-lg font-semibold text-text-primary">
              {value}
            </p>
          </article>
        ))}
      </div>

      {existingPlan && existingPlan.rows.length > 0 ? (
        <div className="mt-5 flex items-start gap-3 rounded-xl border border-warning-border bg-warning-subtle p-5">
          <AlertTriangle
            className="mt-0.5 size-5 shrink-0 text-warning"
            aria-hidden="true"
          />
          <div>
            <p className="font-semibold text-text-primary">
              Aktuální rozpracovaný plán bude nahrazen
            </p>
            <p className="mt-1 text-sm leading-6 text-text-secondary">
              Nynější editor obsahuje {existingPlan.classes.length} tříd a{" "}
              {existingPlan.rows.length} předmětů. Projektová data solveru se
              tímto krokem ještě nemění; ta se ukládají až samostatným tlačítkem
              v editoru.
            </p>
          </div>
        </div>
      ) : (
        <div className="mt-5 flex items-center gap-3 rounded-xl border border-success-border bg-success-subtle p-5 text-success-strong">
          <CheckCircle2 className="size-5" aria-hidden="true" />
          <p className="font-semibold">
            Editor je prázdný, takže se žádná rozpracovaná výuka nepřepíše.
          </p>
        </div>
      )}

      <label className="mt-6 flex cursor-pointer items-start gap-3 rounded-xl border-2 border-primary/30 bg-primary-subtle p-5">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(event) => onConfirmedChange(event.target.checked)}
          className="mt-1 size-5 rounded border-border-strong accent-primary"
          aria-label="Potvrzuji správnost importovaných údajů"
        />
        <span>
          <span className="block font-semibold text-text-primary">
            Potvrzuji, že jsem prošel učitele, každou třídu, hodinové dotace,
            dělení i dvojhodiny.
          </span>
          <span className="mt-1 block text-sm leading-6 text-text-secondary">
            Po stisknutí finálního tlačítka se tento návrh převezme do editoru,
            kde ho lze ještě ručně upravit před uložením do projektu.
          </span>
        </span>
      </label>

      <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button type="button" variant="outline" onClick={onBack}>
          <ArrowLeft className="size-4" aria-hidden="true" />
          Zpět na zvláštní nastavení
        </Button>
        <Button type="button" disabled={!confirmed} onClick={onAccept}>
          <CheckCircle2 className="size-4" aria-hidden="true" />
          Potvrdit a převzít Excel
        </Button>
      </div>
    </section>
  );
}
