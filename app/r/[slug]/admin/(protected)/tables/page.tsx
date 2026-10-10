import { redirect } from "next/navigation";
import { getSessionMembership } from "@/lib/auth/session";
import { canManage, defaultRouteForRole } from "@/lib/auth/rbac";
import { createClient } from "@/lib/supabase/server";
import { AreaTableManager } from "./AreaTableManager";
import type { Area, Table } from "@/lib/tables/types";

export const dynamic = "force-dynamic";

export default async function TablesPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const { slug } = await params;
  const { error, ok } = await searchParams;

  const session = await getSessionMembership(slug);
  if (!session) redirect(`/r/${slug}/admin/login`);
  if (!canManage(session.role, "tables")) {
    redirect(defaultRouteForRole(slug, session.role));
  }

  const supabase = await createClient();
  const [{ data: areas }, { data: tables }] = await Promise.all([
    supabase
      .from("areas")
      .select("*")
      .eq("tenant_id", session.tenant.id)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("tables")
      .select("*")
      .eq("tenant_id", session.tenant.id)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);

  return (
    <AreaTableManager slug={slug} areas={(areas ?? []) as Area[]} tables={(tables ?? []) as Table[]}>
      {error && (
        <p
          role="alert"
          className="mt-md rounded-md border border-status-late bg-cream-soft px-md py-sm text-sm text-status-late"
        >
          {error}
        </p>
      )}
      {ok && (
        <p
          role="status"
          className="mt-md rounded-md border border-status-ready bg-status-ready-bg px-md py-sm text-sm text-status-ready"
        >
          {ok}
        </p>
      )}
    </AreaTableManager>
  );
}
