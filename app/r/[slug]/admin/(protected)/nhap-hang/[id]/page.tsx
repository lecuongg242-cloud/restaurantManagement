import Link from "next/link";
import { notFound } from "next/navigation";
import { getSessionMembership } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { activeSupplierOptions, getReceipt, getSupplier } from "@/lib/purchasing/data";
import { FUND_LABEL } from "@/lib/purchasing/receipt";
import { formatVnd } from "@/lib/orders/cart";
import { gioNgayNamVn } from "@/lib/time/vn";
import { BASE_UNIT_LABEL, type BaseUnit } from "@/lib/inventory/types";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { ReceiptForm } from "@/components/admin/inventory/ReceiptForm";
import { ReceiptStatusBadge } from "@/components/admin/purchasing/ReceiptTable";
import { LockBox } from "@/components/admin/inventory/LockBox";
import { businessDate } from "@/lib/inventory/day";
import { oldestOpenDay } from "@/lib/inventory/close-server";
import { toConflicts, toVnDateTimeInput, type LockConflict, type LockRow } from "@/lib/inventory/lock";
import { cancelReceipt, copyReceipt, updateReceiptMeta } from "../actions";

export const dynamic = "force-dynamic";

const fmtQty = (n: number) => n.toLocaleString("vi-VN", { maximumFractionDigits: 3 });

/** Phiếu tạm đã chọn giờ / phiếu đã nhập ở ngày chưa chốt: lần kiểm kê nào chặn nó (P34 mốc khóa, QD-034 D2). */
async function receiptConflicts(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
  r: { status: string; received_at: string | null; stock_date: string | null; lines: { ingredient_id: string }[] }
): Promise<LockConflict[]> {
  if (!r.received_at || r.status === "cancelled") return [];
  if (r.status === "done") {
    const { count } = await supabase
      .from("daily_closes")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .gte("business_date", r.stock_date!);
    if ((count ?? 0) > 0) return []; // ngày đã chốt: Hủy bỏ ghi dòng âm lúc hủy, không vướng
  }
  const { data } = await supabase.rpc("inventory_lock_conflicts", {
    p_tenant: tenantId,
    p_ingredients: [...new Set(r.lines.map((l) => l.ingredient_id))],
    p_at: r.received_at,
  });
  return toConflicts((data ?? []) as LockRow[]);
}

