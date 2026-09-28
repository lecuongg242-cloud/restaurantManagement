"use client";

import Link from "next/link";
import { useActionState } from "react";
import { createBranchAction, type KetQuaChiNhanh } from "./actions";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";

/** "+ Tạo chi nhánh": tên + mã; chép cài đặt từ quán đang mở. */
export function CreateBranchForm({ slug, laChuoi }: { slug: string; laChuoi: boolean }) {
  const [s, action] = useActionState(createBranchAction, {} as KetQuaChiNhanh);
  return (
    <form action={action} className="flex flex-wrap items-end gap-sm">
      <input type="hidden" name="slug_quan" value={slug} />
      <label className="flex flex-col gap-xxs text-sm text-slate">
        Tên chi nhánh
        <Input name="name" required maxLength={100} placeholder="Tên quán — Quận 3" className="h-10 w-64" />
      </label>
      <label className="flex flex-col gap-xxs text-sm text-slate">
        Mã (để trống = tự sinh)
        <Input name="slug" placeholder="ten-quan-q3" className="h-10 w-48" />
      </label>
      <SubmitButton pendingLabel="Đang tạo…">+ Tạo chi nhánh</SubmitButton>
      <p className="w-full text-xs text-steel">
        Chép phí phục vụ, VAT, tài khoản nhận chuyển khoản, logo của quán này. Không chép bàn, nhân viên, thực đơn, dữ liệu
        bán (thực đơn: dùng “Đồng bộ thực đơn”). {laChuoi ? "" : "Quán này sẽ thành chi nhánh gốc của chuỗi. "}Chi nhánh mới dùng
        ngay tới hạn chung của chuỗi; lần gia hạn sau tính thêm chi nhánh này.
      </p>
      {s.error && <p className="w-full text-sm text-status-late">{s.error}</p>}
      {s.ok && (
        <p className="w-full text-sm text-status-ready">
          {s.ok}{" "}
          {s.slug && (
            <Link href={`/r/${s.slug}/admin`} className="underline underline-offset-4">
              Vào chi nhánh mới để thêm bàn, nhân viên →
            </Link>
          )}
        </p>
      )}
    </form>
  );
}
