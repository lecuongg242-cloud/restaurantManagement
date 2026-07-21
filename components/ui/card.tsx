import * as React from "react";
import { cn } from "@/lib/utils";

/** Card map lên card-base/card-feature/card-cream (Mistral). Radius lg (12px). */

const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { variant?: "base" | "feature" | "cream" }
>(({ className, variant = "base", ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "rounded-lg",
      variant === "base" && "border border-hairline-soft bg-canvas p-xl",
      variant === "feature" &&
        "border border-hairline-soft bg-canvas p-xxl shadow-card",
      variant === "cream" && "border border-beige-deep bg-cream p-xxl text-ink",
      className
    )}
    {...props}
  />
));
Card.displayName = "Card";

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("flex flex-col gap-xxs", className)} {...props} />
));
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn("text-lg font-medium leading-tight text-ink", className)}
    {...props}
  />
));
CardTitle.displayName = "CardTitle";

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("mt-sm text-sm text-slate", className)} {...props} />
));
CardContent.displayName = "CardContent";

export { Card, CardHeader, CardTitle, CardContent };
