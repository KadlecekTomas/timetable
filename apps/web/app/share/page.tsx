"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Download,
  FileUp,
  Link2,
  Share2,
  ShieldCheck,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { ChangeEvent, useEffect, useRef, useState } from "react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  applyBrowserProjectShare,
  BROWSER_PROJECT_SHARE_HASH_PREFIX,
  BROWSER_PROJECT_SHARE_MAX_LINK_LENGTH,
  browserProjectShareBlob,
  captureBrowserProjectShare,
  decodeBrowserProjectShare,
  encodeBrowserProjectShare,
  readBrowserProjectShareFile,
  summarizeBrowserProjectShare,
  type BrowserProjectShareEnvelope,
  type BrowserProjectShareSummary,
} from "@/lib/local/project-share";

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function safeFilePart(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function SummaryCards({ summary }: { summary: BrowserProjectShareSummary }) {
  const cards: Array<[string, number]> = [
    ["Učitelé v pracovním plánu", summary.teachers],
    ["Třídy", summary.classes],
    ["Řádky výuky", summary.teachingRows],
    ["Výukové vazby pro generátor", summary.assignments],
    ["Uložené verze rozvrhu", summary.timetableVersions],
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {cards.map(([label, value]) => (
        <article
          key={label}
          className="rounded-xl border border-border bg-surface-subtle p-4"
        >
          <p className="text-xs font-medium text-text-muted">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-text-primary">
            {value}
          </p>
        </article>
      ))}
    </div>
  );
}

export default function SharePage() {
  const searchParams = useSearchParams();
  const schoolYearId = searchParams.get("schoolYearId") ?? "local-school-year";
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [shareLink, setShareLink] = useState("");
  const [linkTooLarge, setLinkTooLarge] = useState(false);
  const [outgoingSummary, setOutgoingSummary] =
    useState<BrowserProjectShareSummary | null>(null);
  const [incoming, setIncoming] = useState<BrowserProjectShareEnvelope | null>(
    null,
  );
  const [incomingSummary, setIncomingSummary] =
    useState<BrowserProjectShareSummary | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const hash = window.location.hash;
    if (!hash.startsWith(BROWSER_PROJECT_SHARE_HASH_PREFIX)) return;
    const payload = hash.slice(BROWSER_PROJECT_SHARE_HASH_PREFIX.length);
    setBusy(true);
    void decodeBrowserProjectShare(payload)
      .then((envelope) => {
        setIncoming(envelope);
        setIncomingSummary(summarizeBrowserProjectShare(envelope));
      })
      .catch((cause) => {
        setError(
          cause instanceof Error
            ? cause.message
            : "Sdílený odkaz se nepodařilo načíst.",
        );
      })
      .finally(() => setBusy(false));
  }, []);

  async function createLink(): Promise<void> {
    setBusy(true);
    setMessage(null);
    setError(null);
    setShareLink("");
    setLinkTooLarge(false);
    try {
      const envelope = await captureBrowserProjectShare();
      const payload = await encodeBrowserProjectShare(envelope);
      const link = `${window.location.origin}/share?schoolYearId=${encodeURIComponent(
        schoolYearId,
      )}${BROWSER_PROJECT_SHARE_HASH_PREFIX}${payload}`;
      setOutgoingSummary(summarizeBrowserProjectShare(envelope));
      if (link.length > BROWSER_PROJECT_SHARE_MAX_LINK_LENGTH) {
        setLinkTooLarge(true);
        setMessage(
          "Projekt je pro spolehlivý odkaz příliš velký. Použijte soubor projektu níže.",
        );
        return;
      }
      setShareLink(link);
      setMessage(
        "Odkaz je připravený. Data jsou přímo v odkazu a neukládají se na server.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Odkaz nelze vytvořit.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function copyLink(): Promise<void> {
    if (!shareLink) return;
    try {
      await navigator.clipboard.writeText(shareLink);
      setMessage("Odkaz byl zkopírován do schránky.");
    } catch {
      setError(
        "Odkaz se nepodařilo zkopírovat. Označte jej a zkopírujte ručně.",
      );
    }
  }

  async function downloadProjectFile(): Promise<void> {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const envelope = await captureBrowserProjectShare();
      const school = safeFilePart(envelope.data.project.schoolName) || "skola";
      const year = envelope.data.project.label.replaceAll("/", "-");
      downloadBlob(
        browserProjectShareBlob(envelope),
        `rozvrhar-${school}-${year}.rozvrhar.json`,
      );
      setOutgoingSummary(summarizeBrowserProjectShare(envelope));
      setMessage(
        "Soubor projektu byl stažen. Kolegyně jej načte na této stejné stránce.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Soubor projektu nelze vytvořit.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function loadProjectFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const envelope = await readBrowserProjectShareFile(file);
      setIncoming(envelope);
      setIncomingSummary(summarizeBrowserProjectShare(envelope));
      setMessage(
        "Soubor je v pořádku. Zkontrolujte souhrn a potvrďte načtení.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Soubor projektu se nepodařilo načíst.",
      );
    } finally {
      setBusy(false);
      event.target.value = "";
    }
  }

  async function applyIncoming(): Promise<void> {
    if (!incoming) return;
    if (
      !window.confirm(
        "Načtení nahradí pracovní data i připravený rozvrhový projekt v tomto prohlížeči. Pokračovat?",
      )
    ) {
      return;
    }
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      await applyBrowserProjectShare(incoming);
      window.history.replaceState(
        null,
        "",
        `/share?schoolYearId=${encodeURIComponent(schoolYearId)}`,
      );
      window.location.assign(
        `/?schoolYearId=${encodeURIComponent(schoolYearId)}&shared=1`,
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Projekt se nepodařilo bezpečně načíst.",
      );
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Sdílení bez databáze"
        title="Přenést projekt na jiný počítač"
        description="Vytvořte odkaz nebo soubor, který obsahuje celý pracovní stav. Server ani Vercel projekt neukládají."
      />

      <section className="rounded-xl border border-primary/30 bg-primary-subtle p-5">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" />
          <div>
            <h2 className="font-semibold text-text-primary">
              Jak to funguje bez databáze
            </h2>
            <p className="mt-1 text-sm leading-6 text-text-secondary">
              U odkazu jsou data uložena až za znakem #. Tato část se neposílá
              webovému serveru. Soubor i odkaz ale obsahují jména a školní data;
              předejte je jen důvěryhodné osobě. Každý, kdo odkaz získá, může
              jeho obsah načíst.
            </p>
          </div>
        </div>
      </section>

      {message ? (
        <div className="rounded-xl border border-success-border bg-success-subtle p-4 text-sm text-success-strong">
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-xl border border-danger-border bg-danger-subtle p-4 text-sm text-danger-strong">
          {error}
        </div>
      ) : null}

      {incoming && incomingSummary ? (
        <section className="rounded-2xl border-2 border-primary bg-surface p-6">
          <div className="flex items-start gap-3">
            <FileUp className="mt-0.5 size-6 text-primary" />
            <div>
              <h2 className="text-lg font-semibold text-text-primary">
                Přijatý projekt je připravený k načtení
              </h2>
              <p className="mt-1 text-sm text-text-secondary">
                {incoming.data.project.schoolName} · školní rok{" "}
                {incoming.data.project.label} · export{" "}
                {new Date(incoming.exportedAt).toLocaleString("cs-CZ")}
              </p>
            </div>
          </div>
          <div className="mt-5">
            <SummaryCards summary={incomingSummary} />
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button
              type="button"
              onClick={() => void applyIncoming()}
              disabled={busy}
            >
              <CheckCircle2 className="size-4" />
              {busy ? "Načítám projekt…" : "Načíst tento projekt"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIncoming(null);
                setIncomingSummary(null);
                window.history.replaceState(
                  null,
                  "",
                  `/share?schoolYearId=${encodeURIComponent(schoolYearId)}`,
                );
              }}
              disabled={busy}
            >
              Zrušit
            </Button>
          </div>
        </section>
      ) : null}

      <section className="grid gap-5 lg:grid-cols-2">
        <article className="rounded-2xl border border-border bg-surface p-6">
          <div className="flex items-start gap-3">
            <Share2 className="mt-0.5 size-5 text-primary" />
            <div>
              <h2 className="font-semibold text-text-primary">
                Odeslat kolegyni odkaz
              </h2>
              <p className="mt-1 text-sm leading-6 text-text-secondary">
                Nejrychlejší varianta. Odkaz přenese pracovní úvazky, pokrytí,
                učební plán, připravená solverová data i případné verze rozvrhu.
              </p>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button
              type="button"
              onClick={() => void createLink()}
              disabled={busy}
            >
              <Link2 className="size-4" />
              {busy ? "Připravuji…" : "Vytvořit sdílecí odkaz"}
            </Button>
            {shareLink ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => void copyLink()}
              >
                <Copy className="size-4" />
                Kopírovat odkaz
              </Button>
            ) : null}
          </div>
          {shareLink ? (
            <textarea
              aria-label="Sdílecí odkaz"
              readOnly
              value={shareLink}
              onFocus={(event) => event.currentTarget.select()}
              className="mt-4 h-28 w-full resize-none rounded-lg border border-border-strong bg-surface-subtle p-3 text-xs text-text-secondary"
            />
          ) : null}
          {linkTooLarge ? (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-warning-border bg-warning-subtle p-3 text-sm text-warning-strong">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              Pro tento projekt použijte soubor. Dlouhé odkazy mohou e-mail nebo
              chat zkrátit.
            </div>
          ) : null}
        </article>

        <article className="rounded-2xl border border-border bg-surface p-6">
          <div className="flex items-start gap-3">
            <Download className="mt-0.5 size-5 text-primary" />
            <div>
              <h2 className="font-semibold text-text-primary">
                Přenést projekt souborem
              </h2>
              <p className="mt-1 text-sm leading-6 text-text-secondary">
                Nejspolehlivější varianta pro velký projekt. Soubor lze poslat
                přes školní Disk, e-mail nebo USB a načíst na této stránce.
              </p>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button
              type="button"
              onClick={() => void downloadProjectFile()}
              disabled={busy}
            >
              <Download className="size-4" />
              Stáhnout soubor projektu
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInput.current?.click()}
              disabled={busy}
            >
              <FileUp className="size-4" />
              Načíst soubor projektu
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept=".json,.rozvrhar,application/json"
              className="sr-only"
              onChange={(event) => void loadProjectFile(event)}
            />
          </div>
        </article>
      </section>

      {outgoingSummary ? (
        <section className="rounded-xl border border-border bg-surface p-5">
          <h2 className="font-semibold text-text-primary">Co bude přeneseno</h2>
          <div className="mt-4">
            <SummaryCards summary={outgoingSummary} />
          </div>
        </section>
      ) : null}
    </div>
  );
}
