"use client";

import { Plus, RefreshCw, Trash2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { PageHeader } from "@/components/page-header";
import { localApiFetch } from "@/lib/local/api";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  availabilityKindLabels,
  entityTypeLabels,
  lessonShapeLabels,
  teachingGroupLabels,
} from "@/lib/ui-labels";

const sections = [
  { id: "teachers", label: "Učitelé" },
  { id: "classes", label: "Třídy" },
  { id: "subjects", label: "Předměty" },
  { id: "room-types", label: "Typy učeben" },
  { id: "rooms", label: "Učebny" },
  { id: "assignments", label: "Výukové vazby" },
  { id: "availability", label: "Dostupnost" },
] as const;

type SectionId = (typeof sections)[number]["id"];
type RecordValue = Record<string, unknown>;

interface SchoolYearResponse {
  version: number;
  label: string;
}

function textValue(record: RecordValue, key: string): string {
  const value = record[key];
  return typeof value === "string" ? value : "";
}

function recordTitle(section: SectionId, record: RecordValue): string {
  if (section === "teachers") {
    return `${textValue(record, "lastName")} ${textValue(record, "firstName")}`.trim();
  }
  if (section === "classes")
    return textValue(record, "name") || textValue(record, "code");
  if (
    section === "subjects" ||
    section === "rooms" ||
    section === "room-types"
  ) {
    return textValue(record, "name") || textValue(record, "code");
  }
  if (section === "assignments") return textValue(record, "assignmentCode");
  const entityType = textValue(record, "entityType");
  const kind = textValue(record, "kind");
  return `${entityTypeLabels[entityType] ?? entityType} · ${availabilityKindLabels[kind] ?? kind}`;
}

function recordMeta(section: SectionId, record: RecordValue): string {
  if (section === "teachers") {
    return `${textValue(record, "code")} · cílový úvazek ${String(record.targetWeeklyLoad ?? 0)} h`;
  }
  if (section === "classes")
    return `${textValue(record, "code")} · ${String(record.grade ?? "–")}. ročník`;
  if (
    section === "subjects" ||
    section === "rooms" ||
    section === "room-types"
  ) {
    return textValue(record, "code");
  }
  if (section === "assignments") {
    const teacher = record.teacher as RecordValue | undefined;
    const schoolClass = record.schoolClass as RecordValue | undefined;
    const subject = record.subject as RecordValue | undefined;
    return `${textValue(schoolClass ?? {}, "code")} · ${textValue(subject ?? {}, "code")} · ${textValue(teacher ?? {}, "code")} · ${String(record.weeklyPeriods ?? 0)} h`;
  }
  return `den ${Number(record.dayOfWeek ?? 0) + 1}, hodina ${Number(record.period ?? 0) + 1}`;
}

const inputClass =
  "h-10 w-full rounded-md border border-border-strong bg-surface px-3 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

