"use client";

import {
  CheckCircle2,
  Lock,
  LockOpen,
  Move,
  RefreshCw,
  RotateCcw,
  Sparkles,
  X,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { PageHeader } from "@/components/page-header";
import { localApiFetch } from "@/lib/local/api";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { teachingGroupLabels } from "@/lib/ui-labels";

const dayNames = [
  "Pondělí",
  "Úterý",
  "Středa",
  "Čtvrtek",
  "Pátek",
  "Sobota",
  "Neděle",
];
const categoryLabels: Record<string, string> = {
  class_compactness: "Kompaktnost tříd",
  teacher_compactness: "Kompaktnost učitelů",
  distribution: "Rozložení předmětů",
  teacher_preferences: "Preference učitelů",
  day_edges: "Začátky a konce",
  stability_and_rooms: "Stabilita a učebny",
};

interface EntityView {
  id: string;
  code: string;
  name: string;
}

interface RoomView {
  id: string;
  code: string;
  name: string;
}

interface LessonView {
  id: string;
  block_id: string;
  assignment_id: string;
  day: number;
  period: number;
  duration: number;
  room_id: string | null;
  group: "WHOLE" | "GROUP_1" | "GROUP_2";
  locked: boolean;
  manually_changed?: boolean;
  origin: string;
  teacher?: EntityView;
  schoolClass?: EntityView;
  subject?: EntityView & { colorToken?: string | null };
  room?: RoomView | null;
}

interface TimetablePayload {
  version: {
    id: string;
    name: string;
    revision: number;
    isCurrent: boolean;
    qualityScore: number | null;
    scoreBreakdown: Record<string, number> | null;
    incidentReport: Array<{
      code: string;
      category: string;
      points: number;
      message: string;
      suggestion?: string;
    }> | null;
  };
  periodsPerDay: number[];
  entities: EntityView[];
  rooms: RoomView[];
  lessons: LessonView[];
}

export default function TimetablePage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const schoolYearId = searchParams.get("schoolYearId");
  const queryVersionId = searchParams.get("versionId");
  const [versionId, setVersionId] = useState<string | null>(queryVersionId);
  const [view, setView] = useState<"class" | "teacher">("class");
  const [entityId, setEntityId] = useState<string | null>(null);
  const [payload, setPayload] = useState<TimetablePayload | null>(null);
  const [selectedLesson, setSelectedLesson] = useState<LessonView | null>(null);
  const [moveIssues, setMoveIssues] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (versionId || !schoolYearId) return;
    const currentSchoolYearId = schoolYearId;
    let cancelled = false;
    async function resolveLatest() {
      const response = await localApiFetch(
        `/api/school-years/${currentSchoolYearId}/generation-runs`,
        {
          cache: "no-store",
        },
      );
      if (!response.ok) return;
      const data = (await response.json()) as {
        items: Array<{ candidateVersion: { id: string } | null }>;
      };
      const latest = data.items.find((item) => item.candidateVersion)
        ?.candidateVersion?.id;
      if (latest && !cancelled) {
        setVersionId(latest);
        router.replace(
          `/timetable?schoolYearId=${encodeURIComponent(currentSchoolYearId)}&versionId=${encodeURIComponent(latest)}`,
        );
      }
    }
    void resolveLatest();
    return () => {
      cancelled = true;
    };
  }, [router, schoolYearId, versionId]);

  const load = useCallback(async () => {
    if (!versionId) return;
    setError(null);
    const params = new URLSearchParams({ view });
    if (entityId) params.set("entityId", entityId);
    const response = await localApiFetch(
      `/api/timetable-versions/${versionId}?${params}`,
      {
        cache: "no-store",
      },
    );
    const data = (await response.json()) as TimetablePayload & {
      error?: { message?: string };
    };
    if (!response.ok) {
      setError(data.error?.message ?? "Rozvrh se nepodařilo načíst.");
      return;
    }
    setPayload(data);
    if (!entityId && data.entities[0]) setEntityId(data.entities[0].id);
  }, [entityId, versionId, view]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setEntityId(null);
    setPayload(null);
  }, [view]);

  const maximumPeriods = useMemo(
    () => Math.max(...(payload?.periodsPerDay ?? [0])),
    [payload?.periodsPerDay],
  );

  async function setLock(lesson: LessonView, locked: boolean) {
    if (!payload || !versionId) return;
    setBusy(true);
    setError(null);
    const response = await localApiFetch(
      `/api/timetable-versions/${versionId}/locks`,
      {
        method: locked ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lessonIds: [lesson.id],
          expectedRevision: payload.version.revision,
        }),
      },
    );
    const data = (await response.json()) as { error?: { message?: string } };
    if (!response.ok) setError(data.error?.message ?? "Změna zámku selhala.");
    await load();
    setBusy(false);
  }

  async function submitMove(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!payload || !versionId || !selectedLesson) return;
    const form = new FormData(event.currentTarget);
    const move = {
      lessonId: selectedLesson.id,
      targetDay: Number(form.get("day")),
      targetPeriod: Number(form.get("period")),
      targetRoomId: String(form.get("roomId") ?? "") || null,
      expectedRevision: payload.version.revision,
    };
    setBusy(true);
    setMoveIssues([]);
    setError(null);

    const previewResponse = await localApiFetch(
      `/api/timetable-versions/${versionId}/moves/validate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(move),
      },
    );
    const preview = (await previewResponse.json()) as {
      valid?: boolean;
      issues?: Array<{ message: string }>;
      error?: {
        message?: string;
        details?: { issues?: Array<{ message: string }> };
      };
    };
    const issues = preview.issues ?? preview.error?.details?.issues ?? [];
    if (!previewResponse.ok || !preview.valid) {
      setMoveIssues(issues.map((item) => item.message));
      if (!issues.length)
        setError(preview.error?.message ?? "Přesun není platný.");
      setBusy(false);
      return;
    }

    const applyResponse = await localApiFetch(
      `/api/timetable-versions/${versionId}/moves`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(move),
      },
    );
    const applied = (await applyResponse.json()) as {
      error?: { message?: string };
    };
    if (!applyResponse.ok) {
      setError(applied.error?.message ?? "Přesun se nepodařilo uložit.");
    } else {
      setSelectedLesson(null);
      await load();
    }
    setBusy(false);
  }

  async function undo() {
    if (!payload || !versionId) return;
    setBusy(true);
    const response = await localApiFetch(
      `/api/timetable-versions/${versionId}/undo`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedRevision: payload.version.revision }),
      },
    );
    const data = (await response.json()) as { error?: { message?: string } };
    if (!response.ok)
      setError(data.error?.message ?? "Poslední změnu nelze vrátit.");
    await load();
    setBusy(false);
  }

  async function accept() {
    if (!payload || !versionId) return;
    setBusy(true);
    const response = await localApiFetch(
      `/api/timetable-versions/${versionId}/accept`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedRevision: payload.version.revision }),
      },
    );
    const data = (await response.json()) as { error?: { message?: string } };
    if (!response.ok) setError(data.error?.message ?? "Verzi nelze přijmout.");
    await load();
    setBusy(false);
  }

  if (!versionId) {
    return (
      <div className="rounded-xl border border-border bg-surface p-8 text-center">
        <Sparkles className="mx-auto size-10 text-primary" aria-hidden="true" />
        <h1 className="mt-4 text-lg font-semibold">
          Zatím není dostupný návrh rozvrhu
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          Nejprve dokončete vytvoření návrhu.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Fáze 7"
        title={payload?.version.name ?? "Úprava rozvrhu"}
        description="Přesun ověřuje stejná lokální kontrola pevných pravidel jako automatická tvorba rozvrhu. Zamčené bloky nelze přesunout."
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => void undo()}
              disabled={busy || !payload}
            >
              <RotateCcw className="size-4" aria-hidden="true" />
              Vrátit změnu
            </Button>
            <Button
              variant="outline"
              onClick={() => void load()}
              disabled={busy}
            >
              <RefreshCw className="size-4" aria-hidden="true" />
              Obnovit
            </Button>
            <Button
              onClick={() => void accept()}
              disabled={busy || !payload || payload.version.isCurrent}
            >
              <CheckCircle2 className="size-4" aria-hidden="true" />
              {payload?.version.isCurrent ? "Aktuální verze" : "Přijmout verzi"}
            </Button>
          </>
        }
      />

      {error ? (
        <div className="rounded-lg border border-danger-border bg-danger-subtle p-4 text-sm text-danger-strong">
          {error}
        </div>
      ) : null}

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface p-4">
            <div>
              <p className="text-xs font-medium text-text-muted">Pohled</p>
              <div className="mt-1 flex rounded-md border border-border p-1">
                <button
                  type="button"
                  onClick={() => setView("class")}
                  className={
                    view === "class"
                      ? "rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground"
                      : "rounded px-3 py-1.5 text-sm text-text-secondary"
                  }
                >
                  Třídy
                </button>
                <button
                  type="button"
                  onClick={() => setView("teacher")}
                  className={
                    view === "teacher"
                      ? "rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground"
                      : "rounded px-3 py-1.5 text-sm text-text-secondary"
                  }
                >
                  Učitelé
                </button>
              </div>
            </div>
            <label className="min-w-64 flex-1 text-xs font-medium text-text-muted">
              {view === "class" ? "Třída" : "Učitel"}
              <select
                value={entityId ?? ""}
                onChange={(event) => setEntityId(event.target.value || null)}
                className="mt-1 h-10 w-full rounded-md border border-border-strong bg-surface px-3 text-sm text-text-primary"
              >
                <option value="">Vyberte</option>
                {payload?.entities.map((entity) => (
                  <option key={entity.id} value={entity.id}>
                    {entity.code} · {entity.name}
                  </option>
                ))}
              </select>
            </label>
            {payload ? (
              <StatusBadge tone="neutral">
                Verze úprav {payload.version.revision}
              </StatusBadge>
            ) : null}
          </div>

          <div className="overflow-x-auto rounded-xl border border-border bg-surface">
            <div className="min-w-[980px]">
              <div className="grid grid-cols-[64px_repeat(5,minmax(170px,1fr))] border-b border-border bg-surface-subtle">
                <div className="p-3 text-xs font-medium text-text-muted">
                  Hodina
                </div>
                {dayNames.slice(0, 5).map((day) => (
                  <div
                    key={day}
                    className="border-l border-border p-3 text-sm font-semibold text-text-primary"
                  >
                    {day}
                  </div>
                ))}
              </div>
              {Array.from({ length: maximumPeriods }, (_, period) => (
                <div
                  key={period}
                  className="grid min-h-24 grid-cols-[64px_repeat(5,minmax(170px,1fr))] border-b border-border last:border-b-0"
                >
                  <div className="p-3 text-center text-sm font-semibold text-text-muted">
                    {period + 1}.
                  </div>
                  {dayNames.slice(0, 5).map((_day, day) => {
                    const cellLessons = payload?.lessons.filter(
                      (lesson) =>
                        lesson.day === day && lesson.period === period,
                    );
                    const disabled =
                      period >= (payload?.periodsPerDay[day] ?? 0);
                    return (
                      <div
                        key={`${day}-${period}`}
                        className={
                          disabled
                            ? "border-l border-border bg-surface-subtle p-2"
                            : "space-y-2 border-l border-border p-2"
                        }
                      >
                        {cellLessons?.map((lesson) => (
                          <button
                            key={lesson.id}
                            type="button"
                            onClick={() => {
                              setMoveIssues([]);
                              setSelectedLesson(lesson);
                            }}
                            className="w-full rounded-md border border-primary/30 bg-primary-subtle p-2.5 text-left transition hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <strong className="text-sm text-text-primary">
                                {lesson.subject?.code}
                              </strong>
                              <span className="flex items-center gap-1 text-text-muted">
                                {lesson.locked ? (
                                  <Lock
                                    className="size-3.5"
                                    aria-label="Zamčeno"
                                  />
                                ) : null}
                                {lesson.manually_changed ? (
                                  <Move
                                    className="size-3.5"
                                    aria-label="Ručně změněno"
                                  />
                                ) : null}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-text-secondary">
                              {view === "class"
                                ? lesson.teacher?.code
                                : lesson.schoolClass?.code}
                              {lesson.group !== "WHOLE"
                                ? ` · ${teachingGroupLabels[lesson.group] ?? lesson.group}`
                                : ""}
                            </p>
                            <p className="mt-1 text-xs text-text-muted">
                              {lesson.room?.code ?? "bez učebny"}
                              {lesson.duration === 2 ? " · dvojhodina" : ""}
                            </p>
                          </button>
                        ))}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>

        <aside className="space-y-4">
          <article className="rounded-xl border border-border bg-surface p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold text-text-primary">
                Kvalita návrhu
              </h2>
              <StatusBadge
                tone={
                  payload?.version.qualityScore != null ? "success" : "neutral"
                }
              >
                {payload?.version.qualityScore ?? "–"}/100
              </StatusBadge>
            </div>
            <div className="mt-4 space-y-3">
              {Object.entries(payload?.version.scoreBreakdown ?? {}).map(
                ([category, value]) => (
                  <div key={category}>
                    <div className="flex justify-between gap-3 text-xs">
                      <span className="text-text-secondary">
                        {categoryLabels[category] ?? category}
                      </span>
                      <strong>{value}</strong>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded bg-surface-subtle">
                      <div
                        className="h-full bg-primary"
                        style={{ width: `${Math.min(100, value * 4)}%` }}
                      />
                    </div>
                  </div>
                ),
              )}
            </div>
          </article>

          <article className="rounded-xl border border-border bg-surface p-5">
            <h2 className="font-semibold text-text-primary">
              Největší rezervy
            </h2>
            <div className="mt-3 space-y-3">
              {(payload?.version.incidentReport ?? [])
                .slice(0, 5)
                .map((incident) => (
                  <div
                    key={`${incident.code}-${incident.message}`}
                    className="rounded-lg bg-surface-subtle p-3"
                  >
                    <p className="text-sm font-medium text-text-primary">
                      −{incident.points} · {incident.message}
                    </p>
                    {incident.suggestion ? (
                      <p className="mt-1 text-xs text-text-muted">
                        {incident.suggestion}
                      </p>
                    ) : null}
                  </div>
                ))}
              {!payload?.version.incidentReport?.length ? (
                <p className="text-sm text-text-muted">
                  Žádné evidované srážky bodů.
                </p>
              ) : null}
            </div>
          </article>
        </aside>
      </section>

      {selectedLesson ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="move-title"
            className="w-full max-w-lg rounded-xl border border-border bg-surface p-6 shadow-xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2
                  id="move-title"
                  className="text-lg font-semibold text-text-primary"
                >
                  Detail výukového bloku
                </h2>
                <p className="mt-1 text-sm text-text-secondary">
                  {selectedLesson.subject?.name} ·{" "}
                  {selectedLesson.schoolClass?.code} ·{" "}
                  {selectedLesson.teacher?.code}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedLesson(null)}
                className="rounded p-1 text-text-muted hover:bg-surface-subtle"
                aria-label="Zavřít"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="mt-4 flex items-center gap-2">
              <StatusBadge tone={selectedLesson.locked ? "warning" : "neutral"}>
                {selectedLesson.locked ? "Zamčeno" : "Odemčeno"}
              </StatusBadge>
              {selectedLesson.manually_changed ? (
                <StatusBadge tone="info">Ručně změněno</StatusBadge>
              ) : null}
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  void setLock(selectedLesson, !selectedLesson.locked)
                }
                disabled={busy || selectedLesson.origin === "FIXED_RULE"}
              >
                {selectedLesson.locked ? (
                  <LockOpen className="size-3.5" />
                ) : (
                  <Lock className="size-3.5" />
                )}
                {selectedLesson.locked ? "Odemknout" : "Zamknout"}
              </Button>
            </div>

            <form
              onSubmit={submitMove}
              className="mt-5 grid gap-4 sm:grid-cols-2"
            >
              <label className="text-sm font-medium text-text-primary">
                Den
                <select
                  name="day"
                  defaultValue={selectedLesson.day}
                  className="mt-1.5 h-10 w-full rounded-md border border-border-strong bg-surface px-3"
                >
                  {dayNames.slice(0, 5).map((day, index) => (
                    <option key={day} value={index}>
                      {day}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-medium text-text-primary">
                Hodina
                <select
                  name="period"
                  defaultValue={selectedLesson.period}
                  className="mt-1.5 h-10 w-full rounded-md border border-border-strong bg-surface px-3"
                >
                  {Array.from({ length: maximumPeriods }, (_, index) => (
                    <option key={index} value={index}>
                      {index + 1}.
                    </option>
                  ))}
                </select>
              </label>
              <label className="sm:col-span-2 text-sm font-medium text-text-primary">
                Učebna
                <select
                  name="roomId"
                  defaultValue={selectedLesson.room_id ?? ""}
                  className="mt-1.5 h-10 w-full rounded-md border border-border-strong bg-surface px-3"
                >
                  <option value="">Bez učebny</option>
                  {payload?.rooms.map((room) => (
                    <option key={room.id} value={room.id}>
                      {room.code} · {room.name}
                    </option>
                  ))}
                </select>
              </label>

              {moveIssues.length ? (
                <div className="sm:col-span-2 rounded-lg border border-danger-border bg-danger-subtle p-3 text-sm text-danger-strong">
                  {moveIssues.map((issue) => (
                    <p key={issue}>{issue}</p>
                  ))}
                </div>
              ) : null}

              <div className="sm:col-span-2 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setSelectedLesson(null)}
                >
                  Zrušit
                </Button>
                <Button type="submit" disabled={busy || selectedLesson.locked}>
                  <Move className="size-4" aria-hidden="true" />
                  {busy ? "Ověřuji…" : "Ověřit a přesunout"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
