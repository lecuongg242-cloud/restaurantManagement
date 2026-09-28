import { redirect } from "next/navigation";
import { isSuperAdmin } from "@/lib/auth/session";
import { createTenant } from "../actions";
import { SubmitButton } from "@/components/ui/submit-button";
import { Input } from "@/components/ui/input";
import { SuperPageHeader } from "@/components/super/SuperShell";

export default async function NewTenantPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (!(await isSuperAdmin())) redirect("/super/login");
  const { error } = await searchParams;

  return (
    <div>
      <SuperPageHeader
        title="Tạo nhà hàng"
        description="Tạo tenant + tài khoản owner. Owner đăng nhập tại /r/[slug]/admin/login."
      />
      <div className="mt-lg max-w-xl rounded-lg border border-hairline-soft bg-canvas p-lg shadow-card">

      {error && (
        <p
          role="alert"
          className="mb-md rounded-md border border-status-late bg-cream-soft px-md py-sm text-sm text-status-late"
        >
          {error}
        </p>
      )}

      <form action={createTenant} className="flex flex-col gap-md">
        <label className="flex flex-col gap-xxs text-sm text-slate">
          Tên nhà hàng
          <Input name="name" required placeholder="Phở Việt" />
        </label>
        <label className="flex flex-col gap-xxs text-sm text-slate">
          Slug (để trống = tự sinh từ tên)
          <Input name="slug" placeholder="pho-viet" />
        </label>

        <hr className="my-xs border-hairline-soft" />

        <label className="flex flex-col gap-xxs text-sm text-slate">
          Email owner
          <Input name="ownerEmail" type="email" required placeholder="owner@pho-viet.vn" />
        </label>
        <label className="flex flex-col gap-xxs text-sm text-slate">
          Mật khẩu tạm (owner đổi sau)
          <Input name="ownerPassword" type="text" required placeholder="tối thiểu 6 ký tự" />
        </label>

        <SubmitButton pendingLabel="Đang tạo…" className="mt-xs">
          Tạo nhà hàng
        </SubmitButton>
      </form>
      </div>
    </div>
  );
}
