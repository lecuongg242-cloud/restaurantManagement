import { isSuperAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { listLeads } from "@/lib/marketing/leads";
import { canThuTien, docQuan } from "@/lib/super/tong-hop";
import { docCauIn } from "./BridgeTable";
import { SuperShell } from "@/components/super/SuperShell";

export const dynamic = "force-dynamic";

/**
 * Khung mọi trang /super. Chưa phải super-admin (trang đăng nhập) → trả trang trần, không sidebar; từng
 * trang vẫn tự kiểm quyền và đá về /super/login như trước.
 */
export default async function SuperLayout({ children }: { children: React.ReactNode }) {
  const su = await isSuperAdmin();
  if (!su) return <>{children}</>;

  const supabase = await createClient();
  const [{ data: auth }, { quan }, leads] = await Promise.all([supabase.auth.getUser(), docQuan(), listLeads()]);
  const { danhSach } = await docCauIn(quan);

  const badges = {
    "/super/thue-bao": quan.filter(canThuTien).length,
    "/super/cau-in": danhSach.filter((d) => d.hang.canChuY && !d.t.khoa).length,
    "/super/leads": leads.filter((l) => l.status === "new").length,
  };

  return (
    <SuperShell email={auth.user?.email ?? null} badges={badges}>
      {children}
    </SuperShell>
  );
}
