"use client";

import { ArrowRight, RotateCcw, Sparkles } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  getLocalProject,
  replaceLocalProjectAtomically,
  subscribeLocalProject,
} from "@/lib/local/api";
import {
  PHYSICAL_EDUCATION_BASE_CAPACITY_BY_DAY,
  applyPhysicalEducationExternalOccupancy,
  loadPhysicalEducationExternalOccupancy,
  occupiedPhysicalEducationSpacesAt,
  savePhysicalEducationExternalOccupancy,
  schoolDefaultPhysicalEducationExternalOccupancySlots,
  schoolRecommendedPhysicalEducationExternalOccupancySlots,
  subscribePhysicalEducationExternalOccupancy,
  type PhysicalEducationExternalOccupancySlot,
} from "@/lib/local/physical-education-external-occupancy";

const dayNames = ["Pondělí", "Úterý", "Středa", "Čtvrtek", "Pátek"];

function slotSignature(
  slots: PhysicalEducationExternalOccupancySlot[],
): string {
  return [...slots]
    .sort(
      (left, right) =>
        left.dayOfWeek - right.dayOfWeek || left.period - right.period,
    )
    .map((slot) => `${slot.dayOfWeek}:${slot.period}:${slot.occupiedSpaces}`)
    .join("|");
}

