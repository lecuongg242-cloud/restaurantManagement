import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { addDays, businessDate, dayStartUtc } from "@/lib/inventory/day";
import { OPEN_DAYS } from "@/lib/inventory/close";
import { oldestOpenDay } from "@/lib/inventory/close-server";

const dm = (day: string) => day.slice(8, 10) + "/" + day.slice(5, 7);

/** Nhắc trước khi ngày có nguyên liệu âm tự chốt (≤ 2 ngày nữa) — kế toán: tồn âm cuối kỳ là còn sót phiếu nhập. */
const WARN_DAYS = 2;

/**
 * Đầu khu Kho hàng (P34, QD-034 D4/D5): sổ đã chốt tới đâu, từ ngày nào còn nhập bổ sung được, và khung vàng khi có nguyên
 * liệu ÂM cuối một ngày sắp tự chốt — nhập phiếu còn thiếu trước khi bản chốt thành bất biến. Không chặn gì.
 */
export async function KhoSoStatus({ tenantId, adminBase }: { tenantId: string; adminBase: string }) {
  const supabase = await createClient();
  const [{ count }, { data: last }] = await Promise.all([
    supabase.from("ingredients").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
    supabase
      .from("daily_closes")
      .select("business_date")
      .eq("tenant_id", tenantId)
      .order("business_date", { ascending: false })
      .limit(1),
  ]);
  if (!count) return null; // quán chưa dùng kho: không nói gì (INV-10)

  const today = businessDate();
  const openFrom = await oldestOpenDay(supabase, tenantId, today);
  const lastClosed = (last?.[0]?.business_date as string | undefined) ?? null;

  // Ngày sẽ tự chốt trong ≤ 2 ngày: ngày D chốt vào D + 7.
  const soon: string[] = [];
  for (let d = openFrom; d <= addDays(today, WARN_DAYS - OPEN_DAYS); d = addDays(d, 1)) soon.push(d);
  const warnings: { day: string; names: string[] }[] = [];
  if (soon.length > 0) {
    const [{ data: ings }, ...ends] = await Promise.all([
      supabase.from("ingredients").select("id, name").eq("tenant_id", tenantId),
      ...soon.map((d) => supabase.rpc("inventory_on_hand", { p_tenant: tenantId, p_at: dayStartUtc(addDays(d, 1)) })),
    ]);
    const nameOf = new Map((ings ?? []).map((i) => [i.id as string, i.name as string]));
    soon.forEach((day, i) => {
      const names = ((ends[i].data ?? []) as { ingredient_id: string; on_hand: number }[])
        .filter((r) => Number(r.on_hand) < 0)
        .map((r) => nameOf.get(r.ingredient_id) ?? "?");
      if (names.length > 0) warnings.push({ day, names });
    });
  }

  return (
    <div className="mt-md flex flex-col gap-xs" data-so-kho>
      <p className="text-sm text-steel">
        Sổ kho tự chốt sau {OPEN_DAYS} ngày.{" "}
        {lastClosed ? <>Đã chốt tới hết {dm(lastClosed)}; </> : null}
        từ {dm(openFrom)} còn nhập bổ sung được.
      </p>
      {warnings.map((w) => (
        <div
          key={w.day}
          role="status"
          data-am-sap-chot
          className="flex flex-wrap items-center justify-between gap-sm rounded-md bg-status-new px-md py-sm text-sm text-status-new-fg"
        >
          <span>
            {w.names.join(", ")} đang âm trên sổ cuối ngày {dm(w.day)}. Ngày {dm(w.day)} sẽ tự chốt vào{" "}
            {dm(addDays(w.day, OPEN_DAYS))} — nhập phiếu còn thiếu trước đó.
          </span>
          <Link
            href={`${adminBase}/nhap-hang/moi`}
            className="inline-flex min-h-9 items-center rounded-md border border-status-new-fg/30 bg-canvas px-md text-ink hover:bg-surface"
          >
            Nhập hàng
          </Link>
        </div>
      ))}
    </div>
  );
}
