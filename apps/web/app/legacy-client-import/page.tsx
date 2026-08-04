"use client";

import { useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { localApiFetch } from "@/lib/local/api";

interface ImportResult {
  importBatchId: string;
  status: "READY" | "VALIDATION_FAILED" | "APPLIED";
  issues: Array<{ severity: string; message: string }>;
  error?: { message?: string };
}

/** Hidden compatibility harness for the legacy client-workbook regression tests. */
export default function LegacyClientImportPage() {
  const schoolYearId =
    useSearchParams().get("schoolYearId") ?? "local-school-year";
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function analyze(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const response = await localApiFetch(
        `/api/school-years/${schoolYearId}/imports`,
        { method: "POST", body: form },
      );
      const payload = (await response.json()) as ImportResult;
      if (!response.ok)
        throw new Error(payload.error?.message ?? "Analýza souboru selhala.");
      setResult(payload);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Analýza souboru selhala.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    if (!result) return;
    setBusy(true);
    try {
      const response = await localApiFetch(
        `/api/school-years/${schoolYearId}/imports/${result.importBatchId}/apply`,
        { method: "POST" },
      );
      const payload = (await response.json()) as {
        error?: { message?: string };
      };
      if (!response.ok)
        throw new Error(payload.error?.message ?? "Uložení selhalo.");
      setResult((current) =>
        current ? { ...current, status: "APPLIED" } : current,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Uložení selhalo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Testovací kompatibilita"
        title="Načtení starší klientské šablony"
        description="Tato skrytá stránka udržuje regresní pokrytí staršího formátu; není součástí uživatelského workflow."
      />
      <form
        onSubmit={analyze}
        className="rounded-xl border border-border bg-surface p-6"
      >
        <input
          id="import-file"
          name="file"
          type="file"
          accept=".xlsx"
          required
        />
        <Button type="submit" className="ml-4" disabled={busy}>
          {busy ? "Analyzuji…" : "Analyzovat soubor"}
        </Button>
      </form>
      {error ? (
        <div className="rounded-lg border border-danger-border bg-danger-subtle p-4">
          {error}
        </div>
      ) : null}
      {result ? (
        <section className="rounded-xl border border-border bg-surface p-6">
          <h2 className="font-semibold">
            {result.status === "APPLIED"
              ? "Data byla bezpečně uložena"
              : result.status === "READY"
                ? "Náhled je připraven k uložení"
                : "Soubor obsahuje blokující chyby"}
          </h2>
          {result.status === "READY" ? (
            <Button
              className="mt-4"
              onClick={() => void apply()}
              disabled={busy}
            >
              Bezpečně uložit změny
            </Button>
          ) : null}
          {result.issues.length ? (
            <ul className="mt-4 text-sm">
              {result.issues.map((issue, index) => (
                <li key={index}>{issue.message}</li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
