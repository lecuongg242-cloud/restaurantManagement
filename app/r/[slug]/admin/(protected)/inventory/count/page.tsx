import { getSessionMembership } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { CountForm } from "@/components/admin/inventory/CountForm";
import { costContext, loadInventory } from "@/lib/inventory/data";
import { unitCost } from "@/lib/inventory/cost";
import { businessDate } from "@/lib/inventory/day";
import { gioVn } from "@/lib/time/vn";
import { BASE_UNIT_LABEL, type Ingredient } from "@/lib/inventory/types";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { cancelWaste, recordWaste } from "../actions";

export const dynamic = "force-dynamic";

const fmt = (n: number) => n.toLocaleString("vi-VN", { maximumFractionDigits: 2 });
const unitOf = (i: Ingredient) => i.purchase_unit ?? BASE_UNIT_LABEL[i.base_unit];
/** Hệ số từ đơn vị gốc ra đơn vị hiện trên form (đơn vị nhập nếu có). */
const factorOf = (i: Ingredient) => (i.purchase_unit ? i.purchase_factor : 1);
const inPurchase = (i: Ingredient, qty: number) => `${fmt(qty / factorOf(i))} ${unitOf(i)}`;

const REASON_LABEL: Record<string, string> = {
  hong: "Hỏng / hết hạn",
  do_bo: "Đổ bỏ / rơi vỡ",
  com_nhan_vien: "Cơm nhân viên",
  khac: "Khác",
};

const SELECT =
  "h-11 w-full min-w-0 rounded-md border border-hairline-strong bg-canvas px-md text-base text-ink sm:text-sm focus-visible:border-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary";

