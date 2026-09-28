"use client";

import { useActionState, useState } from "react";
import {
  setTenantStatus,
  resetOwnerPassword,
  deleteTenant,
  createPrintBridgeAccount,
  createBridgeActivationCode,
  revokeBridge,
  setPaidUntil,
  recordRenewal,
  type SuperActionState,
} from "./actions";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/lib/utils";
import { mocGiaHan, soThangToiNgay } from "@/lib/tenant/subscription";
import { giaGoiYTheoThang, thoiHanChu, type Plan } from "@/lib/platform/plans";

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

/**
 * Cấp / xoay tài khoản cầu in. Kết quả hiện MỘT LẦN, dạng chép-dán thẳng vào .env.local của máy
 * đặt tại quán. Không lưu lại để đọc về sau — mất thì cấp cái mới (QD-012 §1).
 */
export function PrintBridgeForm({ tenantId }: { tenantId: string }) {
  const [state, action] = useActionState(createPrintBridgeAccount, EMPTY);
  return (
    <details className="w-full sm:w-auto">
      <summary
        className={cn(
          buttonVariants({ variant: "secondary", size: "sm" }),
          "w-full cursor-pointer list-none sm:w-auto [&::-webkit-details-marker]:hidden"
        )}
      >
        Tài khoản cầu in
      </summary>
      <form
        action={action}
        className="mt-sm flex max-w-md flex-col gap-xs rounded-md border border-hairline-soft bg-surface p-sm"
      >
        <input type="hidden" name="tenant_id" value={tenantId} />
        <p className="text-xs text-slate">
          Cấp mới hoặc xoay mật khẩu cho máy cầu in đặt tại quán. Mật khẩu chỉ hiện một lần. Máy tại
          quán không bao giờ được giữ khóa service-role.
        </p>
        <SubmitButton size="sm" pendingLabel="Đang cấp…">
          Cấp tài khoản
        </SubmitButton>
        {state.ok && (
          <pre className="w-full whitespace-pre-wrap break-all rounded bg-cream-soft p-xs font-mono text-xs text-ink">
            {state.ok}
          </pre>
        )}
        {state.error && <p className="text-xs text-status-late">{state.error}</p>}
      </form>
    </details>
  );
}

/**
 * Mã kích hoạt cầu in (PRINT-11) — đọc cho người lắp gõ vào bộ cài chung. Hiện một lần, hết hạn 30 phút.
 * Kèm nút thu hồi cầu in của quán (máy mất, quán ngừng dùng).
 */
export function BridgeActivationForm({ tenantId }: { tenantId: string }) {
  const [state, action] = useActionState(createBridgeActivationCode, EMPTY);
  const [revokeState, revokeAction] = useActionState(revokeBridge, EMPTY);
  return (
    <details className="w-full sm:w-auto">
      <summary
        className={cn(
          buttonVariants({ variant: "secondary", size: "sm" }),
          "w-full cursor-pointer list-none sm:w-auto [&::-webkit-details-marker]:hidden"
        )}
      >
        Mã cài cầu in
      </summary>
      <div className="mt-sm flex max-w-md flex-col gap-sm rounded-md border border-hairline-soft bg-surface p-sm">
        <form action={action} className="flex flex-col gap-xs">
          <input type="hidden" name="tenant_id" value={tenantId} />
          <p className="text-xs text-slate">
            Tạo mã 8 ký tự để người lắp gõ vào bộ cài cầu in. Mã dùng một lần, hết hạn sau 30 phút. Máy cầu in
            cũ của quán (nếu có) mất quyền khi máy mới kích hoạt.
          </p>
          <SubmitButton size="sm" pendingLabel="Đang tạo…">
            Tạo mã kích hoạt
          </SubmitButton>
          {state.ok && (
            <pre className="w-full whitespace-pre-wrap break-all rounded bg-cream-soft p-xs font-mono text-sm text-ink">
              {state.ok}
            </pre>
          )}
          {state.error && <p className="text-xs text-status-late">{state.error}</p>}
        </form>
        <form action={revokeAction} className="flex flex-col gap-xs border-t border-hairline-soft pt-sm">
          <input type="hidden" name="tenant_id" value={tenantId} />
          <SubmitButton size="sm" variant="secondary" pendingLabel="Đang thu hồi…">
            Thu hồi cầu in của quán
          </SubmitButton>
          {revokeState.ok && <p className="text-xs text-slate">{revokeState.ok}</p>}
          {revokeState.error && <p className="text-xs text-status-late">{revokeState.error}</p>}
        </form>
      </div>
    </details>
  );
}

/** Sửa hạn dùng tay (13-03) — dự phòng, và cách sửa khi ghi nhận gia hạn nhầm. Trống = không giới hạn. */
export function PaidUntilForm({ tenantId, paidUntil }: { tenantId: string; paidUntil: string | null }) {
  const [state, action] = useActionState(setPaidUntil, EMPTY);
  return (
    <details className="group w-full sm:w-auto">
      <summary
        className={cn(
          buttonVariants({ variant: "secondary", size: "sm" }),
          "w-full cursor-pointer list-none sm:w-auto [&::-webkit-details-marker]:hidden"
        )}
      >
        Sửa hạn tay
      </summary>
      <form
        action={action}
        className="mt-sm flex flex-wrap items-center gap-xs rounded-md border border-hairline-soft bg-surface p-sm"
      >
        <input type="hidden" name="tenant_id" value={tenantId} />
        <Input name="paid_until" type="date" defaultValue={paidUntil ?? ""} className="h-9 w-full sm:w-44" />
        <SubmitButton size="sm" pendingLabel="Đang lưu…">
          Lưu
        </SubmitButton>
        <p className="w-full text-xs text-steel">Để trống = không giới hạn. Sửa nhầm thì ghi lý do vào ghi chú lần gia hạn kế.</p>
        {state.ok && <p className="w-full text-xs text-status-ready">{state.ok}</p>}
        {state.error && <p className="w-full text-xs text-status-late">{state.error}</p>}
      </form>
    </details>
  );
}

