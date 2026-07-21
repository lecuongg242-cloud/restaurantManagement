import { getSessionMembership } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = {
  owner: "Chủ",
  manager: "Quản lý",
  cashier: "Thu ngân",
  waiter: "Phục vụ",
  kitchen: "Bếp",
  station: "Trạm",
};

/**
 * Phạm vi dữ liệu (bằng chứng cách ly RLS bấm được — TENANT-02).
 * Truy vấn qua phiên owner (RLS): chỉ thấy dữ liệu tenant hiện tại.
 * Owner A và owner B mở → 2 danh sách khác nhau, không lẫn.
 */
export default async function DataScopePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await getSessionMembership(slug);

  const supabase = await createClient();

  // KHÔNG service role — dùng phiên user để RLS tự lọc.
  const { data: tenants } = await supabase.from("tenants").select("id, slug, name, status");
  const { data: members } = await supabase
    .from("memberships")
    .select("id, display_name, role, active, user_id")
    .order("role", { ascending: true });

  return (
    <div className="w-full max-w-4xl">
      <h1 className="font-display text-2xl text-ink">Phạm vi dữ liệu</h1>
      <p className="mt-xxs text-sm text-steel">
        Đây là toàn bộ dữ liệu mà phiên đăng nhập của bạn có thể thấy (đã lọc bởi RLS).
        Bạn không thể thấy dữ liệu của nhà hàng khác.
      </p>

      <Card className="mt-lg">
        <h2 className="text-sm font-medium text-steel">Nhà hàng bạn thấy</h2>
        <ul className="mt-sm flex flex-col gap-xs">
          {(tenants ?? []).map((t) => (
            <li key={t.id} className="flex items-center gap-sm">
              <Badge variant="orange">{t.name}</Badge>
              <span className="font-mono text-xs text-slate">/r/{t.slug}</span>
              <span className="text-xs text-steel">· {t.status}</span>
            </li>
          ))}
          {(tenants ?? []).length === 0 && (
            <li className="text-sm text-steel">Không có (chưa đăng nhập?).</li>
          )}
        </ul>
      </Card>

      <Card className="mt-md">
        <h2 className="text-sm font-medium text-steel">
          Nhân viên trong phạm vi ({(members ?? []).length})
        </h2>
        <div className="mt-sm overflow-hidden rounded-md border border-hairline-soft">
          <table className="w-full text-sm">
            <thead className="bg-surface text-left text-steel">
              <tr>
                <th className="px-md py-sm font-medium">Tên</th>
                <th className="px-md py-sm font-medium">Vai trò</th>
                <th className="px-md py-sm font-medium">Loại tài khoản</th>
                <th className="px-md py-sm font-medium">Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {(members ?? []).map((m) => (
                <tr key={m.id} className="border-t border-hairline-soft">
                  <td className="px-md py-sm text-ink">{m.display_name ?? "—"}</td>
                  <td className="px-md py-sm text-slate">{ROLE_LABEL[m.role] ?? m.role}</td>
                  <td className="px-md py-sm text-steel">
                    {m.user_id ? "Tài khoản" : "PIN-only"}
                  </td>
                  <td className="px-md py-sm">
                    {m.active ? (
                      <span className="text-status-ready">bật</span>
                    ) : (
                      <span className="text-steel">tắt</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="mt-md text-xs text-steel">
        Bằng chứng: mở trang này bằng owner {session?.tenant.name} chỉ thấy dữ liệu ở trên —
        không có dòng nào của nhà hàng khác. Test tự động: <code>npm run test:rls</code>.
      </p>
    </div>
  );
}
