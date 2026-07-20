import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/env";
import { SetupNotice } from "@/components/setup-notice";

export default async function AdminPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!hasSupabaseEnv()) return <SetupNotice />;
  const supabase = await createClient();
  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, name")
    .eq("slug", slug)
    .maybeSingle();

  // Tenant chưa có dữ liệu → tự mở wizard onboarding (thiết kế P2 §6),
  // trừ khi chủ quán đã bấm "Để sau".
  if (tenant) {
    const dismissed = (await cookies()).get(`onb-skip-${slug}`)?.value === "1";
    if (!dismissed) {
      const [{ count: catCount }, { count: areaCount }] = await Promise.all([
        supabase
          .from("menu_categories")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenant.id),
        supabase
          .from("areas")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenant.id),
      ]);
      if ((catCount ?? 0) === 0 && (areaCount ?? 0) === 0) {
        redirect(`/r/${slug}/admin/onboarding`);
      }
    }
  }

  const card =
    "rounded-card border border-border p-4 hover:border-foreground";

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-bold">
          Quản trị — {tenant?.name ?? slug}
        </h1>
        <p className="text-sm opacity-70">Dành cho chủ nhà hàng và quản lý.</p>
      </header>
      <nav className="grid gap-3 sm:grid-cols-2">
        <Link href={`/r/${slug}/admin/menu`} className={card}>
          <h2 className="font-semibold">Menu</h2>
          <p className="text-sm opacity-70">Danh mục, món, giá, ảnh, hết món</p>
        </Link>
        <Link href={`/r/${slug}/admin/tables`} className={card}>
          <h2 className="font-semibold">Khu vực &amp; bàn</h2>
          <p className="text-sm opacity-70">Sơ đồ khu vực, bàn, in mã QR</p>
        </Link>
        <Link href={`/r/${slug}/admin/staff`} className={card}>
          <h2 className="font-semibold">Nhân viên</h2>
          <p className="text-sm opacity-70">Mời, phân vai trò, khóa tài khoản</p>
        </Link>
        <Link href={`/r/${slug}/admin/onboarding`} className={card}>
          <h2 className="font-semibold">Thiết lập nhà hàng</h2>
          <p className="text-sm opacity-70">Wizard 4 bước cho nhà hàng mới</p>
        </Link>
      </nav>
      <a
        href={`/r/${slug}`}
        target="_blank"
        rel="noopener"
        className="text-sm underline opacity-70"
      >
        Xem menu như khách ↗
      </a>
    </main>
  );
}
