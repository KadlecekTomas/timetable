"use client";

import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Upload } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";

interface ImportIssueView {
  id?: string;
  severity: "ERROR" | "WARNING";
  sheet: string;
  row: number | null;
  column: string | null;
  code: string;
  message: string;
  suggestion: string | null;
}

interface ImportResult {
  importBatchId: string;
  status: "READY" | "VALIDATION_FAILED" | "APPLIED";
  summary: Record<string, number>;
  issues: ImportIssueView[];
  reused: boolean;
}

export default function ImportPage() {
  const searchParams = useSearchParams();
  const schoolYearId = searchParams.get("schoolYearId");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function analyze(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!schoolYearId) return;
    const form = new FormData(event.currentTarget);
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      setError("Vyberte vyplněný soubor .xlsx.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/school-years/${schoolYearId}/imports`, {
        method: "POST",
        body: form,
      });
      const payload = (await response.json()) as ImportResult & { error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "Analýza importu selhala.");
      setResult(payload);
      setFileName(file.name);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Analýza importu selhala.");
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    if (!schoolYearId || !result) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/school-years/${schoolYearId}/imports/${result.importBatchId}/apply`,
        { method: "POST" },
      );
      const payload = (await response.json()) as {
        status?: "APPLIED";
        error?: { message?: string };
      };
      if (!response.ok) throw new Error(payload.error?.message ?? "Potvrzení importu selhalo.");
      setResult((current) => (current ? { ...current, status: "APPLIED" } : current));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Potvrzení importu selhalo.");
    } finally {
      setBusy(false);
    }
  }

  if (!schoolYearId) {
    return (
      <div className="rounded-xl border border-warning-border bg-warning-subtle p-6">
        <h1 className="text-lg font-semibold">Nejprve vyberte školní rok</h1>
        <p className="mt-2 text-sm text-text-secondary">Import vždy patří ke konkrétnímu školnímu roku.</p>
      </div>
    );
  }

  const errors = result?.issues.filter((issue) => issue.severity === "ERROR") ?? [];
  const warnings = result?.issues.filter((issue) => issue.severity === "WARNING") ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Fáze 4"
        title="Excel import"
        description="Soubor se nejprve analyzuje bez zápisu. Potvrzení je dostupné pouze pro náhled bez blokujících chyb."
        actions={
          <Button asChild variant="outline">
            <a href={`/api/school-years/${schoolYearId}/import-template`}>
              <Download className="size-4" aria-hidden="true" />
              Stáhnout šablonu 1.0.0
            </a>
          </Button>
        }
      />

      <form onSubmit={analyze} className="rounded-xl border border-border bg-surface p-6">
        <label
          htmlFor="import-file"
          className="flex cursor-pointer flex-col items-center rounded-xl border-2 border-dashed border-border-strong bg-surface-subtle px-6 py-10 text-center hover:border-primary"
        >
          <FileSpreadsheet className="size-10 text-primary" aria-hidden="true" />
          <span className="mt-4 font-medium text-text-primary">
            {fileName || "Vyberte vyplněný Excel"}
          </span>
          <span className="mt-1 text-sm text-text-muted">Pouze .xlsx, nejvýše 10 MB, bez vzorců a maker</span>
          <input
            id="import-file"
            name="file"
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            required
            className="sr-only"
            onChange={(event) => setFileName(event.target.files?.[0]?.name ?? "")}
          />
        </label>
        <div className="mt-4 flex justify-end">
          <Button type="submit" disabled={busy}>
            <Upload className="size-4" aria-hidden="true" />
            {busy ? "Analyzuji…" : "Analyzovat soubor"}
          </Button>
        </div>
      </form>

      {error ? (
        <div className="rounded-lg border border-danger-border bg-danger-subtle p-4 text-sm text-danger-strong">
          {error}
        </div>
      ) : null}

      {result ? (
        <section className="space-y-4">
          <article
            className={
              result.status === "APPLIED" || result.status === "READY"
                ? "rounded-xl border border-success-border bg-success-subtle p-5"
                : "rounded-xl border border-danger-border bg-danger-subtle p-5"
            }
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                {result.status === "VALIDATION_FAILED" ? (
                  <AlertTriangle className="mt-0.5 size-5 text-danger" aria-hidden="true" />
                ) : (
                  <CheckCircle2 className="mt-0.5 size-5 text-success" aria-hidden="true" />
                )}
                <div>
                  <h2 className="font-semibold text-text-primary">
                    {result.status === "APPLIED"
                      ? "Import byl atomicky potvrzen"
                      : result.status === "READY"
                        ? "Náhled je připraven k potvrzení"
                        : "Import obsahuje blokující chyby"}
                  </h2>
                  <p className="mt-1 text-sm text-text-secondary">
                    Batch {result.importBatchId} · {result.reused ? "znovu použitý náhled" : "nová analýza"}
                  </p>
                </div>
              </div>
              <StatusBadge tone={result.status === "VALIDATION_FAILED" ? "danger" : "success"}>
                {errors.length} chyb · {warnings.length} varování
              </StatusBadge>
            </div>
          </article>

          <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-7">
            {Object.entries(result.summary)
              .filter(([key]) => !["errors", "warnings"].includes(key))
              .map(([key, value]) => (
                <div key={key} className="rounded-lg border border-border bg-surface p-4">
                  <p className="text-xs text-text-muted">{key}</p>
                  <p className="mt-1 text-xl font-semibold text-text-primary">{value}</p>
                </div>
              ))}
          </div>

          {result.issues.length ? (
            <article className="overflow-hidden rounded-xl border border-border bg-surface">
              <div className="border-b border-border px-5 py-4">
                <h2 className="font-semibold text-text-primary">Nalezené problémy</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[880px] text-left text-sm">
                  <thead className="bg-surface-subtle text-xs text-text-muted">
                    <tr>
                      <th className="px-4 py-3">Stav</th>
                      <th className="px-4 py-3">List</th>
                      <th className="px-4 py-3">Buňka</th>
                      <th className="px-4 py-3">Kód</th>
                      <th className="px-4 py-3">Vysvětlení</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {result.issues.map((issue, index) => (
                      <tr key={issue.id ?? `${issue.code}-${index}`}>
                        <td className="px-4 py-3">
                          <StatusBadge tone={issue.severity === "ERROR" ? "danger" : "warning"}>
                            {issue.severity}
                          </StatusBadge>
                        </td>
                        <td className="px-4 py-3 font-medium">{issue.sheet}</td>
                        <td className="px-4 py-3 text-text-secondary">
                          {issue.row ?? "–"} / {issue.column ?? "–"}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs">{issue.code}</td>
                        <td className="px-4 py-3 text-text-secondary">
                          {issue.message}
                          {issue.suggestion ? (
                            <p className="mt-1 text-xs text-text-muted">{issue.suggestion}</p>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          ) : null}

          {result.status === "READY" ? (
            <div className="flex justify-end">
              <Button onClick={() => void apply()} disabled={busy}>
                <CheckCircle2 className="size-4" aria-hidden="true" />
                {busy ? "Potvrzuji…" : "Potvrdit změny atomicky"}
              </Button>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
