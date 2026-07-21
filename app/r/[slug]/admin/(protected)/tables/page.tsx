import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionMembership } from "@/lib/auth/session";
import { canManage, defaultRouteForRole } from "@/lib/auth/rbac";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
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

  const areaList = (areas ?? []) as Area[];
  const tableList = (tables ?? []) as Table[];
  const byArea = new Map<string | null, Table[]>();
  for (const t of tableList) {
    const key = t.area_id;
    const arr = byArea.get(key) ?? [];
    arr.push(t);
    byArea.set(key, arr);
  }

  const groups = [
    ...areaList.map((area) => ({ area, tables: byArea.get(area.id) ?? [] })),
    ...(byArea.get(null)?.length ? [{ area: null, tables: byArea.get(null)! }] : []),
  ];

  return (
    <div className="w-full">
      <div className="flex flex-wrap items-end justify-between gap-md">
        <div>
          <h1 className="font-display text-2xl text-ink">Bàn & QR</h1>
          <p className="mt-xxs text-sm text-steel">
            Khai báo khu vực và bàn. Mỗi bàn có mã QR riêng trỏ tới menu gọi món.
          </p>
        </div>
        {tableList.length > 0 && (
          <Button asChild variant="primary" size="sm">
            <Link href={`/r/${slug}/print/qr`} target="_blank" rel="noopener">
              Xuất QR ({tableList.length} bàn)
            </Link>
          </Button>
        )}
      </div>

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

      <AreaTableManager slug={slug} areas={areaList} groups={groups} />
    </div>
  );
}
