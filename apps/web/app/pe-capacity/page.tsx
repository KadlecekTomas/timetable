"use client";

import { RotateCcw } from "lucide-react";
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
  subscribePhysicalEducationExternalOccupancy,
  type PhysicalEducationExternalOccupancySlot,
} from "@/lib/local/physical-education-external-occupancy";

const dayNames = ["Pondělí", "Úterý", "Středa", "Čtvrtek", "Pátek"];

export default function PeCapacityPage() {
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
        "Uloženo. Pokud jsou data pro generátor už připravená, omezení je aktivní okamžitě; při další přípravě se použije znovu.",
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

  function restoreSchoolDefaults() {
    void persistSlots(schoolDefaultPhysicalEducationExternalOccupancySlots());
  }

  function clearAll() {
    void persistSlots([]);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="TV · kapacita"
        title="Obsazenost sportovních prostor 1. stupně"
        description="Zadejte pouze počet sportovních prostorů, které v dané hodině zabere 1. stupeň. Konkrétní hala není důležitá — solver o stejný počet sníží dostupnou kapacitu pro TV."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={restoreSchoolDefaults}
              disabled={busy}
            >
              <RotateCcw className="size-4" aria-hidden="true" />
              Obnovit školní výchozí
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={clearAll}
              disabled={busy || slots.length === 0}
            >
              Vynulovat
            </Button>
          </div>
        }
      />

      <section className="rounded-xl border border-primary/30 bg-primary-subtle p-5">
        <p className="text-sm leading-6 text-text-secondary">
          Příklad: ve čtvrtek je běžně dostupných 5 TV prostorů. Pokud u 3.
          hodiny nastavíte <strong>2 zabrané</strong>, solver v tomto slotu smí
          použít maximálně <strong>3 paralelní TV kapacity</strong>. Je to tvrdé
          omezení, ne preference.
        </p>
        <p className="mt-2 text-xs text-text-muted">
          Školní výchozí profil je předvyplněný: Út 1.–4. hodina −2, Út 5.
          hodina −3; Čt 1.–3. hodina −2, Čt 4. hodina −3; Pá 1.–2. hodina −2.
          Aktivní externí omezení: {reservedSlotCount} časových slotů.
        </p>
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
    </div>
  );
}
