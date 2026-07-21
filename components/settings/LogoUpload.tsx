"use client";

import { ImageUpload } from "@/components/menu/ImageUpload";
import { SubmitButton } from "@/components/ui/submit-button";
import { uploadLogo } from "@/app/r/[slug]/admin/(protected)/settings/actions";

/** Form upload logo tenant: ImageUpload (validate client) → uploadLogo (server re-validate). */
export function LogoUpload({
  slug,
  currentUrl,
  redirectTo,
}: {
  slug: string;
  currentUrl: string | null;
  redirectTo?: string;
}) {
  return (
    <form action={uploadLogo} className="flex flex-col gap-md">
      <input type="hidden" name="slug" value={slug} />
      {redirectTo && <input type="hidden" name="redirect_to" value={redirectTo} />}
      <ImageUpload
        currentUrl={currentUrl}
        shape="circle"
        label="Logo nhà hàng (≤2MB, PNG/JPEG/WebP)"
      />
      <div>
        <SubmitButton size="sm" pendingLabel="Đang tải…">
          Lưu logo
        </SubmitButton>
      </div>
    </form>
  );
}
