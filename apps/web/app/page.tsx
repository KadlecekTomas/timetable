import { AlertTriangle, ArrowRight, CheckCircle2, Database, Upload } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";

const readinessItems = [
  { label: "Učitelé", value: "0 záznamů", ready: false },
  { label: "Třídy", value: "0 záznamů", ready: false },
  { label: "Předměty", value: "0 záznamů", ready: false },
  { label: "Výukové vazby", value: "0 záznamů", ready: false },
];

export default function HomePage() {
  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Přehled"
          title="Připravenost školního roku"
          description="Zkontrolujte vstupní data před vytvořením prvního návrhu rozvrhu. Tvrdé chyby musí být vyřešené před spuštěním solveru."
          actions={
            <>
              <Button variant="outline">
                <Upload aria-hidden="true" className="size-4" />
                Importovat Excel
              </Button>
              <Button disabled>
                Spustit generování
                <ArrowRight aria-hidden="true" className="size-4" />
              </Button>
            </>
          }
        />

        <section className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
          <article className="rounded-xl border border-border bg-surface">
            <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
              <div>
                <h2 className="text-base font-semibold text-text-primary">Vstupní data</h2>
                <p className="mt-1 text-sm text-text-secondary">
                  Základní entity potřebné pro kontrolu a generování rozvrhu.
                </p>
              </div>
              <StatusBadge tone="warning">Vyžaduje doplnění</StatusBadge>
            </div>

            <div className="divide-y divide-border">
              {readinessItems.map((item) => (
                <div key={item.label} className="flex items-center justify-between gap-4 px-5 py-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-subtle text-text-muted">
                      <Database aria-hidden="true" className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-text-primary">{item.label}</p>
                      <p className="text-xs text-text-muted">{item.value}</p>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm">
                    Doplnit
                    <ArrowRight aria-hidden="true" className="size-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </article>

          <aside className="space-y-4">
            <article className="rounded-xl border border-warning-border bg-warning-subtle p-5">
              <div className="flex items-start gap-3">
                <AlertTriangle aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-warning" />
                <div>
                  <h2 className="font-semibold text-warning-strong">4 blokující oblasti</h2>
                  <p className="mt-1 text-sm leading-6 text-warning-strong">
                    Nejprve doplňte učitele, třídy, předměty a výukové vazby. Generování zatím nelze spustit.
                  </p>
                </div>
              </div>
            </article>

            <article className="rounded-xl border border-border bg-surface p-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-semibold text-text-primary">Poslední kontrola</h2>
                <StatusBadge tone="neutral">Neproběhla</StatusBadge>
              </div>
              <div className="mt-5 flex items-center gap-3 rounded-lg bg-surface-subtle p-3">
                <CheckCircle2 aria-hidden="true" className="size-5 text-text-muted" />
                <p className="text-sm text-text-secondary">Kontrola se spustí po doplnění prvních dat.</p>
              </div>
            </article>
          </aside>
        </section>
      </div>
    </AppShell>
  );
}
