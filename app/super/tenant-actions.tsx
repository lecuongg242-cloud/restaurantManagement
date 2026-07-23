"use client";

import { useActionState } from "react";
import {
  setTenantStatus,
  resetOwnerPassword,
  deleteTenant,
  type SuperActionState,
} from "./actions";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/lib/utils";

const EMPTY: SuperActionState = {};

/** Tạm ngưng / kích hoạt — cập nhật tại chỗ (pill + nút đổi ngay, URL không đổi). */
export function StatusToggleForm({
  tenantId,
  isSuspended,
}: {
  tenantId: string;
  isSuspended: boolean;
}) {
  const [state, action] = useActionState(setTenantStatus, EMPTY);
  return (
    <form action={action} className="w-full sm:w-auto">
      <input type="hidden" name="tenant_id" value={tenantId} />
      <input type="hidden" name="status" value={isSuspended ? "active" : "suspended"} />
      <SubmitButton variant="secondary" size="sm" className="w-full sm:w-auto" pendingLabel="…">
        {isSuspended ? "Kích hoạt" : "Tạm ngưng"}
      </SubmitButton>
      {state.error && <p className="mt-xxs text-xs text-status-late">{state.error}</p>}
    </form>
  );
}

/** Đổi mật khẩu owner — phản hồi inline ngay dưới ô nhập, không rời trang. */
export function ResetPasswordForm({ tenantId }: { tenantId: string }) {
  const [state, action] = useActionState(resetOwnerPassword, EMPTY);
  return (
    <details className="group w-full sm:w-auto">
      <summary
        className={cn(
          buttonVariants({ variant: "secondary", size: "sm" }),
          "w-full cursor-pointer list-none sm:w-auto [&::-webkit-details-marker]:hidden"
        )}
      >
        Đổi mật khẩu
      </summary>
      <form
        action={action}
        className="mt-sm flex flex-wrap items-center gap-xs rounded-md border border-hairline-soft bg-surface p-sm"
      >
        <input type="hidden" name="tenant_id" value={tenantId} />
        <Input
          name="password"
          type="text"
          required
          minLength={8}
          placeholder="Mật khẩu mới (≥ 8 ký tự)"
          autoComplete="off"
          className="h-9 w-full sm:w-52"
        />
        <SubmitButton size="sm" pendingLabel="Đang đổi…">
          Lưu
        </SubmitButton>
        {state.ok && <p className="w-full text-xs text-status-ready">{state.ok}</p>}
        {state.error && <p className="w-full text-xs text-status-late">{state.error}</p>}
      </form>
    </details>
  );
}

/** Xoá vĩnh viễn — lỗi (sai slug) hiện inline; thành công thì hàng tự biến mất. */
export function DeleteTenantForm({ tenantId, slug }: { tenantId: string; slug: string }) {
  const [state, action] = useActionState(deleteTenant, EMPTY);
  return (
    <details className="w-full sm:w-auto">
      <summary
        className={cn(
          buttonVariants({ variant: "secondary", size: "sm" }),
          "w-full cursor-pointer list-none border-status-late/40 text-status-late hover:bg-cream-soft sm:w-auto [&::-webkit-details-marker]:hidden"
        )}
      >
        Xoá vĩnh viễn
      </summary>
      <form
        action={action}
        className="mt-sm flex max-w-md flex-col gap-xs rounded-md border border-status-late/30 bg-cream-soft p-sm"
      >
        <input type="hidden" name="tenant_id" value={tenantId} />
        <p className="text-xs text-slate">
          Xoá toàn bộ dữ liệu nhà hàng, không hồi phục. Gõ{" "}
          <span className="font-mono font-medium text-ink">{slug}</span> để xác nhận.
        </p>
        <div className="flex flex-wrap items-center gap-xs">
          <Input
            name="confirm_slug"
            type="text"
            required
            placeholder={slug}
            autoComplete="off"
            className="h-9 w-full sm:w-44"
          />
          <SubmitButton
            variant="secondary"
            size="sm"
            className="border-status-late/50 text-status-late hover:bg-cream-deeper"
            pendingLabel="Đang xoá…"
          >
            Xoá
          </SubmitButton>
        </div>
        {state.error && <p className="text-xs text-status-late">{state.error}</p>}
      </form>
    </details>
  );
}
