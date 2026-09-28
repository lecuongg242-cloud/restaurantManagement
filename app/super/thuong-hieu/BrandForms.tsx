"use client";

import { useActionState } from "react";
import type { SuperActionState } from "../actions";
import {
  deleteBrandAction,
  detachTenantAction,
  recordBrandRenewalAction,
  addBrandMemberAction,
  attachTenantAction,
  createBranchAction,
  createBrandAction,
  removeBrandMemberAction,
} from "./actions";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { useState } from "react";
import { thoiHanChu, type Plan } from "@/lib/platform/plans";
import { tienGiaHanChuoi } from "@/lib/brand/billing";

const EMPTY: SuperActionState = {};
const SELECT = "h-9 min-w-0 rounded-md border border-hairline-strong bg-canvas px-sm text-sm text-ink";
type Quan = { id: string; name: string; slug: string };

function KetQua({ s }: { s: SuperActionState }) {
  if (s.ok) return <p className="w-full text-xs text-status-ready">{s.ok}</p>;
  if (s.error) return <p className="w-full text-xs text-status-late">{s.error}</p>;
  return null;
}

/** Tạo thương hiệu, tùy chọn gắn luôn một quán lẻ làm chi nhánh gốc. */
export function CreateBrandForm({ quanLe }: { quanLe: Quan[] }) {
  const [s, action] = useActionState(createBrandAction, EMPTY);
  return (
    <form action={action} className="flex flex-wrap items-end gap-sm">
      <label className="flex flex-col gap-xxs text-sm text-slate">
        Tên thương hiệu
        <Input name="name" required maxLength={100} placeholder="Phở Việt" className="h-9 w-56" />
      </label>
      <label className="flex flex-col gap-xxs text-sm text-slate">
        Mã (để trống = tự sinh)
        <Input name="slug" placeholder="pho-viet" className="h-9 w-44" />
      </label>
      <label className="flex flex-col gap-xxs text-sm text-slate">
        Chi nhánh gốc (quán có sẵn)
        <select name="tenant_id" defaultValue="" className={SELECT}>
          <option value="">— Chưa gắn —</option>
          {quanLe.map((q) => (
            <option key={q.id} value={q.id}>
              {q.name} ({q.slug})
            </option>
          ))}
        </select>
      </label>
      <SubmitButton size="sm" pendingLabel="Đang tạo…">
        Tạo thương hiệu
      </SubmitButton>
      <KetQua s={s} />
    </form>
  );
}

export function AttachTenantForm({ brandId, quanLe }: { brandId: string; quanLe: Quan[] }) {
  const [s, action] = useActionState(attachTenantAction, EMPTY);
  if (quanLe.length === 0) return null;
  return (
    <form action={action} className="flex flex-wrap items-center gap-xs">
      <input type="hidden" name="brand_id" value={brandId} />
      <select name="tenant_id" required defaultValue="" className={SELECT} aria-label="Quán lẻ để gắn">
        <option value="" disabled>
          Gắn quán có sẵn…
        </option>
        {quanLe.map((q) => (
          <option key={q.id} value={q.id}>
            {q.name} ({q.slug})
          </option>
        ))}
      </select>
      <SubmitButton size="sm" variant="secondary" pendingLabel="…">
        Gắn vào thương hiệu
      </SubmitButton>
      <KetQua s={s} />
    </form>
  );
}

