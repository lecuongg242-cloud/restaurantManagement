"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { seedSampleMenu } from "@/app/r/[slug]/admin/(protected)/onboarding/actions";
import { SAMPLE_ITEM_COUNT } from "@/lib/onboarding/sample-menu";

/** Bước 2: seed menu mẫu + link sửa nhanh ở /admin/menu. */
export function StepMenu({
  slug,
  hasMenu,
  itemCount,
}: {
  slug: string;
  hasMenu: boolean;
  itemCount: number;
}) {
  return (
    <div className="flex flex-col gap-md">
      <p className="text-sm text-slate">
        Bấm &quot;Dùng menu mẫu&quot; để có sẵn {SAMPLE_ITEM_COUNT} món chia 3 danh mục (Món chính, Đồ uống,
        Tráng miệng) rồi sửa nhanh — không phải gõ từ đầu.
      </p>

      {hasMenu ? (
        <div className="rounded-md border border-status-ready bg-status-ready-bg px-md py-sm text-sm text-status-ready">
          Đã có {itemCount} món trong thực đơn.
        </div>
      ) : (
        <form action={seedSampleMenu}>
          <input type="hidden" name="slug" value={slug} />
          <SubmitButton size="sm" pendingLabel="Đang thêm…">
            Dùng menu mẫu ({SAMPLE_ITEM_COUNT} món)
          </SubmitButton>
        </form>
      )}

      <div>
        <Button asChild variant="secondary" size="sm">
          <Link href={`/r/${slug}/admin/menu`} target="_blank" rel="noopener">
            Mở Thực đơn để sửa giá/tên →
          </Link>
        </Button>
      </div>
    </div>
  );
}
