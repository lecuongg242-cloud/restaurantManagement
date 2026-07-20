import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/env";
import { SetupNotice } from "@/components/setup-notice";
import { MenuView } from "@/components/menu/menu-view";
import { fetchCustomerMenu } from "@/lib/menu";
import { notFound } from "next/navigation";

export default async function CustomerMenuPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!hasSupabaseEnv()) return <SetupNotice />;
  const supabase = await createClient();

  const { data: tenant } = await supabase
    .from("tenant_public_info")
    .select("id, name, logo_url, address, phone")
    .eq("slug", slug)
    .maybeSingle();
  if (!tenant) notFound();

  const menu = await fetchCustomerMenu(supabase, tenant.id);

  return (
    <main className="flex flex-1 flex-col">
      <MenuView tenant={tenant} initialMenu={menu} />
    </main>
  );
}
