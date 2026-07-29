"use client";

import {
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  Database,
  LayoutDashboard,
  Settings,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

const navigation = [
  { label: "Přehled", icon: LayoutDashboard, href: "/" },
  { label: "Školní data", icon: Database, href: "/data" },
  { label: "Výukové vazby", icon: BookOpen, href: "/data?section=assignments" },
  { label: "Import", icon: Upload, href: "/import" },
  { label: "Generátor", icon: ClipboardCheck, href: "/generate" },
  { label: "Rozvrh", icon: CalendarDays, href: "/timetable" },
];

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const schoolYearId = searchParams.get("schoolYearId");
  const appendContext = (href: string) => {
    if (!schoolYearId) return href;
    const separator = href.includes("?") ? "&" : "?";
    return `${href}${separator}schoolYearId=${encodeURIComponent(schoolYearId)}`;
  };

  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      <aside className="border-b border-border bg-surface lg:sticky lg:top-0 lg:min-h-screen lg:self-start lg:border-b-0 lg:border-r">
        <div className="flex h-16 items-center border-b border-border px-5">
          <div className="flex size-8 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
            T
          </div>
          <div className="ml-3 min-w-0">
            <p className="truncate text-sm font-semibold text-text-primary">Timetable</p>
            <p className="truncate text-xs text-text-muted">Školní rozvrhy</p>
          </div>
        </div>

        <div className="border-b border-border px-5 py-4">
          <p className="truncate text-sm font-medium text-text-primary">
            {schoolYearId ? "Vybraný školní rok" : "Ukázkový pracovní prostor"}
          </p>
          <p className="mt-0.5 truncate text-xs text-text-muted">
            {schoolYearId ?? "Připojte školní rok přes Přehled"}
          </p>
        </div>

        <nav aria-label="Hlavní navigace" className="flex gap-1 overflow-x-auto p-3 lg:block">
          {navigation.map(({ label, icon: Icon, href }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href.split("?")[0]!);
            return (
              <Link
                key={label}
                href={appendContext(href)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex shrink-0 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  active
                    ? "bg-primary-subtle text-primary"
                    : "text-text-secondary hover:bg-surface-subtle hover:text-text-primary",
                )}
              >
                <Icon aria-hidden="true" className="size-4" />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden px-3 lg:absolute lg:bottom-4 lg:block lg:w-[248px]">
          <Link
            href={appendContext("/settings")}
            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-text-secondary hover:bg-surface-subtle hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Settings aria-hidden="true" className="size-4" />
            Nastavení
          </Link>
        </div>
      </aside>

      <div className="min-w-0">
        <div className="flex h-16 items-center justify-between border-b border-border bg-surface px-6">
          <p className="text-sm text-text-muted">MVP pracovní prostředí</p>
          <button
            type="button"
            className="rounded-md px-3 py-2 text-sm font-medium text-text-secondary hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Tomáš Kadleček
          </button>
        </div>
        <main className="mx-auto w-full max-w-[1440px] p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