/** Tạo chi nhánh mới: tên + mã, chép cài đặt từ một chi nhánh (mặc định chi nhánh gốc). */
export function CreateBranchForm({ brandId, chiNhanh, gocId }: { brandId: string; chiNhanh: Quan[]; gocId: string | null }) {
  const [s, action] = useActionState(createBranchAction, EMPTY);
  return (
    <form action={action} className="flex flex-wrap items-end gap-sm">
      <input type="hidden" name="brand_id" value={brandId} />
      <label className="flex flex-col gap-xxs text-sm text-slate">
        Tên chi nhánh
        <Input name="name" required maxLength={100} placeholder="Phở Việt — Quận 3" className="h-9 w-56" />
      </label>
      <label className="flex flex-col gap-xxs text-sm text-slate">
        Mã (để trống = tự sinh)
        <Input name="slug" placeholder="pho-viet-q3" className="h-9 w-44" />
      </label>
      {chiNhanh.length > 0 && (
        <label className="flex flex-col gap-xxs text-sm text-slate">
          Chép cài đặt từ
          <select name="copy_from" defaultValue={gocId ?? ""} className={SELECT}>
            {chiNhanh.map((q) => (
              <option key={q.id} value={q.id}>
                {q.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <SubmitButton size="sm" pendingLabel="Đang tạo…">
        + Tạo chi nhánh
      </SubmitButton>
      <p className="w-full text-xs text-steel">
        Chép phí phục vụ, VAT, tài khoản nhận chuyển khoản, logo. Không chép bàn, nhân viên, thực đơn, dữ liệu bán. Hạn dùng =
        hạn chung của thương hiệu.
      </p>
      <KetQua s={s} />
    </form>
  );
}

export function AddMemberForm({ brandId }: { brandId: string }) {
  const [s, action] = useActionState(addBrandMemberAction, EMPTY);
  return (
    <form action={action} className="flex flex-wrap items-center gap-xs">
      <input type="hidden" name="brand_id" value={brandId} />
      <Input name="email" type="email" required placeholder="email tài khoản" className="h-9 w-56" />
      <select name="role" defaultValue="manager" className={SELECT} aria-label="Vai trò">
        <option value="owner">Chủ</option>
        <option value="manager">Quản lý</option>
      </select>
      <SubmitButton size="sm" variant="secondary" pendingLabel="…">
        Thêm người
      </SubmitButton>
      <KetQua s={s} />
    </form>
  );
}

export function RemoveMemberForm({ brandId, userId, ten }: { brandId: string; userId: string; ten: string }) {
  const [s, action] = useActionState(removeBrandMemberAction, EMPTY);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(`Bỏ ${ten} khỏi thương hiệu? Người này mất quyền ở MỌI chi nhánh.`)) e.preventDefault();
      }}
      className="inline"
    >
      <input type="hidden" name="brand_id" value={brandId} />
      <input type="hidden" name="user_id" value={userId} />
      <button type="submit" className="text-xs text-status-late hover:underline">
        Bỏ
      </button>
      {s.error && <span className="ml-xs text-xs text-status-late">{s.error}</span>}
    </form>
  );
}

/** Ghi nhận gia hạn cả chuỗi: chọn gói → số tiền = giá gói × số chi nhánh đang hoạt động (sửa được). */
export function BrandRenewalForm({
  brandId,
  plans,
  soChiNhanh,
  coKhongGioiHan,
}: {
  brandId: string;
  plans: Plan[];
  soChiNhanh: number;
  coKhongGioiHan: boolean;
}) {
  const [s, action] = useActionState(recordBrandRenewalAction, EMPTY);
  const [id, setId] = useState(plans[0]?.id ?? "");
  const goi = plans.find((p) => p.id === id);
  if (!goi) return <p className="text-xs text-steel">Chưa có gói — thêm ở Cài đặt nền tảng.</p>;
  return (
    <form action={action} className="flex flex-wrap items-center gap-xs">
      <input type="hidden" name="brand_id" value={brandId} />
      <input type="hidden" name="months" value={goi.months == null ? "vv" : String(goi.months)} />
      <select value={id} onChange={(e) => setId(e.target.value)} className={SELECT} aria-label="Gói">
        {plans.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} — {thoiHanChu(p.months)}
          </option>
        ))}
      </select>
      <Input key={id} name="amount" inputMode="numeric" required defaultValue={tienGiaHanChuoi(goi.price, soChiNhanh)} className="h-9 w-36" aria-label="Số tiền" />
      <Input name="note" maxLength={400} placeholder="Ghi chú (mã GD…)" className="h-9 w-48" />
      <SubmitButton size="sm" pendingLabel="…">
        Ghi nhận gia hạn chuỗi
      </SubmitButton>
      <p className="w-full text-xs text-steel">
        {soChiNhanh} chi nhánh đang hoạt động × giá gói. Mọi chi nhánh cùng một ngày hết hạn = max(hôm nay, hạn muộn nhất) + thời hạn.
      </p>
      {coKhongGioiHan && goi.months != null && (
        <label className="flex w-full items-center gap-xs text-xs text-status-late">
          <input type="checkbox" name="start_limited" className="h-4 w-4" />
          Có chi nhánh đang KHÔNG GIỚI HẠN — chuyển cả chuỗi sang có hạn
        </label>
      )}
      <KetQua s={s} />
    </form>
  );
}

/** Gỡ một quán khỏi thương hiệu — hỏi xác nhận. */
export function DetachTenantForm({ tenantId, ten }: { tenantId: string; ten: string }) {
  const [s, action] = useActionState(detachTenantAction, EMPTY);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(`Gỡ “${ten}” khỏi thương hiệu? Quán trở lại là quán lẻ; chủ / quản lý chuỗi mất quyền ở quán này. Không mất dữ liệu.`)) {
          e.preventDefault();
        }
      }}
      className="inline"
    >
      <input type="hidden" name="tenant_id" value={tenantId} />
      <button type="submit" className="text-xs text-status-late hover:underline">
        Gỡ khỏi thương hiệu
      </button>
      {s.error && <span className="ml-xs text-xs text-status-late">{s.error}</span>}
    </form>
  );
}

/** Xóa thương hiệu — gõ đúng mã để xác nhận (như xóa nhà hàng). */
export function DeleteBrandForm({ brandId, slug }: { brandId: string; slug: string }) {
  const [s, action] = useActionState(deleteBrandAction, EMPTY);
  return (
    <details className="text-sm">
      <summary className="cursor-pointer list-none text-xs text-status-late hover:underline [&::-webkit-details-marker]:hidden">
        Xóa thương hiệu…
      </summary>
      <form action={action} className="mt-xs flex flex-wrap items-center gap-xs rounded-md border border-status-late/40 bg-surface p-sm">
        <input type="hidden" name="brand_id" value={brandId} />
        <input type="hidden" name="slug" value={slug} />
        <span className="w-full text-xs text-slate">
          Gỡ mọi quán ra (thành quán lẻ, không mất dữ liệu) rồi xóa thương hiệu. Gõ <strong className="font-mono">{slug}</strong> để xác nhận.
        </span>
        <Input name="confirm" required autoComplete="off" placeholder={slug} className="h-9 w-48" />
        <SubmitButton size="sm" variant="secondary" pendingLabel="…">
          Xóa thương hiệu
        </SubmitButton>
        <KetQua s={s} />
      </form>
    </details>
  );
}
