import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionMembership } from "@/lib/auth/session";
import { canManage, defaultRouteForRole } from "@/lib/auth/rbac";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { GroupEditor } from "./GroupEditor";
import { createGroup } from "./actions";
import type { ModifierGroup, ModifierOption, ModifierGroupWithOptions } from "@/lib/menu/types";

export const dynamic = "force-dynamic";

export default async function ModifiersPage({
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
  if (!canManage(session.role, "menu")) {
    redirect(defaultRouteForRole(slug, session.role));
  }

  const supabase = await createClient();
  const [{ data: groups }, { data: options }] = await Promise.all([
    supabase
      .from("modifier_groups")
      .select("*")
      .eq("tenant_id", session.tenant.id)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("modifier_options")
      .select("*")
      .eq("tenant_id", session.tenant.id)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);

  const optByGroup = new Map<string, ModifierOption[]>();
  for (const o of (options ?? []) as ModifierOption[]) {
    const arr = optByGroup.get(o.group_id) ?? [];
    arr.push(o);
    optByGroup.set(o.group_id, arr);
  }
  const groupList: ModifierGroupWithOptions[] = ((groups ?? []) as ModifierGroup[]).map((g) => ({
    ...g,
    options: optByGroup.get(g.id) ?? [],
  }));

  return (
    <div className="w-full">
      <div className="flex flex-wrap items-end justify-between gap-md">
        <div>
          <h1 className="font-display text-2xl text-ink">Nhóm tùy chọn</h1>
          <p className="mt-xxs text-sm text-steel">
            Size, topping, mức đường/đá… kèm phụ thu. Gắn nhóm vào món ở dialog sửa món.
          </p>
        </div>
        <Link
          href={`/r/${slug}/admin/menu`}
          className="text-sm text-primary underline-offset-4 hover:underline"
        >
          ← Về thực đơn
        </Link>
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

      {/* Thêm nhóm */}
      <Card className="mt-lg">
        <form action={createGroup} className="flex flex-wrap items-end gap-sm">
          <input type="hidden" name="slug" value={slug} />
          <label className="flex flex-col gap-xxs text-sm text-slate">
            Tên nhóm
            <Input name="name" required placeholder="Size" className="w-40" />
          </label>
          <label className="flex flex-col gap-xxs text-sm text-slate">
            Chọn tối thiểu
            <Input name="min_select" type="number" min={0} defaultValue={0} className="w-20" />
          </label>
          <label className="flex flex-col gap-xxs text-sm text-slate">
            Chọn tối đa
            <Input name="max_select" type="number" min={0} defaultValue={1} className="w-20" />
          </label>
          <label className="flex items-center gap-xs text-sm text-slate">
            <input
              type="checkbox"
              name="required"
              className="h-4 w-4 rounded border-hairline-strong text-primary"
            />
            Bắt buộc
          </label>
          <SubmitButton size="sm" pendingLabel="Đang thêm…">
            Thêm nhóm
          </SubmitButton>
        </form>
      </Card>

      {groupList.length === 0 && (
        <p className="mt-xl text-center text-steel">
          Chưa có nhóm tùy chọn. Thêm nhóm đầu tiên ở form phía trên.
        </p>
      )}

      <div className="mt-lg flex flex-col gap-md">
        {groupList.map((g) => (
          <GroupEditor key={g.id} slug={slug} group={g} />
        ))}
      </div>
    </div>
  );
}
