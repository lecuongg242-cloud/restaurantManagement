import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/** Badge map lên badge-orange/-cream/-dark + màu status (QD-006 F5). Pill (radius full). */
const badgeVariants = cva(
  "inline-flex items-center rounded-full px-[10px] py-[3px] text-xs font-semibold",
  {
    variants: {
      variant: {
        orange: "bg-primary text-primary-fg",
        cream: "bg-cream-deeper text-ink",
        dark: "bg-ink text-on-dark",
        new: "bg-status-new text-status-new-fg",
        active: "bg-status-active text-status-active-fg",
        ready: "bg-status-ready-bg text-status-ready",
        late: "bg-status-late text-status-late-fg",
        done: "bg-surface text-status-done",
      },
    },
    defaultVariants: { variant: "orange" },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