/** Kiểm kê cuối ngày + xuất hủy (INV-08). Chốt sổ tự chạy khi mở khu này (layout). */
export default async function CountPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = (await getSessionMembership(slug))!;
  const tenantId = session.tenant.id;
  const supabase = await createClient();
  const today = businessDate();

  const [data, onHand, wasteToday, lastClose] = await Promise.all([
    loadInventory(supabase, tenantId),
    supabase.rpc("inventory_on_hand", { p_tenant: tenantId }),
    supabase
      .from("stock_entries")
      .select("id, ingredient_id, qty, reason, note, created_at")
      .eq("tenant_id", tenantId)
      .eq("kind", "waste")
      .eq("business_date", today)
      .order("created_at", { ascending: false }),
    supabase
      .from("daily_closes")
      .select("business_date, closed_at")
      .eq("tenant_id", tenantId)
      .order("business_date", { ascending: false })
      .limit(1),
  ]);

  const theo = new Map(
    ((onHand.data ?? []) as { ingredient_id: string; on_hand: number }[]).map((r) => [r.ingredient_id, Number(r.on_hand)])
  );
  const active = data.ingredients.filter((i) => i.active);
  const toCount = active.filter((i) => i.must_count);
  const byId = new Map(data.ingredients.map((i) => [i.id, i]));
  const ctx = costContext(data);
  const [y, m, d] = today.split("-");
  const lc = lastClose.data?.[0];

  return (
    <div className="flex flex-col gap-xl">
      <p className="rounded-md bg-surface px-md py-sm text-sm text-slate">
        Kiểm kê và phiếu hủy lúc này tính cho <strong>ngày {d}/{m}/{y}</strong> (ngày cắt lúc 00:00).
        {lc && (
          <>
            {" "}Đã chốt sổ tới hết ngày {lc.business_date.split("-").reverse().join("/")} — ngày trôi qua tự chốt khi mở trang này.
          </>
        )}
      </p>

      <Card>
        <h2 className="font-semibold text-lg text-ink">Kiểm kê cuối ngày</h2>
        <p className="mt-xxs text-sm text-steel">
          Chỉ đếm nguyên liệu đã đánh dấu &quot;cần kiểm&quot;. Số thực tế thay cho tồn kho trên sổ. Không kiểm cũng được — khi
          đó sẽ không có số hao hụt thật.
        </p>
        <div className="mt-md">
          {toCount.length === 0 ? (
            <p className="text-sm text-steel">Chưa có nguyên liệu nào đánh dấu &quot;cần kiểm&quot; (sửa ở tab Nguyên liệu).</p>
          ) : (
            <CountForm
              slug={slug}
              rows={toCount.map((i) => ({
                id: i.id,
                name: i.name,
                unit: unitOf(i),
                // Đơn vị nhập khác đơn vị trừ kho (thùng ≠ chai) → dòng có ô chọn đơn vị đếm (P26, như KiotViet).
                baseUnit: factorOf(i) !== 1 ? BASE_UNIT_LABEL[i.base_unit] : null,
                factor: factorOf(i),
                theoreticalBase: theo.get(i.id) ?? 0,
                // Giá trị lệch theo giá vốn hiện tại (KiotViet: "giá vốn tại thời điểm tạo phiếu kiểm kho").
                unitPriceBase: unitCost(i.id, ctx).cost,
              }))}
            />
          )}
        </div>
      </Card>

      <Card>
        <h2 className="font-semibold text-lg text-ink">Xuất hủy</h2>
        <p className="mt-xxs text-sm text-steel">Đồ hỏng, đổ bỏ, cơm nhân viên — ghi để báo cáo hao hụt nói được hụt vì đâu.</p>
        <form action={recordWaste} className="mt-md grid grid-cols-1 gap-sm sm:grid-cols-2">
          <input type="hidden" name="slug" value={slug} />
          <label className="flex flex-col gap-xxs text-sm text-slate">
            Nguyên liệu
            <select name="ingredient_id" required defaultValue="" className={SELECT}>
              <option value="" disabled>— Chọn —</option>
              {active.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} ({unitOf(i)})
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-xxs text-sm text-slate">
            Lượng (theo đơn vị trong ngoặc)
            <Input name="qty" required inputMode="decimal" placeholder="0,5" />
          </label>
          <label className="flex flex-col gap-xxs text-sm text-slate">
            Lý do
            <select name="reason" required defaultValue="" className={SELECT}>
              <option value="" disabled>— Chọn —</option>
              {Object.entries(REASON_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-xxs text-sm text-slate">
            Ghi chú (bắt buộc khi chọn &quot;Khác&quot;)
            <Input name="note" placeholder="Rau héo cuối ngày" />
          </label>
          <div className="flex justify-end sm:col-span-2">
            <SubmitButton size="sm" className="h-11 sm:h-9" pendingLabel="Đang ghi…">
              Ghi phiếu hủy
            </SubmitButton>
          </div>
        </form>

        {(wasteToday.data ?? []).length > 0 && (
          <h3 className="mt-lg text-sm font-medium text-ink">Phiếu hủy hôm nay</h3>
        )}
        {(wasteToday.data ?? []).length > 0 && (
          <ul className="mt-xs divide-y divide-hairline-soft text-sm" data-phieu-huy>
            {(wasteToday.data ?? []).map((w) => {
              const ing = byId.get(w.ingredient_id as string);
              return (
                <li key={w.id as string} className="flex flex-wrap justify-between gap-sm py-xs">
                  <span className="text-ink">
                    {gioVn(w.created_at as string)} · {ing?.name ?? "?"} · {REASON_LABEL[w.reason as string]}
                    {w.note ? ` — ${w.note}` : ""}
                  </span>
                  <span className="flex items-center gap-sm">
                    <span className="tabular-nums text-status-late">{ing ? inPurchase(ing, -Number(w.qty)) : ""}</span>
                    {/* Ghi nhầm thì Hủy (như KiotViet "Xuất hủy → Hủy": cộng lại tồn kho) rồi ghi lại phiếu đúng. */}
                    <form action={cancelWaste}>
                      <input type="hidden" name="slug" value={slug} />
                      <input type="hidden" name="id" value={w.id as string} />
                      <ConfirmSubmit
                        message={`Hủy phiếu hủy ${ing?.name ?? ""} ${ing ? inPurchase(ing, -Number(w.qty)) : ""}? Tồn kho được cộng lại.`}
                        className="inline-flex min-h-11 items-center rounded-md px-sm text-sm text-status-late hover:bg-surface sm:min-h-9"
                      >
                        Hủy
                      </ConfirmSubmit>
                    </form>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
