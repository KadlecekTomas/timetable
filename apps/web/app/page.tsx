"use client";

import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Database,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import type { ReadinessReport } from "@/lib/domain/contracts";

interface SchoolYearListItem {
  id: string;
  schoolName: string;
  label: string;
  status: string;
  version: number;
}

export default function HomePage() {
  const searchParams = useSearchParams();
  const requestedSchoolYearId = searchParams.get("schoolYearId");
  const [schoolYears, setSchoolYears] = useState<SchoolYearListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(
    requestedSchoolYearId,
  );
  const [readiness, setReadiness] = useState<ReadinessReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch("/api/school-years", {
          cache: "no-store",
        });
        if (!response.ok) throw new Error("Školní roky se nepodařilo načíst.");
        const payload = (await response.json()) as {
          items: SchoolYearListItem[];
        };
        if (cancelled) return;
        setSchoolYears(payload.items);
        setSelectedId((current) => current ?? payload.items[0]?.id ?? null);
      } catch (cause) {
        if (!cancelled)
          setError(cause instanceof Error ? cause.message : "Načtení selhalo.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setReadiness(null);
      return;
    }
    let cancelled = false;
    async function loadReadiness() {
      const response = await fetch(
        `/api/school-years/${selectedId}/readiness`,
        {
          cache: "no-store",
        },
      );
      if (!response.ok) return;
      const payload = (await response.json()) as ReadinessReport;
      if (!cancelled) setReadiness(payload);
    }
    void loadReadiness();
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const selected = schoolYears.find((item) => item.id === selectedId);
  const context = selectedId
    ? `?schoolYearId=${encodeURIComponent(selectedId)}`
    : "";
  const readinessItems = [
    { label: "Učitelé", value: readiness?.summary.teachers ?? 0 },
    { label: "Třídy", value: readiness?.summary.classes ?? 0 },
    { label: "Předměty", value: readiness?.summary.subjects ?? 0 },
    { label: "Výukové vazby", value: readiness?.summary.assignments ?? 0 },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Přehled"
        title="Připravenost školního roku"
        description="Zkontrolujte vstupní data před vytvořením návrhu. Tvrdé chyby musí být vyřešené před spuštěním solveru."
        actions={
          selectedId ? (
            <>
              <Button asChild variant="outline">
                <Link href={`/import${context}`}>
                  <Upload aria-hidden="true" className="size-4" />
                  Importovat Excel
                </Link>
              </Button>
              <Button asChild disabled={!readiness?.ready}>
                <Link href={`/generate${context}`}>
                  Spustit generování
                  <ArrowRight aria-hidden="true" className="size-4" />
                </Link>
              </Button>
            </>
          ) : null
        }
      />

      <section className="rounded-xl border border-border bg-surface p-5">
        <label
          htmlFor="school-year"
          className="text-sm font-medium text-text-primary"
        >
          Školní rok
        </label>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <select
            id="school-year"
            value={selectedId ?? ""}
            onChange={(event) => setSelectedId(event.target.value || null)}
            className="h-10 min-w-72 rounded-md border border-border-strong bg-surface px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <option value="">Vyberte školní rok</option>
            {schoolYears.map((item) => (
              <option key={item.id} value={item.id}>
                {item.schoolName} · {item.label}
              </option>
            ))}
          </select>
          {selected ? (
            <StatusBadge tone="neutral">
              Verze dat {selected.version}
            </StatusBadge>
          ) : null}
        </div>
        {loading ? (
          <p className="mt-3 text-sm text-text-muted">Načítám školní roky…</p>
        ) : null}
        {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
        {!loading && schoolYears.length === 0 ? (
          <p className="mt-3 text-sm text-text-secondary">
            Zatím neexistuje žádný školní rok. Vytvořte jej přes API nebo
            připravovaný formulář nastavení.
          </p>
        ) : null}
      </section>

      {selectedId ? (
        <section className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
          <article className="rounded-xl border border-border bg-surface">
            <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
              <div>
                <h2 className="text-base font-semibold text-text-primary">
                  Vstupní data
                </h2>
                <p className="mt-1 text-sm text-text-secondary">
                  Entity, které vstupují do readiness kontroly a immutable
                  solver snapshotu.
                </p>
              </div>
              <StatusBadge tone={readiness?.ready ? "success" : "warning"}>
                {readiness?.ready ? "Připraveno" : "Vyžaduje doplnění"}
              </StatusBadge>
            </div>

            <div className="divide-y divide-border">
              {readinessItems.map((item) => (
                <div
                  key={item.label}
                  className="flex items-center justify-between gap-4 px-5 py-4"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-subtle text-text-muted">
                      <Database aria-hidden="true" className="size-4" />
                    </div>
                    <div>
                      <p className="font-medium text-text-primary">
                        {item.label}
                      </p>
                      <p className="text-xs text-text-muted">
                        {item.value} záznamů
                      </p>
                    </div>
                  </div>
                  <Button asChild variant="ghost" size="sm">
                    <Link href={`/data${context}`}>
                      Upravit
                      <ArrowRight aria-hidden="true" className="size-3.5" />
                    </Link>
                  </Button>
                </div>
              ))}
            </div>
          </article>

          <aside className="space-y-4">
            <article
              className={
                readiness?.ready
                  ? "rounded-xl border border-success-border bg-success-subtle p-5"
                  : "rounded-xl border border-warning-border bg-warning-subtle p-5"
              }
            >
              <div className="flex items-start gap-3">
                {readiness?.ready ? (
                  <CheckCircle2
                    aria-hidden="true"
                    className="mt-0.5 size-5 text-success"
                  />
                ) : (
                  <AlertTriangle
                    aria-hidden="true"
                    className="mt-0.5 size-5 text-warning"
                  />
                )}
                <div>
                  <h2 className="font-semibold text-text-primary">
                    {readiness?.ready
                      ? "Generování lze spustit"
                      : `${readiness?.blockers.length ?? 0} blokujících problémů`}
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-text-secondary">
                    {readiness?.ready
                      ? "Vstupní data prošla serverovou kontrolou."
                      : (readiness?.blockers[0]?.message ??
                        "Načítám readiness kontrolu…")}
                  </p>
                </div>
              </div>
            </article>

            <article className="rounded-xl border border-border bg-surface p-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-semibold text-text-primary">Souhrn</h2>
                <StatusBadge
                  tone={readiness?.warnings.length ? "warning" : "neutral"}
                >
                  {readiness?.warnings.length ?? 0} varování
                </StatusBadge>
              </div>
              <p className="mt-4 text-sm text-text-secondary">
                Celkem {readiness?.summary.weekly_periods ?? 0} vyučovacích
                hodin týdně.
              </p>
            </article>
          </aside>
        </section>
      ) : null}
    </div>
  );
}
