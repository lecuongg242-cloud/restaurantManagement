import Link from "next/link";
import { redirect } from "next/navigation";
import { isSuperAdmin } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { superSignOut } from "./actions";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function SuperHome({
  searchParams,
}: {
  searchParams: Promise<{ created?: string }>;
}) {
  const su = await isSuperAdmin();
  if (!su) redirect("/super/login");
  const { created } = await searchParams;

  // Danh sách tenant (super-admin xem toàn cục qua service role).
  const admin = createAdminClient();
  const { data: tenants } = await admin
    .from("tenants")
    .select("id, slug, name, status, created_at")
    .order("created_at", { ascending: false });

  return (
    <div className="mx-auto min-h-screen max-w-3xl bg-canvas p-lg">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl text-ink">Super Admin</h1>
          <p className="mt-xxs text-sm text-steel">Quản trị hệ thống — danh sách nhà hàng.</p>
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
      </div>

      {created && (
        <p
          role="status"
          className="mt-md rounded-md border border-status-ready bg-status-ready-bg px-md py-sm text-sm text-status-ready"
        >
          Đã tạo nhà hàng “{created}”. Owner có thể đăng nhập tại /r/{created}/admin/login.
        </p>
      )}

      <div className="mt-lg overflow-hidden rounded-lg border border-hairline-soft">
        <table className="w-full text-sm">
          <thead className="bg-surface text-left text-steel">
            <tr>
              <th className="px-md py-sm font-medium">Tên</th>
              <th className="px-md py-sm font-medium">Slug</th>
              <th className="px-md py-sm font-medium">Trạng thái</th>
              <th className="px-md py-sm font-medium">Admin</th>
            </tr>
          </thead>
          <tbody>
            {(tenants ?? []).map((t) => (
              <tr key={t.id} className="border-t border-hairline-soft">
                <td className="px-md py-sm text-ink">{t.name}</td>
                <td className="px-md py-sm font-mono text-xs text-slate">{t.slug}</td>
                <td className="px-md py-sm text-slate">{t.status}</td>
                <td className="px-md py-sm">
                  <Link
                    href={`/r/${t.slug}/admin/login`}
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    /r/{t.slug}/admin
                  </Link>
                </td>
              </tr>
            ))}
            {(tenants ?? []).length === 0 && (
              <tr>
                <td colSpan={4} className="px-md py-lg text-center text-steel">
                  Chưa có nhà hàng nào. Bấm “Nhà hàng mới”.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
