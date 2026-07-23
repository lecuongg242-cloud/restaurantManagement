"use client";

import { useState } from "react";
import { Drawer } from "vaul";
import { Bell, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * CallStaffSheet (CALL-01) — khách gọi nhân viên kèm yêu cầu (không bắt buộc). Chip gợi ý nhanh
 * điền sẵn nội dung hay gặp; ô text cho yêu cầu khác. Gửi → POST /api/call { qrToken, note }.
 */
const QUICK = ["Thêm bát/đũa", "Khăn giấy", "Cần hỗ trợ"];

export function CallStaffSheet({
  slug,
  qrToken,
  open,
  onOpenChange,
}: {
  slug: string;
  qrToken: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [note, setNote] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");

  const send = async () => {
    if (state !== "idle") return;
    setState("sending");
    try {
      const res = await fetch(`/r/${slug}/api/call`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qrToken, note: note.trim() }),
      });
      if (res.ok) {
        setState("done");
        setTimeout(() => {
          onOpenChange(false);
          setState("idle");
          setNote("");
        }, 1600);
      } else {
        setState("idle");
      }
    } catch {
      setState("idle");
    }
  };

  return (
    <Drawer.Root open={open} onOpenChange={(v) => state !== "sending" && onOpenChange(v)}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-ink/40" />
        <Drawer.Content className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[85vh] max-w-md flex-col rounded-t-xl bg-canvas shadow-modal outline-none">
          <div className="mx-auto mt-sm h-1.5 w-10 shrink-0 rounded-full bg-hairline-strong" />
          <Drawer.Title className="shrink-0 px-lg pt-sm font-display text-xl text-ink">
            Gọi nhân viên
          </Drawer.Title>

          <div className="min-h-0 flex-1 overflow-y-auto px-lg py-md">
            {state === "done" ? (
              <div className="flex flex-col items-center gap-sm py-xl text-center">
                <span className="grid h-14 w-14 place-items-center rounded-full bg-status-ready-bg text-status-ready">
                  <Check className="h-7 w-7" />
                </span>
                <p className="text-base font-medium text-ink">Đã gửi yêu cầu</p>
                <p className="text-sm text-steel">Nhân viên sẽ tới bàn ngay.</p>
              </div>
            ) : (
              <>
                <p className="text-sm text-steel">Chọn nhanh hoặc ghi yêu cầu (không bắt buộc).</p>
                <div className="mt-sm flex flex-wrap gap-xs">
                  {QUICK.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => setNote((prev) => (prev === q ? "" : q))}
                      aria-pressed={note === q}
                      className={cn(
                        "inline-flex min-h-[40px] items-center rounded-full border px-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                        note === q
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-hairline-strong bg-canvas text-ink hover:bg-surface"
                      )}
                    >
                      {q}
                    </button>
                  ))}
                </div>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={160}
                  rows={2}
                  placeholder="Yêu cầu khác…"
                  className="mt-md w-full resize-none rounded-md border border-hairline px-md py-sm text-base text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 sm:text-sm"
                />
              </>
            )}
          </div>

          {state !== "done" && (
            <div className="shrink-0 border-t border-hairline-soft bg-canvas px-lg py-md pb-[max(12px,env(safe-area-inset-bottom))]">
              <button
                type="button"
                onClick={send}
                disabled={state === "sending"}
                className="flex h-12 w-full items-center justify-center gap-sm rounded-md bg-primary text-base font-medium text-primary-fg transition-colors hover:bg-primary-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-70"
              >
                {state === "sending" ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Bell className="h-5 w-5" />
                )}
                {state === "sending" ? "Đang gửi…" : "Gửi yêu cầu"}
              </button>
            </div>
          )}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