/** Chi tiết phiếu nhập (PURCH-02..04). Phiếu đã nhập không sửa số — "Hủy bỏ" rồi "Sao chép" (như KiotViet). */
export default async function ReceiptDetailPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const session = (await getSessionMembership(slug))!;
  const tenantId = session.tenant.id;
  const supabase = await createClient();
  const r = await getReceipt(supabase, tenantId, id);
  if (!r) notFound();
  const [supplier, suppliers, conflicts, completer] = await Promise.all([
    r.supplier_id ? getSupplier(supabase, tenantId, r.supplier_id) : Promise.resolve(null),
    activeSupplierOptions(supabase, tenantId),
    receiptConflicts(supabase, tenantId, r),
    r.completed_by
      ? supabase.from("memberships").select("display_name").eq("id", r.completed_by).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const countHref = `/r/${slug}/admin/inventory/count`;
  // Phiếu ghi muộn (bấm Hoàn thành cách giờ hàng về hơn 5 phút) → nói ra, để thấy phiếu nào nhập bù.
  const late =
    r.received_at && r.completed_at && Date.parse(r.completed_at) - Date.parse(r.received_at) > 5 * 60_000;
  const base = `/r/${slug}/admin/nhap-hang`;
  const paid = r.paid;
  const hidden = (
    <>
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="id" value={id} />
    </>
  );

  let draftForm: React.ReactNode = null;
  if (r.status === "draft") {
    const { data: ings } = await supabase
      .from("ingredients")
      .select("id, name, base_unit, purchase_unit")
      .eq("tenant_id", tenantId)
      .eq("active", true)
      .eq("kind", "purchased")
      .order("name");
    draftForm = (
      <ReceiptForm
        slug={slug}
        ingredients={(ings ?? []) as { id: string; name: string; base_unit: BaseUnit; purchase_unit: string | null }[]}
        suppliers={suppliers}
        draft={{
          id: r.id,
          supplier_id: r.supplier_id,
          discount: r.discount,
          pay_now: r.pay_now,
          pay_fund: r.pay_fund,
          note: r.note,
          received_at: r.received_at ? toVnDateTimeInput(r.received_at) : null,
          lines: r.lines.map((l) => ({ ingredient_id: l.ingredient_id, qty: l.qty, unit_price: l.unit_price })),
        }}
        nowVn={toVnDateTimeInput(new Date().toISOString())}
        minDay={await oldestOpenDay(supabase, tenantId, businessDate())}
      />
    );
  }

  return (
    <div className="flex flex-col gap-lg">
      <header className="flex flex-wrap items-end justify-between gap-md">
        <div>
          <Link href={base} className="text-sm text-primary">
            ‹ Nhập hàng
          </Link>
          <h2 className="mt-xxs flex flex-wrap items-center gap-sm font-semibold text-xl text-ink">
            <span className="font-mono">{r.code}</span>
            <ReceiptStatusBadge status={r.status} />
          </h2>
          <p className="mt-xxs text-sm text-steel">
            {r.received_at ? (
              <>Thời gian nhập {gioNgayNamVn(r.received_at)}</>
            ) : (
              <>Thời gian nhập: lúc bấm Hoàn thành</>
            )}
            {late && (
              <>
                {" "}· ghi lúc {gioNgayNamVn(r.completed_at)}
                {completer.data?.display_name ? <> bởi {completer.data.display_name as string}</> : null}
              </>
            )}
            {" · "}
            {supplier ? (
              <Link href={`/r/${slug}/admin/nha-cung-cap/${supplier.id}`} className="text-primary">
                {supplier.name}
              </Link>
            ) : (
              "Không có nhà cung cấp"
            )}
            {r.cancelled_at && <> · hủy lúc {gioNgayNamVn(r.cancelled_at)}</>}
          </p>
        </div>
        {r.status !== "draft" && (
          <form action={copyReceipt}>
            {hidden}
            <SubmitButton variant="secondary" size="sm" pendingLabel="Đang sao chép…">
              Sao chép
            </SubmitButton>
          </form>
        )}
      </header>

      {r.status === "draft" && (
        <LockBox title="Chưa nhập kho được vào thời gian này:" conflicts={conflicts} countHref={countHref} />
      )}

      {r.status === "draft" ? (
        <Card>{draftForm}</Card>
      ) : (
        <>
          <section className="rounded-lg border border-hairline-soft bg-canvas shadow-card">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] text-left text-sm">
                <thead className="border-b border-hairline-soft text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-lg py-sm font-medium">Tên hàng</th>
                    <th className="px-md py-sm text-right font-medium">Số lượng</th>
                    <th className="px-md py-sm text-right font-medium">Đơn giá</th>
                    <th className="px-lg py-sm text-right font-medium">Thành tiền</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline-soft">
                  {r.lines.map((l, i) => (
                    <tr key={i}>
                      <td className="px-lg py-sm text-ink">{l.name}</td>
                      <td className="px-md py-sm text-right tabular-nums">
                        {fmtQty(l.qty)} {l.purchase_unit ?? BASE_UNIT_LABEL[l.base_unit as BaseUnit] ?? ""}
                      </td>
                      <td className="px-md py-sm text-right tabular-nums text-slate">
                        {l.unit_price === null ? "—" : formatVnd(l.unit_price)}
                      </td>
                      <td className="px-lg py-sm text-right tabular-nums text-ink">{l.amount === null ? "—" : formatVnd(l.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <dl className="ml-auto grid max-w-sm gap-xs border-t border-hairline-soft px-lg py-md text-sm">
              <div className="flex justify-between"><dt className="text-slate">Tổng tiền hàng</dt><dd className="tabular-nums">{formatVnd(r.subtotal)}</dd></div>
              <div className="flex justify-between"><dt className="text-slate">Giảm giá</dt><dd className="tabular-nums">{formatVnd(r.discount)}</dd></div>
              <div className="flex justify-between font-medium"><dt>Cần trả NCC</dt><dd className="tabular-nums">{formatVnd(r.total)}</dd></div>
              <div className="flex justify-between"><dt className="text-slate">Đã trả NCC</dt><dd className="tabular-nums">{formatVnd(paid)}</dd></div>
              {r.status === "done" && r.total - paid > 0 && (
                <div className="flex justify-between"><dt className="text-slate">Còn nợ</dt><dd className="tabular-nums text-ink">{formatVnd(r.total - paid)}</dd></div>
              )}
            </dl>
          </section>

          <Card>
            <h3 className="text-base font-medium text-ink">Lịch sử thanh toán</h3>
            {r.payments.length === 0 ? (
              <p className="mt-xs text-sm text-steel">Chưa trả tiền nhà cung cấp cho phiếu này.</p>
            ) : (
              <ul className="mt-xs divide-y divide-hairline-soft text-sm">
                {r.payments.map((v) => (
                  <li key={v.voucher_id} className="flex flex-wrap items-center justify-between gap-sm py-xs">
                    <Link href={`/r/${slug}/admin/so-quy/${v.voucher_id}`} className="font-mono text-primary">{v.code}</Link>
                    <span className="text-slate">{gioNgayNamVn(v.occurred_at)} · {FUND_LABEL[v.fund]}</span>
                    <span className={v.status === "active" ? "tabular-nums text-ink" : "tabular-nums text-steel line-through"}>
                      {formatVnd(v.amount)}
                    </span>
                    {v.status !== "active" && <span className="text-xs text-steel">đã hủy</span>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}

      {r.status === "done" && (
        <Card>
          <h3 className="text-base font-medium text-ink">Sửa thông tin</h3>
          <p className="mt-xxs text-sm text-steel">
            Phiếu đã nhập không sửa số lượng, giá, thời gian nhập. Sai thì Hủy bỏ rồi Sao chép thành phiếu mới.
          </p>
          <form action={updateReceiptMeta} className="mt-md grid gap-md sm:grid-cols-3">
            {hidden}
            {!r.supplier_id && suppliers.length > 0 && (
              <label className="flex flex-col gap-xxs text-sm text-slate">
                Nhà cung cấp
                <select name="supplier_id" defaultValue="" className="h-11 rounded-md border border-hairline-strong bg-canvas px-sm text-sm text-ink">
                  <option value="">— Không chọn —</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </label>
            )}
            <label className="flex flex-col gap-xxs text-sm text-slate sm:col-span-3">
              Ghi chú
              <Input name="note" maxLength={500} defaultValue={r.note ?? ""} />
            </label>
            <div>
              <SubmitButton size="sm" pendingLabel="Đang lưu…">Lưu</SubmitButton>
            </div>
          </form>
        </Card>
      )}

      {r.status === "done" && conflicts.length > 0 && (
        <LockBox title="Không hủy bỏ được phiếu này lúc này:" conflicts={conflicts} countHref={countHref} />
      )}

      {r.status !== "cancelled" && !(r.status === "done" && conflicts.length > 0) && (
        <form action={cancelReceipt} className="flex flex-wrap items-center gap-md border-t border-hairline-soft pt-md text-sm">
          {hidden}
          {r.status === "done" && r.vouchers.some((v) => v.status === "active") && (
            <label className="inline-flex items-center gap-xs text-slate">
              <input type="checkbox" name="cancel_vouchers" defaultChecked /> Hủy luôn phiếu chi đi kèm
            </label>
          )}
          <ConfirmSubmit
            message={
              r.status === "done"
                ? `Hủy phiếu nhập ${r.code}? Tồn kho và công nợ được trả lại như trước khi nhập. Không hoàn tác được.`
                : `Hủy phiếu tạm ${r.code}?`
            }
            className="text-status-late hover:underline"
          >
            Hủy bỏ
          </ConfirmSubmit>
        </form>
      )}
    </div>
  );
}
