import { redirect } from "next/navigation";
import { ownerSignIn } from "../actions";
import { getSessionMembership } from "@/lib/auth/session";
import { canAccess, defaultRouteForRole } from "@/lib/auth/rbac";
import { SubmitButton } from "@/components/ui/submit-button";
import { Input } from "@/components/ui/input";

export default async function AdminLoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { slug } = await params;
  const { error } = await searchParams;

  // Đã đăng nhập đúng quyền → vào thẳng admin (hoặc khu mặc định của vai trò).
  const session = await getSessionMembership(slug);
  if (session) {
    if (canAccess(session.role, "admin")) redirect(`/r/${slug}/admin`);
    redirect(defaultRouteForRole(slug, session.role));
  }

  return (
    <div className="grid min-h-screen place-items-center bg-surface p-lg">
      <div className="w-full max-w-sm rounded-lg border border-hairline-soft bg-canvas p-xxl shadow-card">
        <h1 className="font-display text-2xl text-ink">Đăng nhập quản trị</h1>
        <p className="mt-xxs text-sm text-steel">
          Nhà hàng <span className="font-mono text-ink">{slug}</span>
        </p>

        {error && (
          <p
            role="alert"
            className="mt-md rounded-md border border-status-late bg-cream-soft px-md py-sm text-sm text-status-late"
          >
            {error}
          </p>
        )}

        <form action={ownerSignIn} className="mt-lg flex flex-col gap-md">
          <input type="hidden" name="slug" value={slug} />
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
