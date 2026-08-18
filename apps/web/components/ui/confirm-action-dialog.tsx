"use client";

import { AlertTriangle, X } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import { createRoot } from "react-dom/client";

import { Button } from "@/components/ui/button";

export type ConfirmActionTone = "default" | "danger";

export interface ConfirmActionOptions {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmActionTone;
}

interface ConfirmActionDialogProps extends Required<ConfirmActionOptions> {
  message: string;
  onResolve: (confirmed: boolean) => void;
}

function ConfirmActionDialog({
  title,
  message,
  confirmLabel,
  cancelLabel,
  tone,
  onResolve,
}: ConfirmActionDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previousActiveElement = document.activeElement as HTMLElement | null;
    panelRef.current
      ?.querySelector<HTMLElement>("[data-dialog-cancel]")
      ?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onResolve(false);
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previousActiveElement?.focus();
    };
  }, [onResolve]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4 backdrop-blur-[1px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onResolve(false);
      }}
    >
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="w-full max-w-md rounded-xl border border-border bg-surface p-5 shadow-2xl"
      >
        <div className="flex items-start gap-3">
          <div
            className={
              tone === "danger"
                ? "flex size-10 shrink-0 items-center justify-center rounded-full border border-danger-border bg-danger-subtle text-danger-strong"
                : "flex size-10 shrink-0 items-center justify-center rounded-full border border-warning-border bg-warning-subtle text-warning-strong"
            }
          >
            <AlertTriangle className="size-5" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-4">
              <h2 id={titleId} className="text-base font-semibold text-text-primary">
                {title}
              </h2>
              <button
                type="button"
                aria-label="Zavřít dialog"
                onClick={() => onResolve(false)}
                className="-mr-1 -mt-1 flex size-8 shrink-0 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-subtle hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>
            <p
              id={descriptionId}
              className="mt-2 text-sm leading-6 text-text-secondary"
            >
              {message}
            </p>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Button
            data-dialog-cancel
            type="button"
            variant="outline"
            onClick={() => onResolve(false)}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={tone === "danger" ? "destructive" : "primary"}
            onClick={() => onResolve(true)}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function confirmAction(
  message: string,
  options: ConfirmActionOptions = {},
): Promise<boolean> {
  if (typeof document === "undefined") return Promise.resolve(false);

  const resolvedOptions: Required<ConfirmActionOptions> = {
    title: options.title ?? "Potvrdit akci",
    confirmLabel: options.confirmLabel ?? "Pokračovat",
    cancelLabel: options.cancelLabel ?? "Zrušit",
    tone: options.tone ?? "default",
  };

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (confirmed: boolean) => {
      if (settled) return;
      settled = true;
      root.unmount();
      container.remove();
      resolve(confirmed);
    };

    root.render(
      <ConfirmActionDialog
        {...resolvedOptions}
        message={message}
        onResolve={finish}
      />,
    );
  });
}
