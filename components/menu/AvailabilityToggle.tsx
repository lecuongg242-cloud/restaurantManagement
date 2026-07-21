"use client";

import { useOptimistic, useTransition } from "react";
import { setItemAvailable } from "@/app/r/[slug]/admin/(protected)/menu/actions";

/**
 * Switch bật/tắt "hết món" — optimistic: đổi ngay trên UI rồi gọi server action.
 * Nếu server lỗi, revert. is_available=false ⇒ "Hết".
 */
export function AvailabilityToggle({
  slug,
  itemId,
  available,
}: {
  slug: string;
  itemId: string;
  available: boolean;
}) {
  const [optimistic, setOptimistic] = useOptimistic(available);
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = !optimistic;
    startTransition(async () => {
      setOptimistic(next);
      try {
        await setItemAvailable(slug, itemId, next);
      } catch {
        setOptimistic(!next);
      }
    });
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={optimistic}
      aria-label={optimistic ? "Còn món (bấm để báo hết)" : "Hết món (bấm để bật lại)"}
      onClick={toggle}
      disabled={pending}
      className="inline-flex min-h-9 items-center gap-xs rounded-md px-xs text-xs font-medium hover:bg-surface disabled:opacity-60"
    >
      <span
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
          optimistic ? "bg-status-ready" : "bg-hairline-strong"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-canvas transition-transform ${
            optimistic ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </span>
      <span className={optimistic ? "text-status-ready" : "text-status-late"}>
        {optimistic ? "Còn" : "Hết"}
      </span>
    </button>
  );
}
