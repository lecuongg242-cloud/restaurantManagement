import { superSignIn } from "../actions";
import { isSuperAdmin } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { SubmitButton } from "@/components/ui/submit-button";
import { Input } from "@/components/ui/input";

export default async function SuperLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  // Đã là super-admin → vào thẳng.
  if (await isSuperAdmin()) redirect("/super");
  const { error } = await searchParams;

  return (
    <div className="grid min-h-screen place-items-center bg-surface p-lg">
      <div className="w-full max-w-sm rounded-lg border border-hairline-soft bg-canvas p-xxl shadow-card">
        <h1 className="font-display text-2xl text-ink">Super Admin</h1>
        <p className="mt-xxs text-sm text-steel">Đăng nhập quản trị hệ thống.</p>

        {error && (
          <p
            role="alert"
            className="mt-md rounded-md border border-status-late bg-cream-soft px-md py-sm text-sm text-status-late"
          >
            {error}
          </p>
        )}

        <form action={superSignIn} className="mt-lg flex flex-col gap-md">
          <label className="flex flex-col gap-xxs text-sm text-slate">
            Email
            <Input name="email" type="email" required autoComplete="email" autoFocus />
          </label>
          <label className="flex flex-col gap-xxs text-sm text-slate">
            Mật khẩu
            <Input name="password" type="password" required autoComplete="current-password" />
          </label>
          <SubmitButton pendingLabel="Đang đăng nhập…" className="mt-xs">
            Đăng nhập
          </SubmitButton>
        </form>
      </div>
    </div>
  );
}
