"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PinPad } from "@/components/staff/PinPad";
import { verifyStaffPin } from "@/app/r/[slug]/station-actions";
import { Button } from "@/components/ui/button";

type Staff = { id: string; display_name: string | null; role: string };

const ROLE_LABEL: Record<string, string> = {
  cashier: "Thu ngân",
  waiter: "Phục vụ",
  kitchen: "Bếp",
};

/**
 * Chọn nhân viên → nhập PIN → xác thực ở SERVER (verifyStaffPin).
 * Không so khớp PIN ở client; chỉ thu thập chữ số rồi gửi server action.
 */
export function StaffPicker({
  slug,
  surface,
  staff,
}: {
  slug: string;
  surface: "pos" | "kds";
  staff: Staff[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Staff | null>(null);
  const [pin, setPin] = useState("");
  const [state, dispatch, pending] = useActionState(verifyStaffPin, { ok: false });

  // Đủ 4 số → gửi xác thực.
  useEffect(() => {
    if (pin.length === 4 && selected && !pending) {
      const fd = new FormData();
      fd.set("slug", slug);
      fd.set("surface", surface);
      fd.set("membershipId", selected.id);
      fd.set("pin", pin);
      dispatch(fd);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  // Thành công → lộ shell (cookie đã đặt ở server).
  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  // Lỗi → xóa PIN để nhập lại.
  useEffect(() => {
    if (state.error) setPin("");
  }, [state]);

  if (!selected) {
    return (
      <div className="mx-auto w-full max-w-md">
        <h2 className="text-center text-lg font-medium text-ink">Chọn nhân viên</h2>
        <div className="mt-lg grid grid-cols-2 gap-sm">
          {staff.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                setSelected(s);
                setPin("");
              }}
              className="flex min-h-[64px] flex-col items-start justify-center rounded-lg border border-hairline-soft bg-canvas px-lg py-md text-left transition-colors duration-150 motion-reduce:transition-none hover:bg-surface active:bg-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              <span className="text-base font-medium text-ink">{s.display_name}</span>
              <span className="text-xs text-steel">{ROLE_LABEL[s.role] ?? s.role}</span>
            </button>
          ))}
          {staff.length === 0 && (
            <p className="col-span-2 text-center text-sm text-steel">
              Chưa có nhân viên phù hợp. Owner tạo ở /admin/staff.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-md">
      <button
        type="button"
        onClick={() => {
          setSelected(null);
          setPin("");
        }}
        className="self-start text-sm text-primary underline-offset-4 hover:underline"
      >
        ← Đổi người
      </button>
      <div className="text-center">
        <p className="text-lg font-medium text-ink">{selected.display_name}</p>
        <p className="text-xs text-steel">{ROLE_LABEL[selected.role] ?? selected.role}</p>
      </div>

      <PinPad
        value={pin}
        disabled={pending}
        onDigit={(d) => setPin((p) => (p.length < 4 ? p + d : p))}
        onBackspace={() => setPin((p) => p.slice(0, -1))}
        onClear={() => setPin("")}
      />

      {pending && (
        <p className="text-sm text-steel" role="status" aria-live="polite">
          Đang kiểm tra…
        </p>
      )}
      {state.error && !pending && (
        <p
          role="alert"
          className="rounded-md border border-status-late bg-cream-soft px-md py-sm text-sm text-status-late"
        >
          {state.error}
        </p>
      )}

      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => setPin("")}
        className="mt-xs"
      >
        Nhập lại
      </Button>
    </div>
  );
}
