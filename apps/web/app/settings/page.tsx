"use client";

import {
  CalendarDays,
  Database,
  FileSpreadsheet,
  Settings2,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";

interface SchoolYearListItem {
  id: string;
  schoolName: string;
  label: string;
  status: string;
  periodsPerDay: number[];
  version: number;
}

export default function SettingsPage() {
  const searchParams = useSearchParams();
  const schoolYearId = searchParams.get("schoolYearId");
  const [schoolYear, setSchoolYear] = useState<SchoolYearListItem | null>(null);
  const [loading, setLoading] = useState(Boolean(schoolYearId));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!schoolYearId) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    async function load() {
      try {
        const response = await fetch("/api/school-years", {
          cache: "no-store",
        });
        if (!response.ok) {
          throw new Error("Nastavení školního roku se nepodařilo načíst.");
        }
        const payload = (await response.json()) as {
          items: SchoolYearListItem[];
        };
        if (cancelled) return;
        const selected = payload.items.find((item) => item.id === schoolYearId);
        if (!selected) {
          setError("Vybraný školní rok nebyl nalezen.");
          return;
        }
        setSchoolYear(selected);
      } catch (cause) {
        if (!cancelled) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Nastavení školního roku se nepodařilo načíst.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [schoolYearId]);

  const context = schoolYearId
    ? `?schoolYearId=${encodeURIComponent(schoolYearId)}`
    : "";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Nastavení"
        title="Nastavení školního roku"
        description="Přehled základního kontextu a vstupních oblastí, ze kterých se vytváří rozvrh."
      />

      {!schoolYearId ? (
        <section className="rounded-xl border border-warning-border bg-warning-subtle p-6">
          <h2 className="font-semibold text-text-primary">
            Nejprve vyberte školní rok
          </h2>
          <p className="mt-2 text-sm text-text-secondary">
            Vraťte se na Přehled a zvolte školní rok, jehož nastavení chcete
            zobrazit.
          </p>
          <Button asChild className="mt-4">
            <Link href="/">Otevřít přehled</Link>
          </Button>
        </section>
      ) : null}

      {loading ? (
        <section className="rounded-xl border border-border bg-surface p-6 text-sm text-text-muted">
          Načítám nastavení…
        </section>
      ) : null}

      {error ? (
        <section className="rounded-xl border border-danger-border bg-danger-subtle p-6 text-sm text-danger-strong">
          {error}
        </section>
      ) : null}

      {schoolYear ? (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <article className="rounded-xl border border-border bg-surface p-5">
              <div className="flex items-center gap-3">
                <Settings2 className="size-5 text-primary" aria-hidden="true" />
                <h2 className="font-semibold text-text-primary">Škola</h2>
              </div>
              <p className="mt-4 text-sm font-medium text-text-primary">
                {schoolYear.schoolName}
              </p>
              <p className="mt-1 text-xs text-text-muted">
                Školní rok {schoolYear.label}
              </p>
            </article>

            <article className="rounded-xl border border-border bg-surface p-5">
              <div className="flex items-center gap-3">
                <CalendarDays
                  className="size-5 text-primary"
                  aria-hidden="true"
                />
                <h2 className="font-semibold text-text-primary">
                  Rozsah týdne
                </h2>
              </div>
              <p className="mt-4 text-sm font-medium text-text-primary">
                {schoolYear.periodsPerDay.join(" · ")} hodin
              </p>
              <p className="mt-1 text-xs text-text-muted">Pondělí až pátek</p>
            </article>

            <article className="rounded-xl border border-border bg-surface p-5">
              <div className="flex items-center gap-3">
                <Database className="size-5 text-primary" aria-hidden="true" />
                <h2 className="font-semibold text-text-primary">Verze dat</h2>
              </div>
              <p className="mt-4 text-sm font-medium text-text-primary">
                Verze {schoolYear.version}
              </p>
              <p className="mt-1 text-xs text-text-muted">
                Zvyšuje se při potvrzené změně vstupů
              </p>
            </article>

            <article className="rounded-xl border border-border bg-surface p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <FileSpreadsheet
                    className="size-5 text-primary"
                    aria-hidden="true"
                  />
                  <h2 className="font-semibold text-text-primary">Stav</h2>
                </div>
                <StatusBadge tone="neutral">
                  {schoolYear.status === "ACTIVE"
                    ? "Aktivní"
                    : schoolYear.status}
                </StatusBadge>
              </div>
              <p className="mt-4 text-sm text-text-secondary">
                Vstupní data a pravidla se spravují v navazujících oblastech.
              </p>
            </article>
          </section>

          <section className="rounded-xl border border-border bg-surface p-6">
            <h2 className="font-semibold text-text-primary">
              Správa vstupního nastavení
            </h2>
            <p className="mt-2 text-sm text-text-secondary">
              Základní parametry rozvrhu vznikají ze školních dat a z bezpečně
              potvrzeného souboru Excel. Každá změna je svázaná s vybraným
              školním rokem.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button asChild>
                <Link href={`/data${context}`}>Spravovat školní data</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href={`/import${context}`}>Načíst data z Excelu</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href={`/generate${context}`}>
                  Zkontrolovat připravenost
                </Link>
              </Button>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
