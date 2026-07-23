"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Drawer } from "vaul";
import { Loader2 } from "lucide-react";
import { PinPad } from "@/components/staff/PinPad";
import { cancelOrderItem, cancelOrder } from "@/app/r/[slug]/pos/actions";
import { cn } from "@/lib/utils";

export type CancelStaff = { id: string; name: string; role: "manager" | "cashier" };

/**
 * CancelItemDialog (§D bước 5, ORDER-05) — hủy món có kiểm soát. Owner/manager: chỉ nhập lý do.
 * Nhân viên khác: chọn người duyệt (manager/cashier) + PIN (so bcrypt SERVER) + lý do bắt buộc.
 * "Sửa món" = hủy dòng này + Thêm món mới (quyết định P3 #3) — nhắc trong dialog.
 */
export function CancelItemDialog({
  slug,
  item,
  variant = "item",
  open,
  onOpenChange,
  cancelStaff,
  canCancelWithoutPin,
  onDone,
}: {
  slug: string;
  item: { id: string; name: string } | null;
  /** "item" = hủy một món (mặc định); "order" = hủy cả đơn (mọi món chưa phục vụ). */
  variant?: "item" | "order";
  open: boolean;
  onOpenChange: (v: boolean) => void;
  cancelStaff: CancelStaff[];
  canCancelWithoutPin: boolean;
  onDone: () => void;
}) {
  const router = useRouter();
  const [staffId, setStaffId] = useState<string>("");
  const [pin, setPin] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setStaffId("");
    setPin("");
    setReason("");
    setError(null);
    setSubmitting(false);
  };

  const close = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const needsPin = !canCancelWithoutPin;
  const canSubmit =
    !!reason.trim() && (!needsPin || (staffId !== "" && pin.length === 4)) && !submitting;

  const submit = async () => {
    if (!item || !canSubmit) return;
    setSubmitting(true);
    setError(null);
    const creds = {
      membershipId: needsPin ? staffId : undefined,
      pin: needsPin ? pin : undefined,
      reason,
    };
    const res =
      variant === "order"
        ? await cancelOrder(slug, { orderId: item.id, ...creds })
        : await cancelOrderItem(slug, { itemId: item.id, ...creds });
    setSubmitting(false);
    if (!res.ok) {
      setError(res.error);
      setPin("");
      return;
    }
    reset();
    onOpenChange(false);
    onDone();
    router.refresh();
  };

  if (!item) return null;

  return (
    <Drawer.Root open={open} onOpenChange={close}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-[60] bg-ink/40" />
        <Drawer.Content className="fixed inset-x-0 bottom-0 z-[61] mx-auto flex max-h-[92vh] max-w-md flex-col rounded-t-xl bg-canvas shadow-modal outline-none">
          <div className="mx-auto mt-sm h-1.5 w-10 shrink-0 rounded-full bg-hairline-strong" />
          <div className="min-h-0 flex-1 overflow-y-auto px-lg py-sm">
            <Drawer.Title className="font-display text-xl text-status-late">
              {variant === "order" ? `Hủy cả đơn ${item.name}` : `Hủy món: ${item.name}`}
            </Drawer.Title>
            <Drawer.Description className="mt-xxs text-xs text-steel">
              {variant === "order"
                ? "Hủy toàn bộ món chưa phục vụ trong đơn này."
                : "Cần sửa món? Hủy dòng này rồi “Thêm món” mới."}
            </Drawer.Description>

            {error && (
              <p role="alert" className="mt-md rounded-md bg-cream-soft px-md py-sm text-sm text-status-late">
                {error}
              </p>
            )}

            {needsPin && (
              <>
                <fieldset className="mt-lg">
                  <legend className="text-sm font-medium text-ink">Người duyệt hủy</legend>
                  <p className="mt-xxs text-xs text-steel">
                    Chọn quản lý/thu ngân và nhập PIN. (Đăng nhập owner/manager sẽ bỏ qua bước PIN.)
                  </p>
                  <div className="mt-sm flex flex-col gap-xs">
                    {cancelStaff.length === 0 && (
                      <p className="text-sm text-steel">
                        Chưa có nhân viên manager/cashier. Thêm ở /admin/staff.
                      </p>
                    )}
                    {cancelStaff.map((s) => (
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
                        <span className="text-xs text-steel">
                          {s.role === "manager" ? "Quản lý" : "Thu ngân"}
                        </span>
                      </button>
                    ))}
                  </div>
                </fieldset>

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

            <div className="mt-lg">
              <label htmlFor="cancel-reason" className="text-sm font-medium text-ink">
                Lý do hủy <span className="text-status-late">*</span>
              </label>
              <input
                id="cancel-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={300}
                placeholder="Khách đổi ý / gọi nhầm…"
                className="mt-xs h-11 w-full rounded-md border border-hairline px-md text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>

          <div className="shrink-0 border-t border-hairline-soft px-lg py-sm pb-[max(12px,env(safe-area-inset-bottom))]">
            <div className="flex gap-sm">
              <button
                type="button"
                onClick={() => close(false)}
                className="inline-flex h-12 items-center justify-center rounded-md border border-hairline-strong px-lg text-sm font-medium text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={!canSubmit}
                className="inline-flex h-12 flex-1 items-center justify-center gap-sm rounded-md bg-status-late text-base font-medium text-status-late-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-status-late focus-visible:ring-offset-2 disabled:bg-hairline disabled:text-muted"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Xác nhận hủy"}
              </button>
            </div>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
