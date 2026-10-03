import Link from "next/link";
import { notFound } from "next/navigation";
import { getSessionMembership } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getSupplier, listReceipts, listSuppliers } from "@/lib/purchasing/data";
import { formatVnd } from "@/lib/orders/cart";
import { ngayVn } from "@/lib/purchasing/receipt";
import { isoToVnLocal } from "@/lib/cashbook/labels";
import { gioNgayNamVn } from "@/lib/time/vn";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MoneyField } from "@/components/ui/money-input";
import { SubmitButton } from "@/components/ui/submit-button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { SupplierFields } from "@/components/admin/purchasing/SupplierFields";
import { ReceiptTable } from "@/components/admin/purchasing/ReceiptTable";
import { adjustDebt, cancelAdjustment, paySupplier, setSupplierActive, updateSupplier } from "../actions";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "info", label: "Thông tin" },
  { key: "history", label: "Lịch sử nhập hàng" },
  { key: "debt", label: "Nợ cần trả NCC" },
] as const;

/**
 * Chi tiết nhà cung cấp (PURCH-01, PURCH-05) — như KiotViet: tab "Thông tin" / "Lịch sử nhập/trả hàng" / "Nợ cần trả
 * NCC" với nút "Thanh toán" (→ phiếu chi) và "Điều chỉnh" (nợ đầu kỳ, không qua quỹ).
 */
export default async function SupplierDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { slug, id } = await params;
  const { tab: tabRaw } = await searchParams;
  const session = (await getSessionMembership(slug))!;
  const supabase = await createClient();
  const s = await getSupplier(supabase, session.tenant.id, id);
  if (!s) notFound();
  const tab = TABS.some((t) => t.key === tabRaw) ? tabRaw! : "info";
  const base = `/r/${slug}/admin/nha-cung-cap`;
  const sum = (await listSuppliers(supabase, session.tenant.id)).find((x) => x.id === id);

  return (
    <div className="flex flex-col gap-lg">
      <header className="flex flex-wrap items-end justify-between gap-md">
        <div>
          <Link href={base} className="text-sm text-primary">
            ‹ Nhà cung cấp
          </Link>
          <h2 className="mt-xxs font-display text-xl text-ink">
            {s.name} <span className="font-mono text-base text-steel">{s.code}</span>
          </h2>
          {!s.active && <p className="text-sm text-steel">Đang ngừng hoạt động — không hiện trong ô chọn khi nhập hàng.</p>}
        </div>
        <dl className="flex gap-xl text-sm">
          <div>
            <dt className="text-steel">Tổng mua</dt>
            <dd className="tabular-nums text-ink">{formatVnd(sum?.totalPurchase ?? 0)}</dd>
          </div>
          <div>
            <dt className="text-steel">Nợ cần trả hiện tại</dt>
            <dd className="font-medium tabular-nums text-ink">{formatVnd(sum?.debt ?? 0)}</dd>
          </div>
        </dl>
      </header>

      <nav aria-label="Chi tiết nhà cung cấp" className="flex gap-xs">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`${base}/${id}${t.key === "info" ? "" : `?tab=${t.key}`}`}
            aria-current={tab === t.key ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 items-center rounded-md px-md text-sm",
              tab === t.key ? "bg-cream font-medium text-ink" : "text-steel hover:bg-surface"
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "info" && (
        <Card>
          <form action={updateSupplier} className="flex flex-col gap-md">
            <input type="hidden" name="slug" value={slug} />
            <input type="hidden" name="id" value={id} />
            <SupplierFields s={s} />
            <div className="flex flex-wrap items-center justify-between gap-md">
              <SubmitButton pendingLabel="Đang lưu…">Lưu</SubmitButton>
            </div>
          </form>
          <form action={setSupplierActive} className="mt-lg border-t border-hairline-soft pt-md">
            <input type="hidden" name="slug" value={slug} />
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="active" value={s.active ? "false" : "true"} />
            {s.active ? (
              <ConfirmSubmit
                message="Ngừng hoạt động nhà cung cấp này? Lịch sử và công nợ vẫn giữ nguyên."
                className="text-sm text-status-late hover:underline"
              >
                Ngừng hoạt động
              </ConfirmSubmit>
            ) : (
              <button type="submit" className="text-sm text-primary hover:underline">
                Cho hoạt động lại
              </button>
            )}
          </form>
        </Card>
      )}

      {tab === "debt" && (await DebtTab({ slug, id, debt: sum?.debt ?? 0 }))}

      {tab === "history" && (
        <ReceiptTable
          rows={await listReceipts(supabase, session.tenant.id, { supplierId: id })}
          hrefBase={`/r/${slug}/admin/nhap-hang`}
          showSupplier={false}
          empty="Chưa nhập hàng của nhà cung cấp này."
        />
      )}
    </div>
  );
}

