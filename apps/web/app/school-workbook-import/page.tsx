"use client";

import { AlertTriangle, CheckCircle2, FileSpreadsheet, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { ChangeEvent, useState } from "react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  analyzeChodovickaWorkbook,
  type ChodovickaWorkbookAnalysis,
} from "@/lib/import/chodovicka-workbook";
import { saveStaffingPlan } from "@/lib/local/staffing-plan";
import { saveTeachingPlan } from "@/lib/local/teaching-plan";

export default function SchoolWorkbookImportPage() {
  const router = useRouter();
  const [analysis, setAnalysis] = useState<ChodovickaWorkbookAnalysis | null>(null);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function importFile(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    setFileName(file.name);
    try {
      const result = await analyzeChodovickaWorkbook(await file.arrayBuffer());
      if (!result.matched) {
        throw new Error(
          "Soubor nemá očekávané listy Úvazky 20252026 a Jednotlivci.",
        );
      }
      setAnalysis(result);
    } catch (cause) {
      setAnalysis(null);
      setError(
        cause instanceof Error ? cause.message : "Soubor se nepodařilo načíst.",
      );
    } finally {
      setBusy(false);
      event.target.value = "";
    }
  }

  function confirmImport(): void {
    if (!analysis?.valid) return;
    if (
      !window.confirm(
        `Nahradit aktuální učitele a výuku daty ze souboru ${fileName}?`,
      )
    ) {
      return;
    }
    saveStaffingPlan(analysis.staffingPlan);
    saveTeachingPlan(analysis.teachingPlan);
    router.push("/teaching-plan?imported=1");
  }

  const errors = analysis?.issues.filter((issue) => issue.severity === "ERROR") ?? [];
  const warnings = analysis?.issues.filter((issue) => issue.severity === "WARNING") ?? [];

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        title="Import školního Excelu"
        description="Načte existující soubor vedení školy bez ručního přepisování úvazků a výuky tříd."
      />

      <section className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">
              FZŠ Chodovická · Úvazky 2025/2026
            </h2>
            <p className="mt-1 text-sm text-text-secondary">
              Očekávané listy: Úvazky 20252026 a Jednotlivci.
            </p>
          </div>
          <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90">
            <Upload className="h-4 w-4" />
            {busy ? "Načítám…" : "Vybrat Excel"}
            <input
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              disabled={busy}
              onChange={importFile}
            />
          </label>
        </div>
        {fileName ? (
          <p className="mt-4 flex items-center gap-2 text-sm text-text-secondary">
            <FileSpreadsheet className="h-4 w-4" /> {fileName}
          </p>
        ) : null}
        {error ? (
          <div className="mt-4 rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
            {error}
          </div>
        ) : null}
      </section>

      {analysis ? (
        <>
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {[
              ["Učitelé", analysis.summary.teachers],
              ["Třídy", analysis.summary.classes],
              ["Řádky výuky", analysis.summary.teachingRows],
              ["Dělené předměty", analysis.summary.splitRows],
              ["Hodin tříd týdně", analysis.summary.weeklyClassPeriods],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-xl border border-border bg-surface p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">
                  {label}
                </p>
                <p className="mt-2 text-2xl font-bold text-text-primary">{value}</p>
              </div>
            ))}
          </section>

          <section className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
            <div className="flex items-start gap-3">
              {analysis.valid ? (
                <CheckCircle2 className="mt-0.5 h-6 w-6 text-success" />
              ) : (
                <AlertTriangle className="mt-0.5 h-6 w-6 text-danger" />
              )}
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-semibold text-text-primary">
                  {analysis.valid
                    ? "Soubor je možné převzít"
                    : "Import obsahuje blokující chyby"}
                </h2>
                <p className="mt-1 text-sm text-text-secondary">
                  Dvojice učitelů oddělené lomítkem jsou zatím interpretované jako dvě paralelní skupiny. Varování zkontrolujte v editoru po importu.
                </p>
              </div>
              <Button disabled={!analysis.valid || busy} onClick={confirmImport}>
                Převzít do aplikace
              </Button>
            </div>
          </section>

          {errors.length > 0 ? (
            <IssueSection title={`Chyby (${errors.length})`} issues={errors} tone="error" />
          ) : null}
          {warnings.length > 0 ? (
            <IssueSection
              title={`Ke kontrole (${warnings.length})`}
              issues={warnings}
              tone="warning"
            />
          ) : null}
        </>
      ) : null}
    </main>
  );
}

function IssueSection({
  title,
  issues,
  tone,
}: {
  title: string;
  issues: ChodovickaWorkbookAnalysis["issues"];
  tone: "error" | "warning";
}) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
      <div className="mt-4 max-h-96 space-y-2 overflow-auto pr-2">
        {issues.map((issue, index) => (
          <div
            key={`${issue.sheet}-${issue.row}-${index}`}
            className={`rounded-lg border p-3 text-sm ${
              tone === "error"
                ? "border-danger/30 bg-danger/10 text-danger"
                : "border-warning/30 bg-warning/10 text-text-primary"
            }`}
          >
            <span className="font-semibold">{issue.sheet}</span>
            {issue.row ? ` · řádek ${issue.row}` : ""}: {issue.message}
          </div>
        ))}
      </div>
    </section>
  );
}
