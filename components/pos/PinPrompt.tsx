"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { PinPad } from "@/components/staff/PinPad";
import { cn } from "@/lib/utils";
import type { CancelStaff } from "./CancelItemDialog";

/**
 * PinPrompt (04-03) — cổng PIN manager/cashier cho thao tác nhạy cảm trên bill (giảm giá). Tái
 * dùng PinPad + pattern chọn người duyệt như CancelItemDialog. Owner/manager đăng nhập email:
 * canSkip=true → chỉ xác nhận. Center modal (đè trên dialog điều chỉnh).
 */
export function PinPrompt({
  title,
  staff,
  canSkip,
  busy,
  error,
  onSubmit,
  onCancel,
}: {
  title: string;
  staff: CancelStaff[];
  canSkip: boolean;
  busy: boolean;
  error: string | null;
  onSubmit: (creds: { membershipId?: string; pin?: string }) => void;
  onCancel: () => void;
}) {
  const [staffId, setStaffId] = useState("");
  const [pin, setPin] = useState("");

  const canConfirm = canSkip || (staffId !== "" && pin.length === 4);

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-ink/50 p-md" role="dialog" aria-modal="true" aria-label={title}>
      <div className="flex max-h-[90vh] w-full max-w-sm flex-col overflow-hidden rounded-xl bg-canvas shadow-modal">
        <div className="border-b border-hairline-soft px-lg py-md">
          <h3 className="font-display text-lg text-ink">{title}</h3>
          {!canSkip && (
            <p className="mt-xxs text-xs text-steel">Chọn quản lý/thu ngân và nhập PIN.</p>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-lg py-md">
          {error && (
            <p role="alert" className="mb-md rounded-md bg-cream-soft px-md py-sm text-sm text-status-late">
              {error}
            </p>
          )}

          {canSkip ? (
            <p className="py-sm text-sm text-steel">Bạn có quyền áp trực tiếp (không cần PIN).</p>
          ) : (
            <>
              <div className="flex flex-col gap-xs">
                {staff.length === 0 && (
                  <p className="text-sm text-steel">Chưa có nhân viên manager/cashier. Thêm ở /admin/staff.</p>
                )}
                {staff.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      setStaffId(s.id);
                      setPin("");
                    }}
                    aria-pressed={staffId === s.id}
                    className={cn(
                      "flex min-h-[44px] items-center justify-between rounded-md border px-md text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                      staffId === s.id ? "border-primary bg-cream" : "border-hairline hover:bg-surface"
                    )}
                  >
                    <span className="text-ink">{s.name}</span>
                    <span className="text-xs text-steel">{s.role === "manager" ? "Quản lý" : "Thu ngân"}</span>
                  </button>
                ))}
              </div>
              {staffId && (
                <div className="mt-lg">
                  <PinPad
                    value={pin}
                    onDigit={(d) => setPin((p) => (p.length < 4 ? p + d : p))}
                    onBackspace={() => setPin((p) => p.slice(0, -1))}
                    onClear={() => setPin("")}
                  />
                </div>
              )}
            </>
          )}
        </div>

        <div className="shrink-0 border-t border-hairline-soft px-lg py-md">
          <div className="flex gap-sm">
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex h-12 items-center justify-center rounded-md border border-hairline-strong px-lg text-sm font-medium text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              Hủy
            </button>
            <button
              type="button"
              disabled={!canConfirm || busy}
              onClick={() => onSubmit(canSkip ? {} : { membershipId: staffId, pin })}
              className="inline-flex h-12 flex-1 items-center justify-center rounded-md bg-primary text-base font-medium text-primary-fg hover:bg-primary-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:bg-hairline disabled:text-muted"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Xác nhận"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
