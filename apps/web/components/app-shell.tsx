import {
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  GraduationCap,
  LayoutDashboard,
  Settings,
  Upload,
  Users,
} from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

const navigation = [
  { label: "Přehled", icon: LayoutDashboard, active: true },
  { label: "Učitelé", icon: Users },
  { label: "Třídy a předměty", icon: GraduationCap },
  { label: "Výukové vazby", icon: BookOpen },
  { label: "Import", icon: Upload },
  { label: "Generátor", icon: ClipboardCheck },
  { label: "Rozvrh", icon: CalendarDays },
];

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      <aside className="border-b border-border bg-surface lg:min-h-screen lg:border-b-0 lg:border-r">
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
          <p className="truncate text-sm font-medium text-text-primary">FZŠ Chodovická</p>
          <p className="mt-0.5 text-xs text-text-muted">Školní rok 2026/2027</p>
        </div>

        <nav aria-label="Hlavní navigace" className="flex gap-1 overflow-x-auto p-3 lg:block">
          {navigation.map(({ label, icon: Icon, active }) => (
            <a
              key={label}
              href="#"
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
            </a>
          ))}
        </nav>

        <div className="hidden px-3 lg:absolute lg:bottom-4 lg:block lg:w-[248px]">
          <a
            href="#"
            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-text-secondary hover:bg-surface-subtle hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Settings aria-hidden="true" className="size-4" />
            Nastavení
          </a>
        </div>
      </aside>

      <div className="min-w-0">
        <div className="flex h-16 items-center justify-end border-b border-border bg-surface px-6">
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
