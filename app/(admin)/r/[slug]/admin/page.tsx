import Link from "next/link";
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
    .select("name")
    .eq("slug", slug)
    .maybeSingle();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-bold">
          Quản trị — {tenant?.name ?? slug}
        </h1>
        <p className="text-sm opacity-70">Dành cho chủ nhà hàng và quản lý.</p>
      </header>
      <nav className="grid gap-3 sm:grid-cols-2">
        <Link
          href={`/r/${slug}/admin/staff`}
          className="rounded-xl border border-foreground/15 p-4 hover:border-foreground/50"
        >
          <h2 className="font-semibold">Nhân viên</h2>
          <p className="text-sm opacity-70">Mời, phân vai trò, khóa tài khoản</p>
        </Link>
        <div className="rounded-xl border border-dashed border-foreground/20 p-4 opacity-60">
          <h2 className="font-semibold">Menu & bàn</h2>
          <p className="text-sm">Được xây ở giai đoạn P2</p>
        </div>
      </nav>
    </main>
  );
}
