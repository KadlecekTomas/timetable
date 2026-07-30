import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  description?: string;
  eyebrow?: string;
  actions?: ReactNode;
}

export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
}: PageHeaderProps) {
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
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      ) : null}
    </header>
  );
}
