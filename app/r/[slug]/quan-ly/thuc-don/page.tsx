import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { getSessionMembership } from "@/lib/auth/session";
import { canManage } from "@/lib/auth/rbac";
import { createClient } from "@/lib/supabase/server";
import { ThucDonDienThoai, type MonDT } from "@/components/quan-ly/ThucDonDienThoai";
import { Trong } from "@/components/quan-ly/Khoi";

export const dynamic = "force-dynamic";

/**
 * Tab Thực đơn (P30, MGR-05, Giao diện B8 — chốt 04/10/2026: công tắc Còn/Hết + sửa tên, giá, nhóm). Ghi qua CHÍNH server
 * action của trang Thực đơn admin (`setItemAvailable`, `updateItem`) — cùng kiểm quyền, cùng khóa giá chuỗi. Thêm món mới
 * (ảnh, tùy chọn, công thức) → trang Thực đơn admin.
 */
export default async function ThucDonPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await getSessionMembership(slug);
  if (!session) redirect("/quan-ly");
  const supabase = await createClient();
  const [{ data: nhom }, { data: mon }] = await Promise.all([
    supabase.from("menu_categories").select("id, name").eq("tenant_id", session.tenant.id).order("sort_order").order("created_at"),
    supabase
      .from("menu_items")
      .select("id, name, description, base_price, is_available, category_id")
      .eq("tenant_id", session.tenant.id)
      .order("sort_order")
      .order("created_at"),
  ]);
  const ds: MonDT[] = (mon ?? []).map((m) => ({
    id: m.id as string,
    ten: m.name as string,
    moTa: (m.description as string | null) ?? "",
    gia: Number(m.base_price ?? 0),
    con: Boolean(m.is_available),
    nhomId: m.category_id as string,
  }));

  return (
    <div className="flex flex-col gap-md">
      <div className="flex items-center justify-between gap-sm">
        <h1 className="font-display text-xl text-ink">Thực đơn</h1>
        {canManage(session.role, "menu") && (
          <Link href={`/r/${slug}/admin/menu`} className="inline-flex min-h-10 items-center gap-xxs rounded-md bg-primary px-md text-sm font-medium text-primary-fg">
            <Plus className="size-4" aria-hidden /> Thêm món
          </Link>
        )}
      </div>
      {ds.length === 0 ? (
        <Trong>Quán chưa có món nào. Bấm “Thêm món” để tạo thực đơn.</Trong>
      ) : (
        <ThucDonDienThoai
          slug={slug}
          nhom={(nhom ?? []).map((n) => ({ id: n.id as string, ten: n.name as string }))}
          mon={ds}
          suaDuoc={canManage(session.role, "menu")}
        />
      )}
    </div>
  );
}