/**
 * Ghi nhận gia hạn (13-04; 0059; 0061). Chọn một GÓI (điền sẵn thời hạn + giá của gói), hoặc "Số tháng khác",
 * hoặc "Chọn ngày hết hạn" trên lịch. Số tiền luôn sửa được. Quán đang KHÔNG giới hạn phải tích ô xác nhận khi
 * chuyển sang có hạn — bấm nhầm cho qt-food sẽ biến quán thành có hạn.
 */
export function RecordRenewalForm({
  tenantId,
  paidUntil,
  today,
  plans,
}: {
  tenantId: string;
  paidUntil: string | null;
  today: string;
  plans: Plan[];
}) {
  const [state, action] = useActionState(recordRenewal, EMPTY);
  // "goi:<id>" | "thang" | "ngay"
  const [chonVal, setChonVal] = useState(plans[0] ? `goi:${plans[0].id}` : "thang");
  const [months, setMonths] = useState(1);
  const [until, setUntil] = useState("");
  const goi = chonVal.startsWith("goi:") ? plans.find((p) => `goi:${p.id}` === chonVal) ?? null : null;
  const kieu: "thang" | "ngay" | "vv" = goi ? (goi.months == null ? "vv" : "thang") : chonVal === "ngay" ? "ngay" : "thang";
  const soThang = goi ? goi.months : chonVal === "thang" ? months : null;
  const goc = mocGiaHan(paidUntil, today);
  const minNgay = congNgay(goc, 1);
  const thangNgay = chonVal === "ngay" && until ? soThangToiNgay(goc, until) : null;
  const goiY = goi ? goi.price : soThang ? giaGoiYTheoThang(plans, soThang) : thangNgay ? giaGoiYTheoThang(plans, thangNgay) : null;
  const chon = "h-9 rounded-md border border-hairline-strong bg-canvas px-sm text-sm text-ink";
  return (
    <details className="group w-full sm:w-auto">
      <summary
        className={cn(
          buttonVariants({ size: "sm" }),
          "w-full cursor-pointer list-none sm:w-auto [&::-webkit-details-marker]:hidden"
        )}
      >
        Ghi nhận gia hạn
      </summary>
      <form
        action={action}
        className="mt-sm flex flex-wrap items-center gap-xs rounded-md border border-hairline-soft bg-surface p-sm"
      >
        <input type="hidden" name="tenant_id" value={tenantId} />
        <input type="hidden" name="kieu" value={kieu} />
        {kieu === "thang" && <input type="hidden" name="months" value={soThang ?? ""} />}
        <select value={chonVal} onChange={(e) => setChonVal(e.target.value)} className={chon} aria-label="Gói">
          {plans.map((p) => (
            <option key={p.id} value={`goi:${p.id}`}>
              {p.name} — {thoiHanChu(p.months)}
            </option>
          ))}
          <option value="thang">Số tháng khác…</option>
          <option value="ngay">Chọn ngày hết hạn…</option>
        </select>
        {chonVal === "thang" && (
          <select value={months} onChange={(e) => setMonths(Number(e.target.value))} className={chon} aria-label="Số tháng">
            {Array.from({ length: 36 }, (_, k) => k + 1).map((m) => (
              <option key={m} value={m}>
                {m} tháng
              </option>
            ))}
          </select>
        )}
        {chonVal === "ngay" && (
          <Input
            type="date"
            name="until"
            required
            min={minNgay}
            value={until}
            onChange={(e) => setUntil(e.target.value)}
            className="h-9 w-full sm:w-44"
            aria-label="Ngày hết hạn mới"
          />
        )}
        <Input
          key={`${chonVal}-${months}-${until}`}
          name="amount"
          inputMode="numeric"
          required
          defaultValue={goiY ?? ""}
          placeholder="Số tiền (đ)"
          className="h-9 w-full sm:w-36"
        />
        <Input name="note" maxLength={500} placeholder="Ghi chú (mã GD ngân hàng…)" className="h-9 w-full sm:w-56" />
        {chonVal === "ngay" && (
          <p className="w-full text-xs text-steel">
            Hạn mới = đúng ngày chọn (từ {minNgay.split("-").reverse().join("/")} trở đi).
            {thangNgay && goiY ? ` Số tiền gợi ý tính ${thangNgay} tháng.` : ""}
          </p>
        )}
        {!paidUntil && kieu !== "vv" && (
          <label className="flex w-full items-center gap-xs text-xs text-status-late">
            <input type="checkbox" name="start_limited" className="h-4 w-4" />
            Quán đang KHÔNG GIỚI HẠN — chuyển sang có hạn
          </label>
        )}
        {kieu === "vv" && (
          <p className="w-full text-xs text-status-late">
            Vĩnh viễn: quán thành KHÔNG GIỚI HẠN, không cần gia hạn nữa.
          </p>
        )}
        <SubmitButton size="sm" pendingLabel="Đang ghi…">
          Ghi nhận
        </SubmitButton>
        {state.ok && <p className="w-full text-xs text-status-ready">{state.ok}</p>}
        {state.error && <p className="w-full text-xs text-status-late">{state.error}</p>}
      </form>
    </details>
  );
}

/** "2026-09-27" + n ngày. */
function congNgay(d: string, n: number): string {
  return new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10) + n)).toISOString().slice(0, 10);
}
