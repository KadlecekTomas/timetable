import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

const statusBadgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
  {
    variants: {
      tone: {
        neutral: "border-border bg-surface-subtle text-text-secondary",
        success: "border-success-border bg-success-subtle text-success-strong",
        warning: "border-warning-border bg-warning-subtle text-warning-strong",
        danger: "border-danger-border bg-danger-subtle text-danger-strong",
        info: "border-info-border bg-info-subtle text-info-strong",
      },
    },
    defaultVariants: {
      tone: "neutral",
    },
  },
);

type StatusBadgeProps = HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof statusBadgeVariants> & {
    dot?: boolean;
  };

export function StatusBadge({ className, tone, dot = true, children, ...props }: StatusBadgeProps) {
  return (
    <span className={cn(statusBadgeVariants({ tone }), className)} {...props}>
      {dot ? <span aria-hidden="true" className="size-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}
