"use client";

import { Download } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { type ReactNode, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  createTimetableExportWorkbook,
  timetableExportFileName,
  type TimetableExportPayload,
} from "@/lib/export/timetable-workbook";
import { getLocalProject, localApiFetch } from "@/lib/local/api";

interface PageHeaderProps {
  title: string;
  description?: string;
  eyebrow?: string;
  actions?: ReactNode;
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
}: PageHeaderProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const versionId = searchParams.get("versionId");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const showTimetableExport = pathname === "/timetable" && Boolean(versionId);

  async function downloadTimetable() {
    if (!versionId) return;
    setExporting(true);
    setExportError(null);
    try {
      const [project, classResponse, teacherResponse] = await Promise.all([
        getLocalProject(),
        localApiFetch(
          `/api/timetable-versions/${encodeURIComponent(versionId)}?view=class`,
          { cache: "no-store" },
        ),
        localApiFetch(
          `/api/timetable-versions/${encodeURIComponent(versionId)}?view=teacher`,
          { cache: "no-store" },
        ),
      ]);
      const classPayload = (await classResponse.json()) as TimetableExportPayload & {
        error?: { message?: string };
      };
      const teacherPayload = (await teacherResponse.json()) as TimetableExportPayload & {
        error?: { message?: string };
      };
      if (!classResponse.ok) {
        throw new Error(
          classPayload.error?.message ?? "Třídní rozvrhy nelze načíst.",
        );
      }
      if (!teacherResponse.ok) {
        throw new Error(
          teacherPayload.error?.message ?? "Učitelské rozvrhy nelze načíst.",
        );
      }

      const bytes = await createTimetableExportWorkbook({
        schoolName: project.schoolName,
        schoolYear: project.label,
        classTimetable: classPayload,
        teacherTimetable: teacherPayload,
      });
      const exportBytes = new Uint8Array(bytes.byteLength);
      exportBytes.set(bytes);
      downloadBlob(
        new Blob([exportBytes.buffer], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
        timetableExportFileName({
          schoolName: project.schoolName,
          schoolYear: project.label,
          versionName: classPayload.version.name,
          revision: classPayload.version.revision,
        }),
      );
    } catch (cause) {
      setExportError(
        cause instanceof Error
          ? cause.message
          : "Export rozvrhu se nepodařilo vytvořit.",
      );
    } finally {
      setExporting(false);
    }
  }

  return (
    <header className="flex flex-col gap-4 border-b border-border pb-6 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0 space-y-1.5">
        {eyebrow ? (
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
          {title}
        </h1>
        {description ? (
          <p className="max-w-3xl text-sm text-text-secondary">{description}</p>
        ) : null}
        {exportError ? (
          <p className="max-w-3xl text-sm text-danger-strong">{exportError}</p>
        ) : null}
      </div>
      {actions || showTimetableExport ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {showTimetableExport ? (
            <Button
              variant="outline"
              onClick={() => void downloadTimetable()}
              disabled={exporting}
            >
              <Download className="size-4" aria-hidden="true" />
              {exporting ? "Připravuji Excel…" : "Exportovat rozvrh do Excelu"}
            </Button>
          ) : null}
          {actions}
        </div>
      ) : null}
    </header>
  );
}
