import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeftRight, Building2, ChevronRight, Contact, Package, Printer, QrCode, Settings, Users, Wallet } from "lucide-react";
import { getSessionMembership } from "@/lib/auth/session";
import { canManage, type ManageSection } from "@/lib/auth/rbac";
import { createClient } from "@/lib/supabase/server";
import { quanCuaToi } from "@/lib/quan-ly/quan";
import { quanLySignOut } from "@/app/quan-ly/actions";
import { HuongDanIphone, DongPhienBan } from "@/components/quan-ly/ThietBi";

export const dynamic = "force-dynamic";

const QUAN_TRI: { chu: string; duong: string; quyen: ManageSection; Icon: typeof Package }[] = [
  { chu: "Kho hàng", duong: "inventory/stock", quyen: "inventory", Icon: Package },
  { chu: "Sổ quỹ", duong: "so-quy", quyen: "cashbook", Icon: Wallet },
  { chu: "Khách hàng", duong: "khach-hang", quyen: "customers", Icon: Contact },
  { chu: "Nhân viên", duong: "staff", quyen: "staff", Icon: Users },
  { chu: "Bàn & QR", duong: "tables", quyen: "tables", Icon: QrCode },
  { chu: "Máy in", duong: "printers", quyen: "printers", Icon: Printer },
  { chu: "Chi nhánh", duong: "chi-nhanh", quyen: "branches", Icon: Building2 },
  { chu: "Cài đặt", duong: "settings", quyen: "settings", Icon: Settings },
];

/**
 * Tab Thêm (P30, Giao diện B9): tài khoản, lối sang trang quản trị đầy đủ (mở ngay trong app, cùng phiên), đổi quán,
 * hướng dẫn cài lên iPhone, đăng xuất, phiên bản. Mục nào vai trò không có quyền thì ẩn — như menu admin.
 */
export default async function ThemPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await getSessionMembership(slug);
  if (!session) redirect("/quan-ly");
  const supabase = await createClient();
  const [
    {
      data: { user },
    },
    quan,
  ] = await Promise.all([supabase.auth.getUser(), quanCuaToi()]);

  return (
    <div className="flex flex-col gap-md">
      <section className="rounded-lg border border-hairline-soft bg-canvas p-md shadow-card">
        <p className="font-medium text-ink">{session.displayName ?? user?.email}</p>
        <p className="text-sm text-steel">{user?.email}</p>
        <p className="mt-xxs text-sm text-steel">
          {session.role === "owner" ? "Chủ quán" : "Quản lý"} · {session.tenant.name}
        </p>
      </section>

      <section>
        <h2 className="mb-xs px-xxs text-xs font-medium uppercase tracking-wide text-steel">Quản trị đầy đủ</h2>
        <ul className="divide-y divide-hairline-soft overflow-hidden rounded-lg border border-hairline-soft bg-canvas shadow-card">
          {QUAN_TRI.filter((m) => canManage(session.role, m.quyen)).map(({ chu, duong, Icon }) => (
            <li key={duong}>
              <Link href={`/r/${slug}/admin/${duong}`} className="flex min-h-12 items-center gap-sm px-md active:bg-cream-soft">
                <Icon className="size-5 text-steel" aria-hidden />
                <span className="flex-1 text-sm text-ink">{chu}</span>
                <ChevronRight className="size-4 text-steel" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {quan.length > 1 && (
        <Link href="/quan-ly/chon-quan" className="flex min-h-12 items-center gap-sm rounded-lg border border-hairline-soft bg-canvas px-md shadow-card active:bg-cream-soft">
          <ArrowLeftRight className="size-5 text-steel" aria-hidden />
          <span className="flex-1 text-sm text-ink">Đổi quán / chi nhánh</span>
          <ChevronRight className="size-4 text-steel" aria-hidden />
        </Link>
      )}

      <HuongDanIphone />

      <form action={quanLySignOut}>
        <button className="min-h-12 w-full rounded-lg border border-hairline-strong bg-canvas text-sm font-medium text-status-late">Đăng xuất</button>
      </form>
      <DongPhienBan />
    </div>
  );
}
