import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/env";
import { SetupNotice } from "@/components/setup-notice";
import { CopyLink } from "@/components/copy-link";
import { inviteStaff, revokeInvite, setMembershipStatus } from "./actions";

const ROLE_LABELS: Record<string, string> = {
  owner: "Chủ nhà hàng",
  manager: "Quản lý",
  cashier: "Thu ngân",
  waiter: "Phục vụ",
  kitchen: "Bếp",
};

export default async function StaffPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ invited?: string; email?: string; err?: string }>;
}) {
  const { slug } = await params;
  const { invited, email, err } = await searchParams;
  if (!hasSupabaseEnv()) return <SetupNotice />;
  const supabase = await createClient();

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, name")
    .eq("slug", slug)
    .maybeSingle();
  if (!tenant) return null; // proxy đã chặn; phòng hờ

  const [{ data: members }, { data: invites }] = await Promise.all([
    supabase
      .from("memberships")
      .select("user_id, role, status, created_at, profiles:user_id ( full_name )")
      .eq("tenant_id", tenant.id)
      .order("created_at"),
    supabase
      .from("tenant_invitations")
      .select("id, email, role, status, token, expires_at")
      .eq("tenant_id", tenant.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 p-6">
      <header>
        <h1 className="text-2xl font-bold">Nhân viên — {tenant.name}</h1>
        <p className="text-sm opacity-70">
          Mời qua email; người được mời chấp nhận mới có tài khoản trong nhà
          hàng.
        </p>
      </header>

      {err && (
        <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600">
          {err}
        </p>
      )}
      {invited && (
        <div className="rounded-lg bg-green-500/10 px-3 py-3 text-sm">
          <p className="mb-2 font-medium">Gửi link này cho {email}:</p>
          <CopyLink path={`/invite/${invited}`} />
        </div>
      )}

      <section className="rounded-xl border border-foreground/15 p-4">
        <h2 className="mb-3 font-semibold">Mời nhân viên</h2>
        <form action={inviteStaff} className="flex flex-col gap-3 sm:flex-row">
          <input type="hidden" name="slug" value={slug} />
          <input
            name="email"
            type="email"
            required
            placeholder="Email nhân viên"
            className="min-h-11 flex-1 rounded-lg border border-foreground/20 bg-transparent px-3 text-base outline-none focus:border-foreground/60"
          />
          <select
            name="role"
            required
            defaultValue="waiter"
            className="min-h-11 rounded-lg border border-foreground/20 bg-transparent px-3 text-base outline-none"
          >
            {Object.entries(ROLE_LABELS)
              .filter(([r]) => r !== "owner")
              .map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
          </select>
          <button className="min-h-11 rounded-lg bg-foreground px-4 font-medium text-background">
            Gửi lời mời
          </button>
        </form>
      </section>

      {(invites ?? []).length > 0 && (
        <section>
          <h2 className="mb-3 font-semibold">Lời mời đang chờ</h2>
          <ul className="flex flex-col gap-2">
            {invites!.map((inv) => (
              <li
                key={inv.id}
                className="flex flex-col gap-2 rounded-lg border border-foreground/15 px-4 py-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <span className="font-medium">{inv.email}</span>
                    <span className="ml-2 text-sm opacity-60">
                      {ROLE_LABELS[inv.role]}
                    </span>
                  </div>
                  <form action={revokeInvite}>
                    <input type="hidden" name="slug" value={slug} />
                    <input type="hidden" name="id" value={inv.id} />
                    <button className="min-h-9 rounded-md border border-red-500/40 px-3 text-sm text-red-600">
                      Thu hồi
                    </button>
                  </form>
                </div>
                <CopyLink path={`/invite/${inv.token}`} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-3 font-semibold">
          Danh sách nhân viên ({members?.length ?? 0})
        </h2>
        <ul className="flex flex-col gap-2">
          {(members ?? []).map((m) => {
            const profile = m.profiles as unknown as { full_name: string } | null;
            const disabled = m.status === "disabled";
            return (
              <li
                key={m.user_id}
                className={`flex items-center justify-between rounded-lg border px-4 py-3 ${
                  disabled
                    ? "border-red-500/30 opacity-60"
                    : "border-foreground/15"
                }`}
              >
                <div>
                  <span className="font-medium">
                    {profile?.full_name || "(chưa đặt tên)"}
                  </span>
                  <span className="ml-2 text-sm opacity-60">
                    {ROLE_LABELS[m.role]}
                    {disabled && " — ĐÃ KHÓA"}
                  </span>
                </div>
                {m.role !== "owner" && (
                  <form action={setMembershipStatus}>
                    <input type="hidden" name="slug" value={slug} />
                    <input type="hidden" name="user_id" value={m.user_id} />
                    <input
                      type="hidden"
                      name="status"
                      value={disabled ? "active" : "disabled"}
                    />
                    <button
                      className={`min-h-9 rounded-md border px-3 text-sm ${
                        disabled
                          ? "border-green-600/40 text-green-700"
                          : "border-red-500/40 text-red-600"
                      }`}
                    >
                      {disabled ? "Mở khóa" : "Khóa"}
                    </button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </main>
  );
}
