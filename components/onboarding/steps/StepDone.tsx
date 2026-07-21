"use client";

import { SubmitButton } from "@/components/ui/submit-button";
import { markOnboardingDone } from "@/app/r/[slug]/admin/(protected)/onboarding/actions";

/** Bước 4: tóm tắt + hoàn tất (ghi onboarding_done → về dashboard). */
export function StepDone({
  slug,
  itemCount,
  tableCount,
}: {
  slug: string;
  itemCount: number;
  tableCount: number;
}) {
  return (
    <div className="flex flex-col gap-md">
      <p className="text-sm text-slate">Tóm tắt thiết lập:</p>
      <ul className="grid gap-sm sm:grid-cols-2">
        <li className="rounded-md border border-hairline-soft bg-canvas px-md py-sm text-sm text-ink">
          <span className="text-2xl font-display">{itemCount}</span>
          <span className="ml-xs text-steel">món trong thực đơn</span>
        </li>
        <li className="rounded-md border border-hairline-soft bg-canvas px-md py-sm text-sm text-ink">
          <span className="text-2xl font-display">{tableCount}</span>
          <span className="ml-xs text-steel">bàn đã tạo</span>
        </li>
      </ul>

      <form action={markOnboardingDone}>
        <input type="hidden" name="slug" value={slug} />
        <SubmitButton pendingLabel="Đang hoàn tất…">Hoàn tất thiết lập</SubmitButton>
      </form>
    </div>
  );
}
