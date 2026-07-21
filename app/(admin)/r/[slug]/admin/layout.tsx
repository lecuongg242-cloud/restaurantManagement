import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/env";
import { AdminNav } from "@/components/admin/admin-nav";

/** Khung khu quản trị: sidebar (desktop) / thanh ngang (mobile) + nội dung. */
export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  let tenantName = slug;
  if (hasSupabaseEnv()) {
    const supabase = await createClient();
    const { data: tenant } = await supabase
      .from("tenants")
      .select("name")
      .eq("slug", slug)
      .maybeSingle();
    if (tenant) tenantName = tenant.name;
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col md:flex-row">
      <AdminNav slug={slug} tenantName={tenantName} />
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