export default function PeCapacityPage() {
  const searchParams = useSearchParams();
  const schoolYearId = searchParams.get("schoolYearId") ?? "local-school-year";
  const [periodsPerDay, setPeriodsPerDay] = useState<number[]>([8, 8, 8, 8, 7]);
  const [slots, setSlots] = useState<PhysicalEducationExternalOccupancySlot[]>(
    [],
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = () => {
      void getLocalProject()
        .then((project) => {
          setPeriodsPerDay(project.periodsPerDay);
          setSlots(loadPhysicalEducationExternalOccupancy().slots);
          setError(null);
        })
        .catch((cause) =>
          setError(
            cause instanceof Error
              ? cause.message
              : "Obsazenost TV prostorů se nepodařilo načíst.",
          ),
        );
    };
    load();
    const unsubProject = subscribeLocalProject(load);
    const unsubOccupancy = subscribePhysicalEducationExternalOccupancy(load);
    return () => {
      unsubProject();
      unsubOccupancy();
    };
  }, []);

  const reservedSlotCount = useMemo(
    () => slots.filter((slot) => slot.occupiedSpaces > 0).length,
    [slots],
  );
  const recommended = useMemo(
    () => schoolRecommendedPhysicalEducationExternalOccupancySlots(),
    [],
  );
  const original = useMemo(
    () => schoolDefaultPhysicalEducationExternalOccupancySlots(),
    [],
  );
  const activeProfile = useMemo(() => {
    const current = slotSignature(slots);
    if (current === slotSignature(recommended)) return "RECOMMENDED";
    if (current === slotSignature(original)) return "ORIGINAL";
    return "CUSTOM";
  }, [original, recommended, slots]);

  async function persistSlots(next: PhysicalEducationExternalOccupancySlot[]) {
    setBusy(true);
    setError(null);
    try {
      const saved = savePhysicalEducationExternalOccupancy(next);
      setSlots(saved.slots);

      const project = await getLocalProject();
      if (project.rooms.some((room) => room.roomTypeId === "room-type:TV")) {
        const updated = applyPhysicalEducationExternalOccupancy(
          project,
          saved.slots,
        );
        updated.version = project.version + 1;
        await replaceLocalProjectAtomically(updated);
      }
      setMessage(
        "Uloženo. Omezení se použije při dalším výpočtu; připravený projekt se aktualizoval okamžitě.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Obsazenost TV prostorů se nepodařilo uložit.",
      );
    } finally {
      setBusy(false);
    }
  }

  function updateSlot(
    dayOfWeek: number,
    period: number,
    occupiedSpaces: number,
  ) {
    const next = slots.filter(
      (slot) => !(slot.dayOfWeek === dayOfWeek && slot.period === period),
    );
    if (occupiedSpaces > 0) {
      next.push({ dayOfWeek, period, occupiedSpaces });
    }
    void persistSlots(next);
  }

  function useRecommendedProfile() {
    void persistSlots(
      schoolRecommendedPhysicalEducationExternalOccupancySlots(),
    );
  }

  function restoreOriginalSchoolPlan() {
    void persistSlots(schoolDefaultPhysicalEducationExternalOccupancySlots());
  }

  function clearAll() {
    void persistSlots([]);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Fáze 4 · TV kapacita"
        title="Obsazenost sportovních prostor 1. stupně"
        description="Nastavte, kolik TV prostorů v jednotlivých hodinách skutečně zabere 1. stupeň. Změny se uloží lokálně a generátor je použije automaticky."
        actions={
          <Button asChild>
            <Link
              href={`/generate?schoolYearId=${encodeURIComponent(schoolYearId)}`}
            >
              Pokračovat na tvorbu rozvrhu
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </Button>
        }
      />

      <section className="rounded-xl border border-success-border bg-success-subtle p-5">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="size-5 text-success" aria-hidden="true" />
              <h2 className="font-semibold text-text-primary">
                Doporučený profil 2026/2027
              </h2>
            </div>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-text-secondary">
              Pro aktuální školní model je původní rezervace 1. stupně příliš
              těsná. Ověřený profil ponechá stejné rezervované časy, ale v
              kritických 9 prostor-hodinách rezervuje 1 prostor místo 2. Všechny
              hodnoty můžete kdykoliv ručně změnit podle skutečného provozu.
            </p>
            <p className="mt-2 text-xs font-medium text-text-muted">
              Aktivní profil:{" "}
              {activeProfile === "RECOMMENDED"
                ? "doporučený 2026/2027"
                : activeProfile === "ORIGINAL"
                  ? "původní zadání 1. stupně"
                  : "vlastní nastavení"}
            </p>
          </div>
          <Button
            type="button"
            onClick={useRecommendedProfile}
            disabled={busy || activeProfile === "RECOMMENDED"}
          >
            <Sparkles className="size-4" aria-hidden="true" />
            Použít doporučený profil
          </Button>
        </div>
      </section>

      <section className="rounded-xl border border-primary/30 bg-primary-subtle p-5">
        <p className="text-sm leading-6 text-text-secondary">
          Příklad: ve čtvrtek je běžně dostupných 5 TV prostorů. Pokud u 3.
          hodiny nastavíte <strong>2 zabrané</strong>, solver v tomto slotu smí
          použít maximálně <strong>3 paralelní TV kapacity</strong>. Je to tvrdé
          omezení, ne preference.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={restoreOriginalSchoolPlan}
            disabled={busy || activeProfile === "ORIGINAL"}
          >
            <RotateCcw className="size-4" aria-hidden="true" />
            Obnovit původní zadání 1. stupně
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={clearAll}
            disabled={busy || slots.length === 0}
          >
            Vynulovat rezervace
          </Button>
          <span className="text-xs text-text-muted">
            Aktivní externí omezení: {reservedSlotCount} časových slotů.
          </span>
        </div>
      </section>

      {message ? (
        <div className="rounded-lg border border-success-border bg-success-subtle p-4 text-sm text-success-strong">
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-lg border border-danger-border bg-danger-subtle p-4 text-sm text-danger-strong">
          {error}
        </div>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-2">
        {dayNames.map((day, dayIndex) => {
          const baseCapacity =
            PHYSICAL_EDUCATION_BASE_CAPACITY_BY_DAY[dayIndex] ?? 0;
          return (
            <article
              key={day}
              className="rounded-xl border border-border bg-surface p-5"
            >
              <div className="flex items-center justify-between gap-4">
                <h2 className="font-semibold text-text-primary">{day}</h2>
                <span className="rounded-full border border-border bg-surface-subtle px-2.5 py-1 text-xs font-medium text-text-secondary">
                  Základní kapacita {baseCapacity}
                </span>
              </div>

              {baseCapacity === 0 ? (
                <p className="mt-4 text-sm leading-6 text-text-muted">
                  TV je v pondělí už globálně zakázaná, takže zde není co dál
                  rezervovat.
                </p>
              ) : (
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {Array.from(
                    { length: periodsPerDay[dayIndex] ?? 0 },
                    (_unused, period) => {
                      const occupied = occupiedPhysicalEducationSpacesAt(
                        slots,
                        dayIndex,
                        period,
                      );
                      return (
                        <label
                          key={`${dayIndex}-${period}`}
                          className="rounded-lg border border-border bg-surface-subtle p-3 text-xs font-medium text-text-muted"
                        >
                          {period + 1}. hodina
                          <select
                            value={occupied}
                            disabled={busy}
                            onChange={(event) =>
                              updateSlot(
                                dayIndex,
                                period,
                                Number(event.target.value),
                              )
                            }
                            className="mt-2 h-10 w-full rounded-md border border-border-strong bg-surface px-2 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
                          >
                            {Array.from(
                              { length: baseCapacity + 1 },
                              (_option, value) => (
                                <option key={value} value={value}>
                                  {value} zabraných · {baseCapacity - value}{" "}
                                  volných
                                </option>
                              ),
                            )}
                          </select>
                        </label>
                      );
                    },
                  )}
                </div>
              )}
            </article>
          );
        })}
      </section>

      <section className="flex flex-col justify-between gap-4 rounded-xl border border-border bg-surface p-5 sm:flex-row sm:items-center">
        <div>
          <h2 className="font-semibold text-text-primary">
            Kapacita je uložená
          </h2>
          <p className="mt-1 text-sm text-text-secondary">
            Další změny učitelů nebo výukového plánu nevadí. Po změně vstupů
            připravte data znovu a generátor vždy načte toto aktuální nastavení
            TV.
          </p>
        </div>
        <Button asChild>
          <Link
            href={`/generate?schoolYearId=${encodeURIComponent(schoolYearId)}`}
          >
            Vytvořit rozvrh
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </Button>
      </section>
    </div>
  );
}