type Bal = { receipt_id: string; code: string; doc_date: string; total: number; paid: number; remaining: number };

/** Tab "Nợ cần trả NCC" (PURCH-05). */
async function DebtTab({ slug, id, debt }: { slug: string; id: string; debt: number }) {
  const supabase = await createClient();
  const [{ data: balRaw }, { data: adjRaw }] = await Promise.all([
    supabase.rpc("supplier_receipt_balances", { p_supplier: id }),
    supabase
      .from("supplier_debt_adjustments")
      .select("id, amount, note, status, created_at")
      .eq("supplier_id", id)
      .order("created_at", { ascending: false }),
  ]);
  const bal = ((balRaw ?? []) as Bal[]).map((b) => ({ ...b, paid: Number(b.paid), remaining: Number(b.remaining) }));
  const adj = (adjRaw ?? []) as { id: string; amount: number; note: string | null; status: string; created_at: string }[];
  const conNo = bal.filter((b) => b.remaining > 0);
  const adjActive = adj.filter((a) => a.status === "active").reduce((s, a) => s + a.amount, 0);
  // Bất biến QD-027 D11: nợ = Σ còn nợ + Σ điều chỉnh − trả trước.
  const traTruoc = bal.reduce((s, b) => s + b.remaining, 0) + adjActive - debt;
  const hidden = (
    <>
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="id" value={id} />
    </>
  );
  const select = "h-11 rounded-md border border-hairline-strong bg-canvas px-sm text-sm text-ink";

  return (
    <div className="flex flex-col gap-lg">
      <section className="rounded-lg border border-hairline-soft bg-canvas shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-sm" data-no-ncc>
            <thead className="border-b border-hairline-soft text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-lg py-sm font-medium">Mã phiếu</th>
                <th className="px-md py-sm font-medium">Ngày</th>
                <th className="px-md py-sm text-right font-medium">Cần trả</th>
                <th className="px-md py-sm text-right font-medium">Đã trả</th>
                <th className="px-lg py-sm text-right font-medium">Còn nợ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline-soft">
              {bal.map((b) => (
                <tr key={b.receipt_id}>
                  <td className="px-lg py-sm">
                    <Link href={`/r/${slug}/admin/nhap-hang/${b.receipt_id}`} className="font-mono text-ink underline-offset-4 hover:underline">
                      {b.code}
                    </Link>
                  </td>
                  <td className="px-md py-sm text-slate">{ngayVn(b.doc_date)}</td>
                  <td className="px-md py-sm text-right tabular-nums">{formatVnd(b.total)}</td>
                  <td className="px-md py-sm text-right tabular-nums text-slate">{formatVnd(b.paid)}</td>
                  <td className={cn("px-lg py-sm text-right tabular-nums", b.remaining > 0 ? "font-medium text-ink" : "text-steel")}>
                    {formatVnd(b.remaining)}
                  </td>
                </tr>
              ))}
              {adj
                .filter((a) => a.status === "active")
                .map((a) => (
                  <tr key={a.id}>
                    <td className="px-lg py-sm text-slate" colSpan={2}>
                      Điều chỉnh {gioNgayNamVn(a.created_at)}
                      {a.note ? ` — ${a.note}` : ""}
                    </td>
                    <td className="px-md py-sm" colSpan={2}>
                      <form action={cancelAdjustment}>
                        {hidden}
                        <input type="hidden" name="adj" value={a.id} />
                        <ConfirmSubmit message="Hủy điều chỉnh này?" className="text-xs text-status-late hover:underline">
                          Hủy điều chỉnh
                        </ConfirmSubmit>
                      </form>
                    </td>
                    <td className="px-lg py-sm text-right tabular-nums">{formatVnd(a.amount)}</td>
                  </tr>
                ))}
              {traTruoc > 0 && (
                <tr>
                  <td className="px-lg py-sm text-slate" colSpan={4}>Trả trước (tiền đã trả chưa gắn phiếu nào)</td>
                  <td className="px-lg py-sm text-right tabular-nums text-status-ready">−{formatVnd(traTruoc)}</td>
                </tr>
              )}
              {bal.length === 0 && adjActive === 0 && (
                <tr>
                  <td colSpan={5} className="px-lg py-lg text-center text-sm text-steel">Chưa có công nợ với nhà cung cấp này.</td>
                </tr>
              )}
            </tbody>
            <tfoot className="border-t border-hairline-soft">
              <tr>
                <td className="px-lg py-sm font-medium text-ink" colSpan={4}>Nợ cần trả hiện tại</td>
                <td className="px-lg py-sm text-right font-medium tabular-nums text-ink" data-tong-no>
                  {debt < 0 ? `Trả trước ${formatVnd(-debt)}` : formatVnd(debt)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <div className="grid gap-lg xl:grid-cols-2">
        <Card>
          <h2 className="text-base font-medium text-ink">Thanh toán</h2>
          <p className="mt-xxs text-sm text-steel">Tạo phiếu chi trả nợ. Không tích phiếu nào thì trả phiếu cũ trước.</p>
          <form action={paySupplier} className="mt-md flex flex-col gap-md">
            {hidden}
            <div className="grid gap-md sm:grid-cols-3">
              <label className="flex flex-col gap-xxs text-sm text-slate">
                Trả cho NCC
                <MoneyField name="amount" defaultValue={Math.max(0, debt)} className="text-right" />
              </label>
              <label className="flex flex-col gap-xxs text-sm text-slate">
                Quỹ
                <select name="fund" defaultValue="cash" className={select}>
                  <option value="cash">Tiền mặt</option>
                  <option value="bank">Ngân hàng</option>
                </select>
              </label>
              <label className="flex flex-col gap-xxs text-sm text-slate">
                Thời gian
                <Input type="datetime-local" name="occurred_at" defaultValue={isoToVnLocal(new Date().toISOString())} />
              </label>
            </div>
            {conNo.length > 0 && (
              <fieldset className="text-sm">
                <legend className="text-slate">Chọn công nợ trả (không bắt buộc)</legend>
                <div className="mt-xs flex flex-col gap-xxs">
                  {conNo.map((b) => (
                    <label key={b.receipt_id} className="inline-flex items-center gap-xs">
                      <input type="checkbox" name="receipts" value={b.receipt_id} />
                      <span className="font-mono">{b.code}</span>
                      <span className="text-steel">{ngayVn(b.doc_date)} · còn nợ {formatVnd(b.remaining)}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            <label className="flex flex-col gap-xxs text-sm text-slate">
              Ghi chú
              <Input name="note" maxLength={500} />
            </label>
            <div>
              <SubmitButton pendingLabel="Đang tạo…">Tạo phiếu chi</SubmitButton>
            </div>
          </form>
        </Card>

        <Card>
          <h2 className="text-base font-medium text-ink">Điều chỉnh</h2>
          <p className="mt-xxs text-sm text-steel">
            Ghi nợ cũ lúc bắt đầu dùng (công nợ tồn đầu kỳ) hoặc sửa chênh lệch. Không tạo phiếu thu / chi, không đổi sổ quỹ.
          </p>
          <form action={adjustDebt} className="mt-md flex flex-col gap-md">
            {hidden}
            <div className="grid gap-md sm:grid-cols-2">
              <label className="flex flex-col gap-xxs text-sm text-slate">
                Loại
                <select name="sign" defaultValue="plus" className={select}>
                  <option value="plus">Tăng nợ</option>
                  <option value="minus">Giảm nợ</option>
                </select>
              </label>
              <label className="flex flex-col gap-xxs text-sm text-slate">
                Giá trị nợ điều chỉnh
                <MoneyField name="amount" className="text-right" />
              </label>
            </div>
            <label className="flex flex-col gap-xxs text-sm text-slate">
              Mô tả
              <Input name="note" maxLength={500} placeholder="Công nợ tồn đầu kỳ" />
            </label>
            <div>
              <SubmitButton variant="secondary" pendingLabel="Đang lưu…">Điều chỉnh</SubmitButton>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
