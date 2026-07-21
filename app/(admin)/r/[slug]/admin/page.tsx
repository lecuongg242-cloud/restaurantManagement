import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/env";
import { SetupNotice } from "@/components/setup-notice";
import { eyebrow } from "@/lib/ui";

const SECTIONS = [
  {
    href: "menu",
    title: "Menu",
    desc: "Danh mục, món, giá, ảnh, hết món",
    dot: "bg-id-customer",
  },
  {
    href: "tables",
    title: "Khu vực & bàn",
    desc: "Sơ đồ khu vực, bàn, in mã QR",
    dot: "bg-id-pos",
  },
  {
    href: "staff",
    title: "Nhân viên",
    desc: "Mời, phân vai trò, khóa tài khoản",
    dot: "bg-id-admin",
  },
  {
    href: "onboarding",
    title: "Thiết lập nhà hàng",
    desc: "Wizard 4 bước cho nhà hàng mới",
    dot: "bg-id-online",
  },
] as const;

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
      const [catRes, areaRes] = await Promise.all([
        supabase
          .from("menu_categories")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenant.id),
        supabase
          .from("areas")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenant.id),
      ]);
      // Chỉ tự mở wizard khi đếm được thật sự (query lỗi — ví dụ thiếu
      // migration 0002 — thì ở lại trang tổng quan).
      if (
        !catRes.error &&
        !areaRes.error &&
        (catRes.count ?? 0) === 0 &&
        (areaRes.count ?? 0) === 0
      ) {
        redirect(`/r/${slug}/admin/onboarding`);
      }
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-6">
      <header className="pt-2">
        <p className={eyebrow}>
          <span className="h-2 w-2 rounded-full bg-id-admin" />
          Quản trị · {tenant?.name ?? slug}
        </p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">Tổng quan</h1>
        <p className="mt-1 text-sm text-muted">
          Dành cho chủ nhà hàng và quản lý.
        </p>
      </header>
      <nav className="grid gap-3 sm:grid-cols-2">
        {SECTIONS.map((s) => (
          <Link
            key={s.href}
            href={`/r/${slug}/admin/${s.href}`}
            className="group rounded-2xl border border-border p-5 transition-colors duration-200 hover:border-foreground"
          >
            <p className="flex items-center gap-2 font-semibold">
              <span className={`h-2 w-2 rounded-full ${s.dot}`} />
              {s.title}
              <span className="ml-auto text-muted transition-transform duration-200 group-hover:translate-x-0.5">
                →
              </span>
            </p>
            <p className="mt-1 text-sm text-muted">{s.desc}</p>
          </Link>
        ))}
      </nav>
    </main>
  );
}
