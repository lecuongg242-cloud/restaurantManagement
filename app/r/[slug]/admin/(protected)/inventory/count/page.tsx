import Link from "next/link";
import { getSessionMembership } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { CountForm, type CountRow } from "@/components/admin/inventory/CountForm";
import { costContext, loadInventory } from "@/lib/inventory/data";
import { unitCost } from "@/lib/inventory/cost";
import { businessDate, dayStartUtc } from "@/lib/inventory/day";
import { oldestOpenDay } from "@/lib/inventory/close-server";
import { formatVnd } from "@/lib/orders/cart";
import { gioNgayVn } from "@/lib/time/vn";
import { BASE_UNIT_LABEL, type Ingredient } from "@/lib/inventory/types";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { cancelCount, cancelWaste, recordWaste } from "../actions";

export const dynamic = "force-dynamic";

const fmt = (n: number) => n.toLocaleString("vi-VN", { maximumFractionDigits: 2 });
const unitOf = (i: Ingredient) => i.purchase_unit ?? BASE_UNIT_LABEL[i.base_unit];
/** Hệ số từ đơn vị gốc ra đơn vị hiện trên form (đơn vị nhập nếu có). */
const factorOf = (i: Ingredient) => (i.purchase_unit ? i.purchase_factor : 1);
const inPurchase = (i: Ingredient, qty: number) => `${fmt(qty / factorOf(i))} ${unitOf(i)}`;
const signedVnd = (n: number) => (n > 0 ? `+${formatVnd(n)}` : n < 0 ? `−${formatVnd(-n)}` : formatVnd(0));

const REASON_LABEL: Record<string, string> = {
  hong: "Hỏng / hết hạn",
  do_bo: "Đổ bỏ / rơi vỡ",
  com_nhan_vien: "Cơm nhân viên",
  khac: "Khác",
};

const SELECT =
  "h-11 w-full min-w-0 rounded-md border border-hairline-strong bg-canvas px-md text-base text-ink sm:text-sm focus-visible:border-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary";

type CountDoc = {
  id: string;
  code: string;
  counted_at: string;
  status: "done" | "cancelled";
  created_by: string | null;
  redo_of: string | null;
  last_receipt: { code: string; received_at: string } | { code: string; received_at: string }[] | null;
  stock_count_lines: { ingredient_id: string; counted_base: number; count_unit: "purchase" | "base"; diff: number }[];
};

/**
 * Kiểm kê + xuất hủy (INV-08). P34 (QD-034): mỗi lần kiểm là một PHIẾU kiểm kê (mã KK…) và là mốc khóa — phiếu nhập / hủy /
 * mẻ ghi muộn có giờ trước lần đếm thì phải Hủy phiếu kiểm kê, ghi, rồi "Hoàn thành lại" (`?lai=<id>`: giữ số đếm + giờ cũ).
 * Danh sách phiếu kiểm kê / phiếu hủy hiện các ngày chưa chốt sổ (sổ tự chốt sau 7 ngày).
 */
