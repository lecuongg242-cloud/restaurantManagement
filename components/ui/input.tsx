import * as React from "react";
import { cn } from "@/lib/utils";

/** Input map lên text-input (Mistral): height 44px, radius md, focus viền primary 2px. */
const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        // text-base (16px) trên mobile để iOS Safari KHÔNG tự zoom khi focus; text-sm ở ≥640px.
        "h-11 w-full rounded-md border border-hairline-strong bg-canvas px-md py-sm text-base text-ink sm:text-sm",
        "placeholder:text-muted",
        "focus-visible:border-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";

export { Input };
