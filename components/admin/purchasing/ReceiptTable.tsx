import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { ClickableRow } from "./ClickableRow";
import { formatVnd } from "@/lib/orders/cart";
import { ngayVn, STATUS_LABEL } from "@/lib/purchasing/receipt";
import { gioNgayNamVn } from "@/lib/time/vn";
import type { ReceiptListRow, ReceiptStatus } from "@/lib/purchasing/data";

const VARIANT: Record<ReceiptStatus, "cream" | "ready" | "done"> = { draft: "cream", done: "ready", cancelled: "done" };

export function ReceiptStatusBadge({ status }: { status: ReceiptStatus }) {
  return <Badge variant={VARIANT[status]}>{STATUS_LABEL[status]}</Badge>;
}

/** Bảng phiếu nhập — dùng ở Nguyên liệu → Phiếu nhập và chi tiết nhà cung cấp. */
export function ReceiptTable({
  rows,
  hrefBase,
  showSupplier = true,
  empty = "Chưa có phiếu nhập nào.",
}: {
  rows: ReceiptListRow[];
  hrefBase: string;
  showSupplier?: boolean;
  empty?: string;
}) {
  return (
    <section className="rounded-lg border border-hairline-soft bg-canvas shadow-card">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[56rem] text-left text-sm" data-danh-sach-phieu-nhap>
          <thead className="border-b border-hairline-soft text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-lg py-sm font-medium">Mã phiếu</th>
              <th className="px-md py-sm font-medium">Thời gian nhập</th>
              {showSupplier && <th className="px-md py-sm font-medium">Nhà cung cấp</th>}
              <th className="px-md py-sm font-medium">Hàng nhập</th>
              <th className="px-md py-sm text-right font-medium">Cần trả NCC</th>
              <th className="px-md py-sm text-right font-medium">Đã trả</th>
              <th className="px-md py-sm text-right font-medium">Còn nợ</th>
              <th className="px-lg py-sm font-medium">Trạng thái</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline-soft">
            {rows.map((r) => (
              <ClickableRow key={r.id} href={`${hrefBase}/${r.id}`} className="hover:bg-surface/60">
                <td className="px-lg py-sm">
                  <Link href={`${hrefBase}/${r.id}`} className="font-mono text-ink underline-offset-4 hover:underline">
                    {r.code}
                  </Link>
                </td>
                <td className="whitespace-nowrap px-md py-sm text-slate">
                  {r.received_at ? gioNgayNamVn(r.received_at) : ngayVn(r.doc_date)}
                </td>
                {showSupplier && <td className="px-md py-sm text-slate">{r.supplier?.name ?? "—"}</td>}
                <td className="max-w-[28rem] truncate px-md py-sm text-slate" title={r.items.join("\n")}>
                  {r.items.slice(0, 3).join(" · ")}
                  {r.items.length > 3 && <span className="text-steel"> +{r.items.length - 3}</span>}
                </td>
                <td className="px-md py-sm text-right tabular-nums text-ink">{formatVnd(r.total)}</td>
                <td className="px-md py-sm text-right tabular-nums text-slate">{formatVnd(r.paid)}</td>
                <td className="px-md py-sm text-right tabular-nums">
                  {r.status === "done" && r.supplier && r.total - r.paid > 0 ? (
                    <span className="font-medium text-ink">{formatVnd(r.total - r.paid)}</span>
                  ) : (
                    <span className="text-steel">—</span>
                  )}
                </td>
                <td className="px-lg py-sm">
                  <ReceiptStatusBadge status={r.status} />
                </td>
              </ClickableRow>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={showSupplier ? 8 : 7} className="px-lg py-lg text-center text-sm text-steel">
                  {empty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
