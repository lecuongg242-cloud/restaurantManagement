import Link from "next/link";
import { getSessionMembership } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { activeSupplierOptions, listReceipts, type ReceiptStatus } from "@/lib/purchasing/data";
import { STATUS_LABEL } from "@/lib/purchasing/receipt";
import { ReceiptTable } from "@/components/admin/purchasing/ReceiptTable";
import { Input } from "@/components/ui/input";

export const dynamic = "force-dynamic";

const STATUSES: ReceiptStatus[] = ["draft", "done", "cancelled"];
/** Lọc theo thanh toán (như Sapo FnB) — chỉ phiếu đã nhập. */
const PAY = { chua: "Chưa thanh toán", "mot-phan": "Thanh toán một phần", du: "Đã thanh toán" } as const;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * "Nhập hàng" (PURCH-03) — mục menu riêng như KiotViet FnB (chủ dự án chốt G1, 30/09/2026): danh sách phiếu nhập, lọc trạng thái,
 * nhà cung cấp, thanh toán, khoảng ngày chứng từ; "+ Nhập hàng" mở form lập phiếu.
 */
export default async function ReceiptListPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tt?: string; ncc?: string; tu?: string; den?: string; tra?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const session = (await getSessionMembership(slug))!;
  const supabase = await createClient();
  const status = STATUSES.includes(sp.tt as ReceiptStatus) ? (sp.tt as ReceiptStatus) : undefined;
  const tra = sp.tra && sp.tra in PAY ? (sp.tra as keyof typeof PAY) : undefined;
  const [all, suppliers] = await Promise.all([
    listReceipts(supabase, session.tenant.id, {
      status,
      supplierId: sp.ncc || undefined,
      from: DAY.test(sp.tu ?? "") ? sp.tu : undefined,
      to: DAY.test(sp.den ?? "") ? sp.den : undefined,
    }),
    activeSupplierOptions(supabase, session.tenant.id),
  ]);
  const rows = !tra
    ? all
    : all.filter(
        (r) =>
          r.status === "done" &&
          (tra === "chua" ? r.paid === 0 && r.total > 0 : tra === "du" ? r.paid >= r.total : r.paid > 0 && r.paid < r.total)
      );
  const base = `/r/${slug}/admin/nhap-hang`;
  const select = "h-9 rounded-md border border-hairline-strong bg-canvas px-sm text-sm text-ink";

  return (
    <div className="flex flex-col gap-md">
      <header>
        <h1 className="font-display text-2xl text-ink">Nhập hàng</h1>
        <p className="mt-xxs text-sm text-steel">
          Phiếu nhập hàng từ nhà cung cấp hoặc mua chợ. Nhập buổi sáng: bấm &quot;+ Nhập hàng&quot; → &quot;Lấy hàng lần trước&quot;.
        </p>
      </header>
      <div className="flex flex-wrap items-end justify-between gap-md">
        <form action={base} className="flex flex-wrap items-end gap-sm text-sm">
          <label className="flex flex-col gap-xxs text-slate">
            Trạng thái
            <select name="tt" defaultValue={status ?? ""} className={select}>
              <option value="">Tất cả</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-xxs text-slate">
            Nhà cung cấp
            <select name="ncc" defaultValue={sp.ncc ?? ""} className={select}>
              <option value="">Tất cả</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-xxs text-slate">
            Thanh toán
            <select name="tra" defaultValue={tra ?? ""} className={select}>
              <option value="">Tất cả</option>
              {(Object.keys(PAY) as (keyof typeof PAY)[]).map((k) => (
                <option key={k} value={k}>
                  {PAY[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-xxs text-slate">
            Từ ngày
            <Input type="date" name="tu" defaultValue={sp.tu ?? ""} className="h-9" />
          </label>
          <label className="flex flex-col gap-xxs text-slate">
            Đến ngày
            <Input type="date" name="den" defaultValue={sp.den ?? ""} className="h-9" />
          </label>
          <button type="submit" className="h-9 rounded-md border border-hairline-strong px-md text-ink hover:bg-surface">
            Lọc
          </button>
        </form>
        <Link
          href={`${base}/moi`}
          className="inline-flex h-9 items-center rounded-md bg-primary px-md text-sm font-medium text-primary-fg hover:bg-primary-deep"
        >
          + Nhập hàng
        </Link>
      </div>
      <ReceiptTable rows={rows} hrefBase={base} empty="Chưa có phiếu nhập nào khớp bộ lọc." />
    </div>
  );
}
