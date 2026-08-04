"use client";

import { Plus, RefreshCw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  getLocalProject,
  localApiFetch,
  subscribeLocalProject,
} from "@/lib/local/api";
import {
  preparedInputState,
  type PreparedInputState,
} from "@/lib/local/school-input-state";
import {
  loadStaffingPlan,
  subscribeStaffingPlan,
} from "@/lib/local/staffing-plan";
import {
  loadTeachingPlan,
  subscribeTeachingPlan,
} from "@/lib/local/teaching-plan";

const sections = [
  { id: "room-types", label: "Typy učeben" },
  { id: "rooms", label: "Učebny" },
] as const;
type SectionId = (typeof sections)[number]["id"];
type RecordValue = Record<string, unknown>;

function text(record: RecordValue, key: string): string {
  return typeof record[key] === "string" ? String(record[key]) : "";
}

const inputClass =
  "mt-1.5 h-10 w-full rounded-md border border-border-strong bg-surface px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

export default function DataPage() {
  const searchParams = useSearchParams();
  const schoolYearId = searchParams.get("schoolYearId") ?? "local-school-year";
  const context = `schoolYearId=${encodeURIComponent(schoolYearId)}`;
  const [section, setSection] = useState<SectionId>("room-types");
  const [records, setRecords] = useState<RecordValue[]>([]);
  const [roomTypes, setRoomTypes] = useState<RecordValue[]>([]);
  const [projectVersion, setProjectVersion] = useState<number | null>(null);
  const [prepared, setPrepared] = useState<PreparedInputState>("EMPTY");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const staffing = loadStaffingPlan();
    const teaching = loadTeachingPlan();
    const project = await getLocalProject();
    const state = preparedInputState(project, staffing, teaching);
    setPrepared(state);
    setProjectVersion(project.version);
    if (state === "EMPTY") {
      setRecords([]);
      setRoomTypes([]);
      return;
    }
    const [recordsResponse, typesResponse] = await Promise.all([
      localApiFetch(`/api/school-years/${schoolYearId}/${section}`, {
        cache: "no-store",
      }),
      localApiFetch(`/api/school-years/${schoolYearId}/room-types`, {
        cache: "no-store",
      }),
    ]);
    if (!recordsResponse.ok || !typesResponse.ok)
      throw new Error("Učebny se nepodařilo načíst.");
    setRecords(
      ((await recordsResponse.json()) as { items: RecordValue[] }).items,
    );
    setRoomTypes(
      ((await typesResponse.json()) as { items: RecordValue[] }).items,
    );
  }, [schoolYearId, section]);

  useEffect(() => {
    void load().catch((cause) =>
      setError(cause instanceof Error ? cause.message : "Načtení selhalo."),
    );
    const refresh = () => void load();
    const unsubProject = subscribeLocalProject(refresh);
    const unsubStaffing = subscribeStaffingPlan(refresh);
    const unsubTeaching = subscribeTeachingPlan(refresh);
    window.addEventListener("focus", refresh);
    return () => {
      unsubProject();
      unsubStaffing();
      unsubTeaching();
      window.removeEventListener("focus", refresh);
    };
  }, [load]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (projectVersion == null) return;
    const form = new FormData(event.currentTarget);
    const value = (key: string) => String(form.get(key) ?? "").trim();
    const body =
      section === "room-types"
        ? {
            expectedSchoolYearVersion: projectVersion,
            code: value("code"),
            name: value("name"),
          }
        : {
            expectedSchoolYearVersion: projectVersion,
            code: value("code"),
            name: value("name"),
            capacity: value("capacity") ? Number(value("capacity")) : null,
            roomTypeId: value("roomTypeId") || null,
          };
    setBusy(true);
    setError(null);
    try {
      const response = await localApiFetch(
        `/api/school-years/${schoolYearId}/${section}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const payload = (await response.json()) as {
        error?: { message?: string };
      };
      if (!response.ok)
        throw new Error(payload.error?.message ?? "Položku nelze uložit.");
      event.currentTarget.reset();
      setMessage("Položka byla uložena.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Uložení selhalo.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(record: RecordValue) {
    if (
      projectVersion == null ||
      !window.confirm(
        `Odstranit „${text(record, "name") || text(record, "code")}“?`,
      )
    )
      return;
    const response = await localApiFetch(
      `/api/school-years/${schoolYearId}/${section}/${encodeURIComponent(text(record, "id"))}`,
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedSchoolYearVersion: projectVersion }),
      },
    );
    if (!response.ok) {
      const payload = (await response.json()) as {
        error?: { message?: string };
      };
      setError(payload.error?.message ?? "Položku nelze odstranit.");
      return;
    }
    setMessage("Položka byla odstraněna.");
    await load();
  }

  if (prepared === "EMPTY") {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Volitelné"
          title="Učebny a doplňková omezení"
          description="Učebny můžete upravit až nad připraveným zadáním pro generátor."
        />
        <section className="rounded-xl border border-info-border bg-info-subtle p-8 text-center">
          <h2 className="text-lg font-semibold text-text-primary">
            Nejdřív připravte školní data pro tvorbu rozvrhu.
          </h2>
          <Button asChild className="mt-5">
            <Link href={`/generate?${context}`}>Přejít na přípravu dat</Link>
          </Button>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Volitelné"
        title="Učebny a doplňková omezení"
        description="Tato stránka spravuje pouze učebny. Učitele, třídy, předměty a výukové vazby vlastní hlavní školní workflow."
        actions={
          <Button variant="outline" onClick={() => void load()}>
            <RefreshCw className="size-4" />
            Obnovit
          </Button>
        }
      />
      {prepared === "STALE" ? (
        <div className="rounded-lg border border-warning-border bg-warning-subtle p-4 text-sm text-warning-strong">
          Připravená školní data jsou zastaralá. Nová příprava zachová učebny a
          typy učeben, ostatní vstupy znovu sjednotí s pracovním plánem.
        </div>
      ) : null}
      <div className="flex gap-2">
        {sections.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setSection(item.id)}
            className={
              section === item.id
                ? "rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
                : "rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium"
            }
          >
            {item.label}
          </button>
        ))}
        <StatusBadge tone={prepared === "CURRENT" ? "success" : "warning"}>
          {prepared === "CURRENT" ? "Aktuální projekt" : "Zastaralý projekt"}
        </StatusBadge>
      </div>
      {message ? (
        <div className="rounded-lg border border-success-border bg-success-subtle p-3 text-sm text-success-strong">
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-lg border border-danger-border bg-danger-subtle p-3 text-sm text-danger-strong">
          {error}
        </div>
      ) : null}
      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(340px,1fr)]">
        <article className="overflow-hidden rounded-xl border border-border bg-surface">
          <div className="border-b border-border px-5 py-4">
            <h2 className="font-semibold">
              {sections.find((item) => item.id === section)?.label}
            </h2>
            <p className="text-xs text-text-muted">{records.length} položek</p>
          </div>
          {records.length ? (
            <div className="divide-y divide-border">
              {records.map((record) => (
                <div
                  key={text(record, "id")}
                  className="flex items-center justify-between px-5 py-3"
                >
                  <div>
                    <p className="font-medium">{text(record, "name")}</p>
                    <p className="text-xs text-text-muted">
                      {text(record, "code")}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Odstranit"
                    onClick={() => void remove(record)}
                  >
                    <Trash2 className="size-4 text-danger" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="p-8 text-center text-sm text-text-muted">
              Zatím bez položek.
            </p>
          )}
        </article>
        <form
          onSubmit={submit}
          className="space-y-4 rounded-xl border border-border bg-surface p-5"
        >
          <h2 className="font-semibold">Přidat položku</h2>
          <label className="block text-sm font-medium">
            Kód
            <input name="code" required className={inputClass} />
          </label>
          <label className="block text-sm font-medium">
            Název
            <input name="name" required className={inputClass} />
          </label>
          {section === "rooms" ? (
            <>
              <label className="block text-sm font-medium">
                Kapacita
                <input name="capacity" type="number" className={inputClass} />
              </label>
              <label className="block text-sm font-medium">
                Typ učebny
                <select name="roomTypeId" className={inputClass}>
                  <option value="">Bez typu</option>
                  {roomTypes.map((item) => (
                    <option key={text(item, "id")} value={text(item, "id")}>
                      {text(item, "name")}
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : null}
          <Button type="submit" className="w-full" disabled={busy}>
            <Plus className="size-4" />
            {busy ? "Ukládám…" : "Přidat"}
          </Button>
        </form>
      </section>
    </div>
  );
}