export default async function CountPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ lai?: string }>;
}) {
  const { slug } = await params;
  const { lai } = await searchParams;
  const session = (await getSessionMembership(slug))!;
  const tenantId = session.tenant.id;
  const supabase = await createClient();
  const today = businessDate();
  const openFrom = await oldestOpenDay(supabase, tenantId, today);
  const openFromUtc = dayStartUtc(openFrom);

  const COUNT_COLS =
    "id, code, counted_at, status, created_by, redo_of, last_receipt:purchase_receipts(code, received_at), " +
    "stock_count_lines(ingredient_id, counted_base, count_unit, diff)";
  const [data, counts, wasteOpen, lastReceipt, redo] = await Promise.all([
    loadInventory(supabase, tenantId),
    supabase
      .from("stock_counts")
      .select(COUNT_COLS)
      .eq("tenant_id", tenantId)
      .gte("counted_at", openFromUtc)
      .order("counted_at", { ascending: false }),
    supabase
      .from("stock_entries")
      .select("id, ingredient_id, qty, reason, note, occurred_at")
      .eq("tenant_id", tenantId)
      .eq("kind", "waste")
      .gte("business_date", openFrom)
      .order("occurred_at", { ascending: false }),
    supabase
      .from("purchase_receipts")
      .select("code, received_at")
      .eq("tenant_id", tenantId)
      .eq("status", "done")
      .order("received_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    lai
      ? supabase.from("stock_counts").select(COUNT_COLS).eq("tenant_id", tenantId).eq("id", lai).eq("status", "cancelled").maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const redoDoc = (redo.data as unknown as CountDoc | null) ?? null;

  // Tồn sổ: bây giờ (phiếu mới) hoặc TẠI giờ kiểm của phiếu đang hoàn thành lại.
  const { data: onHand } = await supabase.rpc("inventory_on_hand", {
    p_tenant: tenantId,
    ...(redoDoc ? { p_at: redoDoc.counted_at } : {}),
  });
  const theo = new Map(
    ((onHand ?? []) as { ingredient_id: string; on_hand: number }[]).map((r) => [r.ingredient_id, Number(r.on_hand)])
  );

  const docs = (counts.data ?? []) as unknown as CountDoc[];
  const redone = new Set(docs.filter((c) => c.status === "done" && c.redo_of).map((c) => c.redo_of!));
  const memberIds = [...new Set(docs.map((c) => c.created_by).filter(Boolean))] as string[];
  const { data: members } = memberIds.length
    ? await supabase.from("memberships").select("id, display_name").in("id", memberIds)
    : { data: [] as { id: string; display_name: string | null }[] };
  const nameOf = new Map((members ?? []).map((m) => [m.id as string, (m.display_name as string | null) ?? ""]));

  const active = data.ingredients.filter((i) => i.active);
  const byId = new Map(data.ingredients.map((i) => [i.id, i]));
  const ctx = costContext(data);
  const priceOf = (id: string) => unitCost(id, ctx).cost;

  const toRow = (i: Ingredient): CountRow => ({
    id: i.id,
    name: i.name,
    unit: unitOf(i),
    // Đơn vị nhập khác đơn vị trừ kho (thùng ≠ chai) → dòng có ô chọn đơn vị đếm (P26, như KiotViet).
    baseUnit: factorOf(i) !== 1 ? BASE_UNIT_LABEL[i.base_unit] : null,
    factor: factorOf(i),
    theoreticalBase: theo.get(i.id) ?? 0,
    // Giá trị lệch theo giá vốn hiện tại (KiotViet: "giá vốn tại thời điểm tạo phiếu kiểm kho").
    unitPriceBase: priceOf(i.id),
  });
  const countRows = redoDoc
    ? redoDoc.stock_count_lines.flatMap((l) => (byId.get(l.ingredient_id) ? [toRow(byId.get(l.ingredient_id)!)] : []))
    : active.filter((i) => i.must_count).map(toRow);
  const prefill = redoDoc
    ? Object.fromEntries(
        redoDoc.stock_count_lines.map((l) => {
          const i = byId.get(l.ingredient_id);
          const f = l.count_unit === "base" || !i ? 1 : factorOf(i);
          return [l.ingredient_id, { counted: String(Math.round((Number(l.counted_base) / f) * 1000) / 1000).replace(".", ","), unit: l.count_unit }];
        })
      )
    : undefined;
  const last = redoDoc ? (Array.isArray(redoDoc.last_receipt) ? redoDoc.last_receipt[0] : redoDoc.last_receipt) : lastReceipt.data;

  /** Lệch tăng / giảm của một phiếu (đồng) theo giá vốn hiện tại; nguyên liệu chưa có giá thì bỏ qua. */
  const docValue = (c: CountDoc) => {
    let up = 0;
    let down = 0;
    for (const l of c.stock_count_lines) {
      const p = priceOf(l.ingredient_id);
      if (p === null || Number(l.diff) === 0) continue;
      const v = Math.round(Number(l.diff) * p);
      if (v > 0) up += v;
      else down += v;
    }
    return { up, down };
  };

  const wasteRows = wasteOpen.data ?? [];

  return (
    <div className="flex flex-col gap-xl">
      <Card id="kiem-ke">
        <h2 className="font-semibold text-lg text-ink">{redoDoc ? `Hoàn thành lại phiếu ${redoDoc.code}` : "Kiểm kê cuối ngày"}</h2>
        <p className="mt-xxs text-sm text-steel">
          {redoDoc ? (
            <>
              Số đã đếm được điền sẵn; tồn kho tính lại theo sổ hiện tại tại giờ kiểm cũ.{" "}
              <Link href={`/r/${slug}/admin/inventory/count`} className="text-primary">
                Thôi, kiểm kê mới
              </Link>
            </>
          ) : (
            <>
              Chỉ đếm nguyên liệu đã đánh dấu &quot;cần kiểm&quot;. Nhập hết phiếu nhập, phiếu hủy trong ngày rồi hãy đếm. Không
              kiểm cũng được — khi đó sẽ không có số hao hụt thật.
            </>
          )}
        </p>
        <div className="mt-md">
          {countRows.length === 0 ? (
            <p className="text-sm text-steel">Chưa có nguyên liệu nào đánh dấu &quot;cần kiểm&quot; (sửa ở tab Nguyên liệu).</p>
          ) : (
            <CountForm
              key={redoDoc?.id ?? "moi"}
              slug={slug}
              rows={countRows}
              redo={redoDoc ? { id: redoDoc.id, countedAt: redoDoc.counted_at } : undefined}
              prefill={prefill}
              lastReceipt={last ? { code: last.code as string, at: last.received_at as string } : null}
            />
          )}
        </div>

        <h3 className="mt-lg text-sm font-medium text-ink">Phiếu kiểm kê 7 ngày gần đây</h3>
        {docs.length === 0 ? (
          <p className="mt-xs text-sm text-steel">Chưa có phiếu kiểm kê nào trong 7 ngày.</p>
        ) : (
          <div className="mt-xs overflow-x-auto rounded-lg border border-hairline-soft" data-phieu-kiem-ke>
            <table className="w-full min-w-[44rem] text-left text-sm">
              <thead className="border-b border-hairline-soft text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-md py-xs font-medium">Mã</th>
                  <th className="px-md py-xs font-medium">Thời gian</th>
                  <th className="px-md py-xs text-right font-medium">Nguyên liệu</th>
                  <th className="px-md py-xs text-right font-medium">Lệch tăng</th>
                  <th className="px-md py-xs text-right font-medium">Lệch giảm</th>
                  <th className="px-md py-xs font-medium">Người kiểm</th>
                  <th className="px-md py-xs font-medium">Trạng thái</th>
                  <th className="px-md py-xs" />
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline-soft">
                {docs.map((c) => {
                  const v = docValue(c);
                  return (
                    <tr key={c.id} id={`kk-${c.id}`} className="target:bg-status-new/40">
                      <td className="px-md py-xs font-mono text-ink">{c.code}</td>
                      <td className="whitespace-nowrap px-md py-xs text-slate">{gioNgayVn(c.counted_at)}</td>
                      <td className="px-md py-xs text-right tabular-nums text-slate">{c.stock_count_lines.length}</td>
                      <td className={`px-md py-xs text-right tabular-nums ${v.up ? "text-status-ready" : "text-slate"}`}>{signedVnd(v.up)}</td>
                      <td className={`px-md py-xs text-right tabular-nums ${v.down ? "text-status-late" : "text-slate"}`}>{signedVnd(v.down)}</td>
                      <td className="px-md py-xs text-slate">{(c.created_by && nameOf.get(c.created_by)) || "—"}</td>
                      <td className="px-md py-xs text-slate">{c.status === "done" ? "Đã cân bằng" : "Đã hủy"}</td>
                      <td className="px-md py-xs text-right">
                        {c.status === "done" ? (
                          <form action={cancelCount}>
                            <input type="hidden" name="slug" value={slug} />
                            <input type="hidden" name="id" value={c.id} />
                            <ConfirmSubmit
                              message={`Hủy phiếu ${c.code}? Tồn của ${c.stock_count_lines.length} nguyên liệu trong phiếu về lại số theo sổ. Số đã đếm được giữ lại để Hoàn thành lại.`}
                              className="inline-flex min-h-11 items-center rounded-md px-sm text-sm text-status-late hover:bg-surface sm:min-h-9"
                            >
                              Hủy
                            </ConfirmSubmit>
                          </form>
                        ) : redone.has(c.id) ? (
                          <span className="text-xs text-steel">đã hoàn thành lại</span>
                        ) : (
                          <Link
                            href={`/r/${slug}/admin/inventory/count?lai=${c.id}#kiem-ke`}
                            className="inline-flex min-h-11 items-center rounded-md px-sm text-sm text-primary hover:bg-surface sm:min-h-9"
                          >
                            Hoàn thành lại
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
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

        {wasteRows.length > 0 && <h3 className="mt-lg text-sm font-medium text-ink">Phiếu hủy 7 ngày gần đây</h3>}
        {wasteRows.length > 0 && (
          <ul className="mt-xs divide-y divide-hairline-soft text-sm" data-phieu-huy>
            {wasteRows.map((w) => {
              const ing = byId.get(w.ingredient_id as string);
              return (
                <li key={w.id as string} className="flex flex-wrap justify-between gap-sm py-xs">
                  <span className="text-ink">
                    {gioNgayVn(w.occurred_at as string)} · {ing?.name ?? "?"} · {REASON_LABEL[w.reason as string]}
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
