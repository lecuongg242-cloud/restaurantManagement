import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/env";
import { SetupNotice } from "@/components/setup-notice";

const ERR_MESSAGES: Record<string, string> = {
  forbidden: "Vai trò của bạn không được vào khu vực đó.",
  "no-access": "Bạn không thuộc nhà hàng này hoặc nhà hàng không tồn tại.",
  disabled: "Tài khoản của bạn tại nhà hàng này đã bị khóa. Liên hệ quản lý.",
};

/** Khu vực mặc định theo vai trò. */
function homeFor(role: string, slug: string) {
  if (role === "owner" || role === "manager") return `/r/${slug}/admin`;
  if (role === "kitchen") return `/r/${slug}/kds`;
  return `/r/${slug}/pos`;
}

export default async function ChoosePage({
  searchParams,
}: {
  searchParams: Promise<{ err?: string }>;
}) {
  const { err } = await searchParams;
  if (!hasSupabaseEnv()) return <SetupNotice />;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: isSuper }, { data: memberships }] = await Promise.all([
    supabase.from("super_admins").select("user_id").maybeSingle(),
    supabase
      .from("memberships")
      .select("role, status, tenants ( slug, name )")
      .eq("user_id", user.id),
  ]);

  const active = (memberships ?? []).filter((m) => m.status === "active");

  // Chỉ thuộc 1 nơi và không phải super-admin → vào thẳng
  if (!err && !isSuper && active.length === 1) {
    const m = active[0];
    const tenant = m.tenants as unknown as { slug: string };
    redirect(homeFor(m.role, tenant.slug));
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-6">
      <div className="w-full max-w-sm">
        <h1 className="mb-4 text-center text-2xl font-bold">Chọn nơi làm việc</h1>
        {err && (
          <p role="alert" className="mb-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600">
            {ERR_MESSAGES[err] ?? "Không truy cập được."}
          </p>
        )}
        <ul className="flex flex-col gap-2">
          {isSuper && (
            <li>
              <Link
                href="/super"
                className="block rounded-lg border border-foreground/20 px-4 py-3 font-medium hover:border-foreground/60"
              >
                Quản trị SaaS (super-admin)
              </Link>
            </li>
          )}
          {active.map((m) => {
            const tenant = m.tenants as unknown as { slug: string; name: string };
            return (
              <li key={tenant.slug}>
                <Link
                  href={homeFor(m.role, tenant.slug)}
                  className="block rounded-lg border border-foreground/20 px-4 py-3 hover:border-foreground/60"
                >
                  <span className="font-medium">{tenant.name}</span>
                  <span className="ml-2 text-sm opacity-60">({m.role})</span>
                </Link>
              </li>
            );
          })}
          {!isSuper && active.length === 0 && (
            <li className="rounded-lg border border-dashed border-foreground/30 px-4 py-3 text-sm opacity-70">
              Bạn chưa thuộc nhà hàng nào. Hãy nhờ quản lý gửi lời mời.
            </li>
          )}
        </ul>
      </div>
    </main>
  );
}
