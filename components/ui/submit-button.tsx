"use client";

import { useFormStatus } from "react-dom";
import { Button, type ButtonProps } from "@/components/ui/button";

/**
 * Nút submit có trạng thái chờ (useFormStatus) — phản hồi "Submit Feedback" (UX High):
 * khi form đang gửi → disabled + nhãn chờ, tránh double-submit và "bấm không thấy gì".
 * Dùng bên trong <form action={serverAction}>.
 */
export function SubmitButton({
  children,
  pendingLabel = "Đang xử lý…",
  ...props
}: ButtonProps & { pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} aria-busy={pending} {...props}>
      {pending ? (
        <span className="inline-flex items-center gap-xs">
          <Spinner />
          {pendingLabel}
        </span>
      ) : (
        children
      )}
    </Button>
  );
}

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin motion-reduce:animate-none"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-90"
        fill="currentColor"
        d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z"
      />
    </svg>
  );
}
