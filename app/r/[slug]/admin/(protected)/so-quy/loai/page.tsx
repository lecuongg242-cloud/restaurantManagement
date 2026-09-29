import Link from "next/link";
import { getSessionMembership } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { loadCategories, type CashCategory } from "@/lib/cashbook/data";
import { COST_GROUP_LABEL, type CostGroup } from "@/lib/cashbook/labels";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { saveCategory, setCategoryActive } from "../actions";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const GROUPS = Object.keys(COST_GROUP_LABEL) as CostGroup[];
const select = "h-9 min-w-0 rounded-md border border-hairline-strong bg-canvas px-sm text-sm text-ink";

/**
 * Loại thu chi (CASH-02, QD-027 D10). Quán tự quyết khoản nào tính vào kết quả kinh doanh và thuộc mục chi phí nào của sổ
 * S2c (chủ dự án 29/09/2026: "số liệu sẽ do người dùng cấu hình") — hệ thống không phán xét chứng từ.
 */
export default async function CategoriesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = (await getSessionMembership(slug))!;
  const cats = await loadCategories(await createClient(), session.tenant.id);

  const block = (direction: "out" | "in", title: string, rows: CashCategory[]) => (
    <Card>
      <h2 className="text-base font-medium text-ink">{title}</h2>
      <ul className="mt-sm divide-y divide-hairline-soft">
        {rows.map((c) => (
          <li key={c.id} className={cn("flex flex-wrap items-center gap-sm py-xs", !c.active && "opacity-60")}>
            <form action={saveCategory} className="flex flex-1 flex-wrap items-center gap-sm">
              <input type="hidden" name="slug" value={slug} />
              <input type="hidden" name="id" value={c.id} />
              <Input name="name" defaultValue={c.name} maxLength={60} className="h-9 w-48" aria-label="Tên loại" />
              {direction === "out" && (
                <select name="cost_group" defaultValue={c.cost_group} className={cn(select, "w-80 max-w-full")} aria-label="Mục chi phí">
                  {GROUPS.map((g) => (
                    <option key={g} value={g}>
                      {COST_GROUP_LABEL[g]}
                    </option>
                  ))}
                </select>
              )}
              {direction === "in" && <input type="hidden" name="cost_group" value="none" />}
              <label className="inline-flex items-center gap-xxs text-sm text-slate">
                <input type="checkbox" name="default_in_pnl" defaultChecked={c.default_in_pnl} /> Hạch toán
              </label>
              <SubmitButton size="sm" variant="secondary" pendingLabel="…">Lưu</SubmitButton>
            </form>
            <form action={setCategoryActive}>
              <input type="hidden" name="slug" value={slug} />
              <input type="hidden" name="id" value={c.id} />
              <input type="hidden" name="active" value={c.active ? "false" : "true"} />
              <button type="submit" className="text-sm text-steel hover:underline">
                {c.active ? "Ngừng dùng" : "Dùng lại"}
              </button>
            </form>
          </li>
        ))}
      </ul>
      <form action={saveCategory} className="mt-md flex flex-wrap items-center gap-sm border-t border-hairline-soft pt-md">
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="direction" value={direction} />
        <Input name="name" required maxLength={60} placeholder={direction === "out" ? "Tên loại chi mới" : "Tên loại thu mới"} className="h-9 w-48" />
        {direction === "out" ? (
          <select name="cost_group" defaultValue="e" className={cn(select, "w-80 max-w-full")} aria-label="Mục chi phí">
            {GROUPS.map((g) => (
              <option key={g} value={g}>
                {COST_GROUP_LABEL[g]}
              </option>
            ))}
          </select>
        ) : (
          <input type="hidden" name="cost_group" value="none" />
        )}
        <label className="inline-flex items-center gap-xxs text-sm text-slate">
          <input type="checkbox" name="default_in_pnl" defaultChecked /> Hạch toán
        </label>
        <SubmitButton size="sm" pendingLabel="…">+ Thêm</SubmitButton>
      </form>
    </Card>
  );

  return (
    <div className="flex flex-col gap-lg">
      <header>
        <Link href={`/r/${slug}/admin/so-quy`} className="text-sm text-primary">
          ‹ Sổ quỹ
        </Link>
        <h1 className="mt-xxs font-display text-2xl text-ink">Loại thu chi</h1>
        <p className="text-sm text-steel">
          &quot;Hạch toán&quot; = mặc định tính vào Kết quả kinh doanh (từng phiếu vẫn bỏ chọn được). Mục chi phí dùng khi xuất sổ
          chi phí. Đổi ở đây không đổi phiếu đã lập.
        </p>
      </header>
      {block("out", "Loại chi", cats.filter((c) => c.direction === "out"))}
      {block("in", "Loại thu", cats.filter((c) => c.direction === "in"))}
    </div>
  );
}
