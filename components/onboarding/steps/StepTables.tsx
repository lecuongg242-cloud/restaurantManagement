"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Input } from "@/components/ui/input";
import { seedTables } from "@/app/r/[slug]/admin/(protected)/onboarding/actions";

/** Bước 3: tạo nhanh N bàn + mở trang xuất QR. */
export function StepTables({
  slug,
  tableCount,
}: {
  slug: string;
  tableCount: number;
}) {
  return (
    <div className="flex flex-col gap-md">
      <p className="text-sm text-slate">
        Tạo nhanh một loạt bàn (mỗi bàn tự có mã QR). Có thể chỉnh khu vực/số ghế sau ở trang Bàn & QR.
      </p>

      {tableCount > 0 && (
        <div className="rounded-md border border-status-ready bg-status-ready-bg px-md py-sm text-sm text-status-ready">
          Đã có {tableCount} bàn.
        </div>
      )}

      <form action={seedTables} className="flex items-end gap-sm">
        <input type="hidden" name="slug" value={slug} />
        <label className="flex flex-col gap-xxs text-sm text-slate">
          Số bàn tạo thêm
          <Input name="count" type="number" min={1} max={50} defaultValue={5} className="w-24" />
        </label>
        <SubmitButton size="sm" pendingLabel="Đang tạo…">
          Tạo bàn
        </SubmitButton>
      </form>

      <div className="flex gap-sm">
        <Button asChild variant="secondary" size="sm">
          <Link href={`/r/${slug}/admin/tables`} target="_blank" rel="noopener">
            Mở Bàn & QR →
          </Link>
        </Button>
        {tableCount > 0 && (
          <Button asChild variant="primary" size="sm">
            <Link href={`/r/${slug}/print/qr`} target="_blank" rel="noopener">
              Xuất QR ({tableCount} bàn)
            </Link>
          </Button>
        )}
      </div>
    </div>
  );
}
