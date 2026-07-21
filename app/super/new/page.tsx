import Link from "next/link";
import { redirect } from "next/navigation";
import { isSuperAdmin } from "@/lib/auth/session";
import { createTenant } from "../actions";
import { SubmitButton } from "@/components/ui/submit-button";
import { Input } from "@/components/ui/input";

export default async function NewTenantPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (!(await isSuperAdmin())) redirect("/super/login");
  const { error } = await searchParams;

  return (
    <div className="mx-auto min-h-screen max-w-lg bg-canvas p-lg">
      <Link href="/super" className="text-sm text-primary underline-offset-4 hover:underline">
        ← Danh sách nhà hàng
      </Link>
      <h1 className="mt-md font-display text-2xl text-ink">Tạo nhà hàng mới</h1>
      <p className="mt-xxs text-sm text-steel">
        Tạo tenant + tài khoản owner. Owner đăng nhập tại /r/[slug]/admin/login.
      </p>

      {error && (
        <p
          role="alert"
          className="mt-md rounded-md border border-status-late bg-cream-soft px-md py-sm text-sm text-status-late"
        >
          {error}
        </p>
      )}

      <form action={createTenant} className="mt-lg flex flex-col gap-md">
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
  );
}
