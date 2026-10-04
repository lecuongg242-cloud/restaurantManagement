import Link from "next/link";
import { notFound } from "next/navigation";
import { getSessionMembership } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getVoucher } from "@/lib/cashbook/data";
import { COST_GROUP_LABEL, COUNTERPARTY_LABEL, FUND_LABEL, isoToVnLocal, SOURCE_DOC_LABEL } from "@/lib/cashbook/labels";
import { ngayVn } from "@/lib/purchasing/receipt";
import { formatVnd } from "@/lib/orders/cart";
import { gioNgayNamVn } from "@/lib/time/vn";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { cancelVoucher, updateVoucherMeta } from "../actions";

export const dynamic = "force-dynamic";

const SOURCE: Record<string, string> = {
  manual: "Lập tay",
  opening: "Số dư đầu kỳ",
  purchase: "Tự sinh từ phiếu nhập",
  supplier_payment: "Tự sinh khi trả nợ nhà cung cấp",
};

/** Chi tiết phiếu thu / chi (CASH-04): sửa ghi chú + thời gian; "Hủy phiếu" = vô hiệu, không xóa. */
export default async function VoucherPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const session = (await getSessionMembership(slug))!;
  const v = await getVoucher(await createClient(), session.tenant.id, id);
  if (!v) notFound();
  const chi = v.direction === "out";
  const hidden = (
    <>
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="id" value={id} />
    </>
  );
  const row = (k: string, val: React.ReactNode) => (
    <div className="flex flex-wrap justify-between gap-sm py-xs">
      <dt className="text-steel">{k}</dt>
      <dd className="text-right text-ink">{val}</dd>
    </div>
  );

  return (
    <div className="flex max-w-3xl flex-col gap-lg">
      <header>
        <Link href={`/r/${slug}/admin/so-quy?quy=${v.fund}`} className="text-sm text-primary">
          ‹ Sổ quỹ
        </Link>
        <h1 className="mt-xxs flex flex-wrap items-center gap-sm font-semibold text-2xl text-ink">
          {chi ? "Phiếu chi" : "Phiếu thu"} <span className="font-mono text-lg">{v.code}</span>
          {v.status === "cancelled" ? <Badge variant="done">Đã hủy</Badge> : <Badge variant="ready">Còn hiệu lực</Badge>}
        </h1>
      </header>

      <Card>
        <dl className="divide-y divide-hairline-soft text-sm">
          {row("Giá trị", <span className="font-medium tabular-nums">{formatVnd(v.amount)}</span>)}
          {row("Quỹ", FUND_LABEL[v.fund])}
          {row("Thời gian", gioNgayNamVn(v.occurred_at))}
          {row("Loại", v.category?.name ?? SOURCE[v.source] ?? "—")}
          {v.category && chi && row("Mục chi phí", COST_GROUP_LABEL[v.category.cost_group])}
          {row("Hạch toán vào kết quả kinh doanh", v.in_pnl ? "Có" : "Không")}
          {(v.supplier || v.counterparty_name) &&
            row(
              `Người ${chi ? "nhận" : "nộp"}`,
              v.supplier ? (
                <Link href={`/r/${slug}/admin/nha-cung-cap/${v.supplier.id}`} className="text-primary">
                  {v.supplier.name}
                </Link>
              ) : (
                `${v.counterparty_name}${v.counterparty_kind ? ` · ${COUNTERPARTY_LABEL[v.counterparty_kind as keyof typeof COUNTERPARTY_LABEL]}` : ""}`
              )
            )}
          {v.receipt &&
            row(
              "Phiếu nhập",
              <Link href={`/r/${slug}/admin/nhap-hang/${v.receipt.id}`} className="font-mono text-primary">
                {v.receipt.code}
              </Link>
            )}
          {v.source_doc_kind &&
            row(
              "Chứng từ gốc",
              `${SOURCE_DOC_LABEL[v.source_doc_kind as keyof typeof SOURCE_DOC_LABEL]}${v.source_doc_no ? ` số ${v.source_doc_no}` : ""}${v.source_doc_date ? ` ngày ${ngayVn(v.source_doc_date)}` : ""}`
            )}
          {row("Nguồn", SOURCE[v.source] ?? v.source)}
          {v.cancelled_at && row("Hủy lúc", gioNgayNamVn(v.cancelled_at))}
        </dl>
      </Card>

      {v.status === "active" && (
        <Card>
          <h2 className="text-base font-medium text-ink">Sửa phiếu</h2>
          <p className="mt-xxs text-sm text-steel">Chỉ sửa ghi chú và thời gian. Sai số tiền hay loại thì hủy phiếu rồi lập lại.</p>
          <form action={updateVoucherMeta} className="mt-md grid gap-md sm:grid-cols-3">
            {hidden}
            <label className="flex flex-col gap-xxs text-sm text-slate">
              Thời gian
              <Input type="datetime-local" name="occurred_at" defaultValue={isoToVnLocal(v.occurred_at)} />
            </label>
            <label className="flex flex-col gap-xxs text-sm text-slate sm:col-span-2">
              Ghi chú
              <Input name="note" maxLength={500} defaultValue={v.note ?? ""} />
            </label>
            <div>
              <SubmitButton size="sm" pendingLabel="Đang lưu…">Lưu</SubmitButton>
            </div>
          </form>
        </Card>
      )}

      {v.status === "active" && v.source !== "purchase" && (
        <form action={cancelVoucher} className="border-t border-hairline-soft pt-md text-sm">
          {hidden}
          <ConfirmSubmit message={`Hủy ${chi ? "phiếu chi" : "phiếu thu"} ${v.code}? Tồn quỹ sẽ tính lại. Không hoàn tác được.`} className="text-status-late hover:underline">
            Hủy phiếu
          </ConfirmSubmit>
        </form>
      )}
      {v.status === "active" && v.source === "purchase" && v.receipt && (
        <p className="text-sm text-steel">
          Phiếu này sinh từ phiếu nhập — muốn hủy thì Hủy bỏ phiếu nhập{" "}
          <Link href={`/r/${slug}/admin/nhap-hang/${v.receipt.id}`} className="text-primary">{v.receipt.code}</Link>.
        </p>
      )}
    </div>
  );
}
