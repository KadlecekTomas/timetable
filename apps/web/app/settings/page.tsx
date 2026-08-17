"use client";

import {
  CalendarDays,
  Download,
  HardDrive,
  Save,
  Share2,
  Trash2,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  getLocalProject,
  subscribeLocalProject,
  updateLocalProjectSettings,
  type LocalProject,
} from "@/lib/local/api";
import {
  applyBrowserProjectShare,
  browserProjectShareBlob,
  captureBrowserProjectShare,
  readBrowserProjectShareFile,
  resetBrowserProject,
} from "@/lib/local/project-share";

const dayNames = ["Pondělí", "Úterý", "Středa", "Čtvrtek", "Pátek"];
const inputClass =
  "mt-1.5 h-10 w-full rounded-md border border-border-strong bg-surface px-3 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

function safeFilePart(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function SettingsPage() {
  const searchParams = useSearchParams();
  const schoolYearId = searchParams.get("schoolYearId") ?? "local-school-year";
  const restoreInput = useRef<HTMLInputElement>(null);
  const [project, setProject] = useState<LocalProject | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setProject(await getLocalProject());
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Lokální projekt se nepodařilo načíst.",
      );
    }
  }

  useEffect(() => {
    void load();
    return subscribeLocalProject(() => void load());
  }, []);

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const periodsPerDay = dayNames.map((_day, index) =>
        Number(form.get(`periods-${index}`)),
      );
      const updated = await updateLocalProjectSettings({
        schoolName: String(form.get("schoolName") ?? ""),
        label: String(form.get("label") ?? ""),
        periodsPerDay,
      });
      setProject(updated);
      setMessage("Nastavení projektu bylo uloženo do tohoto prohlížeče.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Uložení selhalo.");
    } finally {
      setBusy(false);
    }
  }

  async function downloadBackup() {
    if (!project) return;
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const envelope = await captureBrowserProjectShare();
      const school = safeFilePart(project.schoolName) || "skola";
      const year = project.label.replace("/", "-");
      downloadBlob(
        browserProjectShareBlob(envelope),
        `rozvrhar-${school}-${year}.rozvrhar.json`,
      );
      setMessage(
        "Záloha byla stažena. Uložte ji také na školní Google Disk nebo jiné bezpečné místo.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Zálohu nelze vytvořit.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function restoreBackup(file: File) {
    if (
      !window.confirm(
        "Obnova nahradí celý současný lokální projekt obsahem zálohy. Pokračovat?",
      )
    ) {
      return;
    }
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const envelope = await readBrowserProjectShareFile(file);
      await applyBrowserProjectShare(envelope);
      const restored = await getLocalProject();
      setProject(restored);
      setMessage(
        "Projekt byl úspěšně obnoven včetně pracovních úvazků a učebního plánu.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Zálohu nelze obnovit.",
      );
    } finally {
      setBusy(false);
      if (restoreInput.current) restoreInput.current.value = "";
    }
  }

  async function eraseProject() {
    if (
      !window.confirm(
        "Opravdu vymazat celý projekt z tohoto prohlížeče? Před pokračováním si stáhněte zálohu.",
      )
    ) {
      return;
    }
    if (
      !window.confirm(
        "Tato operace odstraní učitele, třídy, pravidla i vytvořené rozvrhy. Potvrdit definitivní vymazání?",
      )
    ) {
      return;
    }
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const empty = await resetBrowserProject();
      setProject(empty);
      setMessage("Lokální projekt byl vymazán a vytvořen znovu prázdný.");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Projekt nelze vymazat.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Nastavení"
        title="Lokální projekt školy"
        description="Data jsou uložena pouze v tomto prohlížeči. Nevzniká žádný účet ani placená serverová databáze."
        actions={
          <Button
            type="button"
            variant="outline"
            onClick={() => void downloadBackup()}
            disabled={busy || !project}
          >
            <Download className="size-4" aria-hidden="true" />
            Stáhnout zálohu
          </Button>
        }
      />

      <section className="rounded-xl border border-primary/30 bg-primary-subtle p-5">
        <div className="flex items-start gap-3">
          <Share2 className="mt-0.5 size-5 text-primary" aria-hidden="true" />
          <div>
            <h2 className="font-semibold text-text-primary">
              Sdílet projekt bez databáze
            </h2>
            <p className="mt-1 text-sm leading-6 text-text-secondary">
              Vytvořte odkaz nebo soubor, který kolegyně otevře na jiném
              počítači. Projekt se neukládá na Vercel ani do serverové databáze.
            </p>
            <Button asChild className="mt-4">
              <Link
                href={`/share?schoolYearId=${encodeURIComponent(schoolYearId)}`}
              >
                Sdílet nebo převzít projekt
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="font-semibold text-text-primary">
          Volitelné školní vybavení
        </h2>
        <p className="mt-1 text-sm text-text-secondary">
          Učebny a jejich typy lze doplnit po přípravě školních dat.
        </p>
        <Button asChild variant="outline" className="mt-4">
          <Link href={`/data?schoolYearId=${encodeURIComponent(schoolYearId)}`}>
            Upravit učebny a omezení
          </Link>
        </Button>
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

      <section className="grid gap-4 md:grid-cols-3">
        <article className="rounded-xl border border-border bg-surface p-5">
          <div className="flex items-center gap-3">
            <HardDrive className="size-5 text-primary" aria-hidden="true" />
            <h2 className="font-semibold text-text-primary">Úložiště</h2>
          </div>
          <p className="mt-4 text-sm font-medium text-text-primary">
            IndexedDB v tomto zařízení
          </p>
          <p className="mt-1 text-xs leading-5 text-text-muted">
            Data přežijí zavření karty i restart počítače, ale mohou zmizet po
            vymazání dat prohlížeče.
          </p>
        </article>

        <article className="rounded-xl border border-border bg-surface p-5">
          <div className="flex items-center gap-3">
            <CalendarDays className="size-5 text-primary" aria-hidden="true" />
            <h2 className="font-semibold text-text-primary">Projekt</h2>
          </div>
          <p className="mt-4 text-sm font-medium text-text-primary">
            {project?.schoolName ?? "Načítám…"}
          </p>
          <p className="mt-1 text-xs text-text-muted">
            Školní rok {project?.label ?? "–"} · verze {project?.version ?? "–"}
          </p>
        </article>

        <article className="rounded-xl border border-border bg-surface p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold text-text-primary">
              Poslední uložení
            </h2>
            <StatusBadge tone="success">Automatické</StatusBadge>
          </div>
          <p className="mt-4 text-sm font-medium text-text-primary">
            {project?.updatedAt
              ? new Date(project.updatedAt).toLocaleString("cs-CZ")
              : "–"}
          </p>
          <p className="mt-1 text-xs text-text-muted">
            Každá potvrzená změna se ukládá okamžitě.
          </p>
        </article>
      </section>

      {project ? (
        <form
          key={`${project.version}-${project.updatedAt}`}
          onSubmit={saveSettings}
          className="rounded-xl border border-border bg-surface p-6"
        >
          <div>
            <h2 className="font-semibold text-text-primary">
              Základní nastavení
            </h2>
            <p className="mt-1 text-sm text-text-secondary">
              Nastavení platí pro jedinou školu a jediný aktivní školní rok.
            </p>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="text-sm font-medium text-text-primary">
              Název školy
              <input
                name="schoolName"
                defaultValue={project.schoolName}
                required
                className={inputClass}
              />
            </label>
            <label className="text-sm font-medium text-text-primary">
              Školní rok
              <input
                name="label"
                defaultValue={project.label}
                required
                pattern="\d{4}/\d{4}"
                placeholder="2026/2027"
                className={inputClass}
              />
            </label>
          </div>

          <div className="mt-5">
            <h3 className="text-sm font-medium text-text-primary">
              Počet vyučovacích hodin v jednotlivých dnech
            </h3>
            <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {dayNames.map((day, index) => (
                <label
                  key={day}
                  className="text-xs font-medium text-text-muted"
                >
                  {day}
                  <input
                    name={`periods-${index}`}
                    type="number"
                    min={1}
                    max={16}
                    defaultValue={project.periodsPerDay[index] ?? 8}
                    required
                    className={inputClass}
                  />
                </label>
              ))}
            </div>
          </div>

          <div className="mt-6 flex justify-end">
            <Button type="submit" disabled={busy}>
              <Save className="size-4" aria-hidden="true" />
              {busy ? "Ukládám…" : "Uložit nastavení"}
            </Button>
          </div>
        </form>
      ) : null}

      <section className="grid gap-5 lg:grid-cols-2">
        <article className="rounded-xl border border-border bg-surface p-6">
          <h2 className="font-semibold text-text-primary">
            Záloha a přenos na jiné zařízení
          </h2>
          <p className="mt-2 text-sm leading-6 text-text-secondary">
            Záloha obsahuje pracovní úvazky, učební plán, importy, připravená
            solverová data, vytvořené rozvrhy, zámky i historii vrácení změn.
            Soubor má kontrolní součet a poškozenou zálohu aplikace odmítne.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button
              type="button"
              onClick={() => void downloadBackup()}
              disabled={busy || !project}
            >
              <Download className="size-4" aria-hidden="true" />
              Stáhnout zálohu projektu
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => restoreInput.current?.click()}
              disabled={busy}
            >
              <Upload className="size-4" aria-hidden="true" />
              Obnovit projekt ze zálohy
            </Button>
            <input
              ref={restoreInput}
              type="file"
              accept=".json,.rozvrhar,application/json"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void restoreBackup(file);
              }}
            />
          </div>
        </article>

        <article className="rounded-xl border border-danger-border bg-danger-subtle p-6">
          <h2 className="font-semibold text-text-primary">Nebezpečná oblast</h2>
          <p className="mt-2 text-sm leading-6 text-text-secondary">
            Vymazání odstraní celý projekt pouze z tohoto prohlížeče. Bez
            stažené zálohy není možné data obnovit.
          </p>
          <Button
            type="button"
            variant="outline"
            className="mt-5"
            onClick={() => void eraseProject()}
            disabled={busy}
          >
            <Trash2 className="size-4 text-danger" aria-hidden="true" />
            Vymazat lokální projekt
          </Button>
        </article>
      </section>
    </div>
  );
}
