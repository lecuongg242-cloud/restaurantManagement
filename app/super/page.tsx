import Link from "next/link";
import { redirect } from "next/navigation";
import { isSuperAdmin } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { superSignOut, resetOwnerPassword, setTenantStatus, deleteTenant } from "./actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function SuperHome({
  searchParams,
}: {
  searchParams: Promise<{
    created?: string;
    reset?: string;
    error?: string;
    status?: string;
    deleted?: string;
  }>;
}) {
  const su = await isSuperAdmin();
  if (!su) redirect("/super/login");
  const { created, reset, error, status, deleted } = await searchParams;

  // Danh sách tenant (super-admin xem toàn cục qua service role).
  const admin = createAdminClient();
  const { data: tenants } = await admin
    .from("tenants")
    .select("id, slug, name, status, created_at")
    .order("created_at", { ascending: false });

  // Tài khoản owner từng nhà hàng (để hiển thị + đặt lại mật khẩu).
  const { data: owners } = await admin
    .from("memberships")
    .select("tenant_id, display_name")
    .eq("role", "owner")
    .eq("active", true);
  const ownerByTenant = new Map((owners ?? []).map((o) => [o.tenant_id, o.display_name]));

  const list = tenants ?? [];

  return (
    <div className="mx-auto min-h-screen max-w-4xl bg-canvas px-lg py-xl">
      <header className="flex flex-col gap-md sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-steel">
            Quản trị hệ thống
          </p>
          <h1 className="mt-xxs font-display text-3xl text-ink">Super Admin</h1>
          <p className="mt-xs text-sm text-steel">
            {list.length} nhà hàng đang được quản lý.
          </p>
        </div>
        <div className="flex items-center gap-sm">
          <Button asChild>
            <Link href="/super/new">+ Nhà hàng mới</Link>
          </Button>
          <form action={superSignOut}>
            <Button type="submit" variant="secondary">
              Đăng xuất
            </Button>
          </form>
        </div>
      </header>

      {created && (
        <p
          role="status"
          className="mt-lg rounded-md border border-status-ready bg-status-ready-bg px-md py-sm text-sm text-status-ready"
        >
          Đã tạo nhà hàng “{created}”. Owner có thể đăng nhập tại /r/{created}/admin/login.
        </p>
      )}
      {reset && (
        <p
          role="status"
          className="mt-lg rounded-md border border-status-ready bg-status-ready-bg px-md py-sm text-sm text-status-ready"
        >
          Đã đặt lại mật khẩu cho owner <span className="font-medium">{reset}</span>. Hãy gửi mật khẩu mới cho họ.
        </p>
      )}
      {status && (
        <p
          role="status"
          className="mt-lg rounded-md border border-hairline-soft bg-surface px-md py-sm text-sm text-slate"
        >
          {status}
        </p>
      )}
      {deleted && (
        <p
          role="status"
          className="mt-lg rounded-md border border-hairline-soft bg-surface px-md py-sm text-sm text-slate"
        >
          Đã xoá vĩnh viễn nhà hàng <span className="font-medium">{deleted}</span> và toàn bộ dữ liệu liên quan.
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="mt-lg rounded-md border border-status-late bg-cream-soft px-md py-sm text-sm text-status-late"
        >
          {error}
        </p>
      )}

      <div className="mt-lg divide-y divide-hairline-soft overflow-hidden rounded-lg border border-hairline-soft bg-canvas shadow-card">
        {list.map((t) => {
          const ownerEmail = ownerByTenant.get(t.id);
          const initial = t.name.trim().charAt(0).toUpperCase() || "?";
          const isSuspended = t.status === "suspended";
          return (
            <div
              key={t.id}
              className={cn(
                "p-lg transition-colors hover:bg-surface/60",
                isSuspended && "bg-surface/40"
              )}
            >
              {/* Tầng thông tin: nhà hàng + owner (tự wrap, không ép cột) */}
              <div className="flex flex-wrap items-center justify-between gap-md">
                <div className="flex min-w-0 items-center gap-md">
                  <div
                    className={cn(
                      "grid h-11 w-11 shrink-0 place-items-center rounded-md bg-cream-soft font-display text-xl text-ink",
                      isSuspended && "opacity-60"
                    )}
                  >
                    {initial}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-xs">
                      <span className="font-display text-lg text-ink">{t.name}</span>
                      {isSuspended ? (
                        <span className="inline-flex items-center gap-xxs rounded-full bg-cream-soft px-xs py-[2px] text-xs text-steel">
                          <span className="h-1.5 w-1.5 rounded-full bg-steel" aria-hidden />
                          tạm ngưng
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-xxs rounded-full bg-surface px-xs py-[2px] text-xs text-slate">
                          <span className="h-1.5 w-1.5 rounded-full bg-status-ready" aria-hidden />
                          active
                        </span>
                      )}
                    </div>
                    <div className="mt-xxs flex flex-wrap items-center gap-xs text-xs text-steel">
                      <span className="font-mono text-slate">{t.slug}</span>
                      <span aria-hidden>·</span>
                      <Link
                        href={`/r/${t.slug}/admin/login`}
                        className="whitespace-nowrap text-primary underline-offset-4 hover:underline"
                      >
                        Vào khu admin →
                      </Link>
                    </div>
                  </div>
                </div>

                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-wide text-muted">Owner</p>
                  <p className="mt-xxs truncate text-sm text-slate">{ownerEmail ?? "—"}</p>
                </div>
              </div>

              {/* Tầng hành động: full-width, panel bung thoải mái bên dưới */}
              <div className="mt-md flex flex-wrap items-start gap-xs border-t border-hairline-soft pt-md">
                {ownerEmail && (
                  <details className="group w-full sm:w-auto">
                    <summary
                      className={cn(
                        buttonVariants({ variant: "secondary", size: "sm" }),
                        "w-full cursor-pointer list-none sm:w-auto [&::-webkit-details-marker]:hidden"
                      )}
                    >
                      Đổi mật khẩu
                    </summary>
                    <form
                      action={resetOwnerPassword}
                      className="mt-sm flex flex-wrap items-center gap-xs rounded-md border border-hairline-soft bg-surface p-sm"
                    >
                      <input type="hidden" name="tenant_id" value={t.id} />
                      <Input
                        name="password"
                        type="text"
                        required
                        minLength={8}
                        placeholder="Mật khẩu mới (≥ 8 ký tự)"
                        autoComplete="off"
                        className="h-9 w-full sm:w-52"
                      />
                      <SubmitButton size="sm" pendingLabel="Đang đổi…">
                        Lưu
                      </SubmitButton>
                    </form>
                  </details>
                )}

                <form action={setTenantStatus} className="w-full sm:w-auto">
                  <input type="hidden" name="tenant_id" value={t.id} />
                  <input
                    type="hidden"
                    name="status"
                    value={isSuspended ? "active" : "suspended"}
                  />
                  <SubmitButton
                    variant="secondary"
                    size="sm"
                    className="w-full sm:w-auto"
                    pendingLabel="…"
                  >
                    {isSuspended ? "Kích hoạt" : "Tạm ngưng"}
                  </SubmitButton>
                </form>

                {isSuspended && (
                  <details className="w-full sm:w-auto">
                    <summary
                      className={cn(
                        buttonVariants({ variant: "secondary", size: "sm" }),
                        "w-full cursor-pointer list-none border-status-late/40 text-status-late hover:bg-cream-soft sm:w-auto [&::-webkit-details-marker]:hidden"
                      )}
                    >
                      Xoá vĩnh viễn
                    </summary>
                    <form
                      action={deleteTenant}
                      className="mt-sm flex max-w-md flex-col gap-xs rounded-md border border-status-late/30 bg-cream-soft p-sm"
                    >
                      <input type="hidden" name="tenant_id" value={t.id} />
                      <p className="text-xs text-slate">
                        Xoá toàn bộ dữ liệu nhà hàng, không hồi phục. Gõ{" "}
                        <span className="font-mono font-medium text-ink">{t.slug}</span> để xác nhận.
                      </p>
                      <div className="flex flex-wrap items-center gap-xs">
                        <Input
                          name="confirm_slug"
                          type="text"
                          required
                          placeholder={t.slug}
                          autoComplete="off"
                          className="h-9 w-full sm:w-44"
                        />
                        <SubmitButton
                          variant="secondary"
                          size="sm"
                          className="border-status-late/50 text-status-late hover:bg-cream-deeper"
                          pendingLabel="Đang xoá…"
                        >
                          Xoá
                        </SubmitButton>
                      </div>
                    </form>
                  </details>
                )}
              </div>
            </div>
          );
        })}

        {list.length === 0 && (
          <div className="flex flex-col items-center gap-sm p-xxl text-center">
            <div className="grid h-12 w-12 place-items-center rounded-full bg-cream-soft font-display text-xl text-steel">
              +
            </div>
            <p className="text-sm text-steel">Chưa có nhà hàng nào.</p>
            <Button asChild size="sm">
              <Link href="/super/new">Tạo nhà hàng đầu tiên</Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