export default function DataPage() {
  const searchParams = useSearchParams();
  const schoolYearId = searchParams.get("schoolYearId");
  const initialSection = searchParams.get("section");
  const [section, setSection] = useState<SectionId>(
    sections.some((item) => item.id === initialSection)
      ? (initialSection as SectionId)
      : "teachers",
  );
  const [records, setRecords] = useState<RecordValue[]>([]);
  const [dependencies, setDependencies] = useState<
    Record<string, RecordValue[]>
  >({});
  const [schoolYearVersion, setSchoolYearVersion] = useState<number | null>(
    null,
  );
  const [schoolYearLabel, setSchoolYearLabel] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!schoolYearId) return;
    setLoading(true);
    setError(null);
    try {
      const resourceNames = new Set([section]);
      if (section === "assignments") {
        ["teachers", "classes", "subjects", "rooms", "room-types"].forEach(
          (item) => resourceNames.add(item as SectionId),
        );
      }
      if (section === "availability") {
        ["teachers", "classes", "rooms"].forEach((item) =>
          resourceNames.add(item as SectionId),
        );
      }
      if (section === "subjects" || section === "rooms")
        resourceNames.add("room-types");

      const [yearResponse, ...resourceResponses] = await Promise.all([
        localApiFetch(`/api/school-years/${schoolYearId}`, {
          cache: "no-store",
        }),
        ...[...resourceNames].map((resource) =>
          localApiFetch(`/api/school-years/${schoolYearId}/${resource}`, {
            cache: "no-store",
          }),
        ),
      ]);
      if (
        !yearResponse.ok ||
        resourceResponses.some((response) => !response.ok)
      ) {
        throw new Error("Školní data se nepodařilo načíst.");
      }
      const year = (await yearResponse.json()) as SchoolYearResponse;
      setSchoolYearVersion(year.version);
      setSchoolYearLabel(year.label);
      const loadedDependencies: Record<string, RecordValue[]> = {};
      const names = [...resourceNames];
      for (let index = 0; index < resourceResponses.length; index += 1) {
        const payload = (await resourceResponses[index]!.json()) as {
          items: RecordValue[];
        };
        loadedDependencies[names[index]!] = payload.items;
      }
      setDependencies(loadedDependencies);
      setRecords(loadedDependencies[section] ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Načtení selhalo.");
    } finally {
      setLoading(false);
    }
  }, [schoolYearId, section]);

  useEffect(() => {
    void load();
  }, [load]);

  const entityOptions = useMemo(() => {
    if (section !== "availability") return [];
    return [
      ...(dependencies.teachers ?? []).map((item) => ({
        id: textValue(item, "id"),
        type: "TEACHER",
        label: `Učitel · ${textValue(item, "code")}`,
      })),
      ...(dependencies.classes ?? []).map((item) => ({
        id: textValue(item, "id"),
        type: "CLASS",
        label: `Třída · ${textValue(item, "code")}`,
      })),
      ...(dependencies.rooms ?? []).map((item) => ({
        id: textValue(item, "id"),
        type: "ROOM",
        label: `Učebna · ${textValue(item, "code")}`,
      })),
    ];
  }, [dependencies, section]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!schoolYearId || schoolYearVersion == null) return;
    setSubmitting(true);
    setError(null);
    setMessage(null);
    const form = new FormData(event.currentTarget);
    const value = (key: string) => String(form.get(key) ?? "").trim();
    const optionalNumber = (key: string) =>
      value(key) ? Number(value(key)) : null;
    let body: Record<string, unknown> = {
      expectedSchoolYearVersion: schoolYearVersion,
    };

    if (section === "teachers") {
      body = {
        ...body,
        code: value("code"),
        firstName: value("firstName"),
        lastName: value("lastName"),
        targetWeeklyLoad: Number(value("targetWeeklyLoad")),
        minWeeklyLoad: optionalNumber("minWeeklyLoad"),
        maxWeeklyLoad: optionalNumber("maxWeeklyLoad"),
      };
    } else if (section === "classes") {
      body = {
        ...body,
        code: value("code"),
        grade: Number(value("grade")),
        name: value("name"),
      };
    } else if (section === "subjects") {
      body = {
        ...body,
        code: value("code"),
        name: value("name"),
        defaultRoomTypeId: value("defaultRoomTypeId") || null,
      };
    } else if (section === "room-types") {
      body = { ...body, code: value("code"), name: value("name") };
    } else if (section === "rooms") {
      body = {
        ...body,
        code: value("code"),
        name: value("name"),
        capacity: optionalNumber("capacity"),
        roomTypeId: value("roomTypeId") || null,
      };
    } else if (section === "assignments") {
      body = {
        ...body,
        assignmentCode: value("assignmentCode"),
        classId: value("classId"),
        subjectId: value("subjectId"),
        teacherId: value("teacherId"),
        group: value("group"),
        weeklyPeriods: Number(value("weeklyPeriods")),
        lessonShape: value("lessonShape"),
        doublePeriodsCount: Number(value("doublePeriodsCount") || 0),
        requiredRoomId: value("requiredRoomId") || null,
        maxPerDay: optionalNumber("maxPerDay"),
        minDayGap: optionalNumber("minDayGap"),
      };
    } else {
      const selected = entityOptions.find(
        (item) => item.id === value("entityId"),
      );
      body = {
        ...body,
        entityType: selected?.type,
        entityId: value("entityId"),
        dayOfWeek: Number(value("dayOfWeek")),
        period: Number(value("period")),
        kind: value("kind"),
        weight: optionalNumber("weight"),
        reason: value("reason") || null,
      };
    }

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
        schoolYearVersion?: number;
        error?: { message?: string; fieldErrors?: Record<string, string[]> };
      };
      if (!response.ok) {
        const fields = payload.error?.fieldErrors
          ? Object.values(payload.error.fieldErrors).flat().join(" ")
          : "";
        throw new Error(
          [payload.error?.message, fields].filter(Boolean).join(" "),
        );
      }
      setSchoolYearVersion(payload.schoolYearVersion ?? schoolYearVersion + 1);
      setMessage("Položka byla uložena.");
      event.currentTarget.reset();
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Uložení selhalo.");
    } finally {
      setSubmitting(false);
    }
  }

  async function remove(record: RecordValue) {
    if (!schoolYearId || schoolYearVersion == null) return;
    const id = textValue(record, "id");
    if (
      !id ||
      !window.confirm(`Opravdu odstranit „${recordTitle(section, record)}“?`)
    )
      return;
    setError(null);
    const response = await localApiFetch(
      `/api/school-years/${schoolYearId}/${section}/${id}`,
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedSchoolYearVersion: schoolYearVersion }),
      },
    );
    const payload = (await response.json()) as {
      schoolYearVersion?: number;
      error?: { message?: string };
    };
    if (!response.ok) {
      setError(payload.error?.message ?? "Odstranění selhalo.");
      return;
    }
    setSchoolYearVersion(payload.schoolYearVersion ?? schoolYearVersion + 1);
    setMessage("Položka byla odstraněna.");
    await load();
  }

  if (!schoolYearId) {
    return (
      <div className="rounded-xl border border-warning-border bg-warning-subtle p-6">
        <h1 className="text-lg font-semibold">Nejprve vyberte školní rok</h1>
        <p className="mt-2 text-sm text-text-secondary">
          Vraťte se na Přehled a vyberte školní rok.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Fáze 3"
        title="Školní data"
        description="Ruční správa stabilních číselníků a vazeb. Stejná data používá načtení z Excelu, kontrola připravenosti i automatická tvorba rozvrhu."
        actions={
          <Button
            variant="outline"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw className="size-4" aria-hidden="true" />
            Obnovit
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        {sections.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setSection(item.id)}
            className={
              section === item.id
                ? "rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
                : "rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium text-text-secondary hover:bg-surface-subtle"
            }
          >
            {item.label}
          </button>
        ))}
        <StatusBadge tone="neutral">
          {schoolYearLabel} · verze {schoolYearVersion ?? "–"}
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
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div>
              <h2 className="font-semibold text-text-primary">
                {sections.find((item) => item.id === section)?.label}
              </h2>
              <p className="mt-1 text-xs text-text-muted">
                {records.length} záznamů
              </p>
            </div>
            {loading ? <StatusBadge tone="neutral">Načítám</StatusBadge> : null}
          </div>
          {records.length ? (
            <div className="divide-y divide-border">
              {records.map((record) => (
                <div
                  key={textValue(record, "id")}
                  className="flex items-center justify-between gap-4 px-5 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-text-primary">
                      {recordTitle(section, record)}
                    </p>
                    <p className="truncate text-xs text-text-muted">
                      {recordMeta(section, record)}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Odstranit"
                    onClick={() => void remove(record)}
                  >
                    <Trash2 className="size-4 text-danger" aria-hidden="true" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-sm text-text-muted">
              Tato oblast je zatím prázdná.
            </div>
          )}
        </article>

        <form
          onSubmit={submit}
          className="space-y-4 rounded-xl border border-border bg-surface p-5"
        >
          <div>
            <h2 className="font-semibold text-text-primary">Přidat položku</h2>
            <p className="mt-1 text-xs text-text-muted">
              Technický kód zůstává stabilním identifikátorem.
            </p>
          </div>
          <SectionForm
            section={section}
            dependencies={dependencies}
            entityOptions={entityOptions}
          />
          <Button
            type="submit"
            className="w-full"
            disabled={submitting || schoolYearVersion == null}
          >
            <Plus className="size-4" aria-hidden="true" />
            {submitting ? "Ukládám…" : "Přidat"}
          </Button>
        </form>
      </section>
    </div>
  );
}

function SectionForm({
  section,
  dependencies,
  entityOptions,
}: {
  section: SectionId;
  dependencies: Record<string, RecordValue[]>;
  entityOptions: Array<{ id: string; type: string; label: string }>;
}) {
  const field = (
    name: string,
    label: string,
    type = "text",
    required = true,
  ) => (
    <label className="block text-sm font-medium text-text-primary">
      {label}
      <input
        name={name}
        type={type}
        required={required}
        className={`${inputClass} mt-1.5`}
      />
    </label>
  );
  const select = (
    name: string,
    label: string,
    options: Array<{ value: string; label: string }>,
    required = true,
  ) => (
    <label className="block text-sm font-medium text-text-primary">
      {label}
      <select
        name={name}
        required={required}
        className={`${inputClass} mt-1.5`}
      >
        <option value="">Vyberte</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );

  if (section === "teachers") {
    return (
      <>
        {field("code", "Kód")}
        {field("firstName", "Jméno")}
        {field("lastName", "Příjmení")}
        {field("targetWeeklyLoad", "Cílový úvazek", "number")}
        {field("minWeeklyLoad", "Nejnižší úvazek", "number", false)}
        {field("maxWeeklyLoad", "Nejvyšší úvazek", "number", false)}
      </>
    );
  }
  if (section === "classes") {
    return (
      <>
        {field("code", "Kód")}
        {field("grade", "Ročník", "number")}
        {field("name", "Název")}
      </>
    );
  }
  if (section === "subjects") {
    return (
      <>
        {field("code", "Kód")}
        {field("name", "Název")}
        {select(
          "defaultRoomTypeId",
          "Výchozí typ učebny",
          (dependencies["room-types"] ?? []).map((item) => ({
            value: textValue(item, "id"),
            label: textValue(item, "name"),
          })),
          false,
        )}
      </>
    );
  }
  if (section === "room-types") {
    return (
      <>
        {field("code", "Kód")}
        {field("name", "Název")}
      </>
    );
  }
  if (section === "rooms") {
    return (
      <>
        {field("code", "Kód")}
        {field("name", "Název")}
        {field("capacity", "Kapacita", "number", false)}
        {select(
          "roomTypeId",
          "Typ učebny",
          (dependencies["room-types"] ?? []).map((item) => ({
            value: textValue(item, "id"),
            label: textValue(item, "name"),
          })),
          false,
        )}
      </>
    );
  }
  if (section === "assignments") {
    return (
      <>
        {field("assignmentCode", "Kód vazby")}
        {select(
          "classId",
          "Třída",
          (dependencies.classes ?? []).map((item) => ({
            value: textValue(item, "id"),
            label: textValue(item, "code"),
          })),
        )}
        {select(
          "subjectId",
          "Předmět",
          (dependencies.subjects ?? []).map((item) => ({
            value: textValue(item, "id"),
            label: textValue(item, "code"),
          })),
        )}
        {select(
          "teacherId",
          "Učitel",
          (dependencies.teachers ?? []).map((item) => ({
            value: textValue(item, "id"),
            label: `${textValue(item, "code")} · ${textValue(item, "lastName")}`,
          })),
        )}
        {select(
          "group",
          "Skupina",
          ["WHOLE", "GROUP_1", "GROUP_2"].map((value) => ({
            value,
            label: teachingGroupLabels[value] ?? value,
          })),
        )}
        {field("weeklyPeriods", "Hodin týdně", "number")}
        {select(
          "lessonShape",
          "Tvar bloků",
          ["SINGLE", "DOUBLE", "MIXED"].map((value) => ({
            value,
            label: lessonShapeLabels[value] ?? value,
          })),
        )}
        {field("doublePeriodsCount", "Počet dvojhodin", "number")}
        {select(
          "requiredRoomId",
          "Povinná učebna",
          (dependencies.rooms ?? []).map((item) => ({
            value: textValue(item, "id"),
            label: textValue(item, "code"),
          })),
          false,
        )}
        {field("maxPerDay", "Nejvýše za den", "number", false)}
        {field("minDayGap", "Minimální rozestup dnů", "number", false)}
      </>
    );
  }
  return (
    <>
      {select(
        "entityId",
        "Položka",
        entityOptions.map((item) => ({ value: item.id, label: item.label })),
      )}
      {select(
        "dayOfWeek",
        "Den",
        ["Po", "Út", "St", "Čt", "Pá"].map((label, index) => ({
          value: String(index),
          label,
        })),
      )}
      {field("period", "Pořadí hodiny (0 = první)", "number")}
      {select(
        "kind",
        "Pravidlo",
        ["UNAVAILABLE", "PREFERRED", "DISCOURAGED"].map((value) => ({
          value,
          label: availabilityKindLabels[value] ?? value,
        })),
      )}
      {field("weight", "Váha", "number", false)}
      {field("reason", "Důvod", "text", false)}
    </>
  );
}
