import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Button map lên token Mistral (docs/DESIGN-mistral.ai.md — nhóm button-*).
 * Radius md (8px), KHÔNG pill (giữ chất editorial). Touch target ≥44px với size lg.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-xs whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:pointer-events-none disabled:bg-hairline disabled:text-muted",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-fg hover:bg-primary-deep active:bg-primary-deep",
        dark: "bg-ink text-on-dark hover:opacity-90",
        secondary: "border border-hairline-strong bg-transparent text-ink hover:bg-surface",
        cream: "border border-beige-deep bg-cream text-ink hover:bg-cream-deeper",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        md: "h-11 px-lg py-[10px]", // 44px — touch target AA
        sm: "h-9 px-md",
        lg: "h-12 px-xl text-base", // POS/KDS: nút to
        link: "h-auto p-0",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
