"use client";

import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { LogoUpload } from "@/components/settings/LogoUpload";
import { updateProfile } from "@/app/r/[slug]/admin/(protected)/settings/actions";

/** Bước 1: tên + logo nhà hàng (tái dùng action 02-04, redirect về wizard). */
export function StepInfo({
  slug,
  name,
  logoUrl,
}: {
  slug: string;
  name: string;
  logoUrl: string | null;
}) {
  const redirectTo = `/r/${slug}/admin/onboarding?step=1`;
  return (
    <div className="grid gap-lg sm:grid-cols-2">
      <form action={updateProfile} className="flex flex-col gap-md">
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="redirect_to" value={redirectTo} />
        <label className="flex flex-col gap-xxs text-sm text-slate">
          Tên nhà hàng
          <Input name="name" required defaultValue={name} placeholder="Phở Việt" />
        </label>
        <div>
          <SubmitButton size="sm" pendingLabel="Đang lưu…">
            Lưu tên
          </SubmitButton>
        </div>
      </form>
      <LogoUpload slug={slug} currentUrl={logoUrl} redirectTo={redirectTo} />
    </div>
  );
}
