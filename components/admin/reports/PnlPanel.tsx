import Link from "next/link";
import { formatVnd } from "@/lib/orders/cart";
import type { PnlView } from "@/lib/reports/pnl";
import { cn } from "@/lib/utils";

const pct = (p: number) => `${String(p).replace(".", ",")}%`;

/**
 * Khối "Kết quả kinh doanh" (REPORT-20) — chỉ chủ quán (QD-027 C5). Dòng như Sapo FnB / KiotViet; thuế do quán tự khai ở
 * Cài đặt (C9). Mọi con số đi từ `buildPnl` — một nguồn cho màn hình và file xuất.
 */
export function PnlPanel({ v, settingsHref, exportHref }: { v: PnlView; settingsHref?: string; exportHref?: string }) {
  const Row = ({ label, value, strong, sub, sign }: { label: React.ReactNode; value: number; strong?: boolean; sub?: boolean; sign?: "-" | "+" }) => (
    <tr className={cn(strong && "border-t border-hairline-soft")}>
      <td className={cn("py-xs", sub ? "pl-lg text-slate" : "text-ink", strong && "font-medium")}>{label}</td>
      <td className={cn("py-xs text-right tabular-nums", strong ? "font-medium text-ink" : "text-slate", value < 0 && strong && "text-status-late")}>
        {sign === "-" && value > 0 ? "−" : sign === "+" && value > 0 ? "+" : ""}
        {formatVnd(value)}
      </td>
    </tr>
  );

  return (
    <div className="flex flex-col gap-md" data-ket-qua-kinh-doanh>
      <table className="w-full max-w-2xl text-sm">
        <tbody>
          <Row label="Doanh thu bán hàng" value={v.grossSales} />
          <Row label="Giảm giá" value={v.discount} sub sign="-" />
          <Row label="Doanh thu món thuần" value={v.netItemRevenue} />
          {v.serviceCharge > 0 && <Row label="Phí phục vụ" value={v.serviceCharge} sub sign="+" />}
          <Row label="Doanh thu thuần" value={v.netRevenue} strong />
          <Row
            label={v.cogsMode === "closing" ? "Giá vốn hàng bán" : "Chi phí mua nguyên liệu (theo phiếu nhập)"}
            value={v.cogs}
            sign="-"
          />
          <Row label="Lợi nhuận gộp" value={v.grossProfit} strong />
          {v.expenses.map((e) => (
            <Row key={e.name} label={`${e.name} (${e.count} phiếu)`} value={e.amount} sub sign="-" />
          ))}
          <Row label="Tổng chi phí" value={v.totalExpenses} sign="-" />
          {v.otherIncome > 0 && <Row label="Thu nhập khác" value={v.otherIncome} sign="+" />}
          <Row label="Lợi nhuận" value={v.profit} strong />
          {v.taxes.map((t) => (
            <Row
              key={`${t.name}${t.base}${t.pct}`}
              label={`${t.name} ${pct(t.pct)} ${t.base === "revenue" ? "doanh thu" : "lợi nhuận"} (ước tính)`}
              value={t.amount}
              sub
              sign="-"
            />
          ))}
          {v.taxes.length > 0 && <Row label="Lợi nhuận sau thuế" value={v.profitAfterTax} strong />}
        </tbody>
      </table>

      <ul className="flex flex-col gap-xxs text-xs text-steel">
        <li>
          Dòng nối: Doanh thu thuần {formatVnd(v.netRevenue)} + VAT {formatVnd(v.vat)} = Doanh thu {formatVnd(v.kpiRevenue)}
          {v.reconcileGap !== 0 && <span className="text-status-late"> (lệch {formatVnd(v.reconcileGap)} — báo cho hỗ trợ)</span>}.
        </li>
        {v.cogsMode === "purchase" && (
          <li>Quán chưa khai định lượng món nên giá vốn tính bằng tiền mua theo {v.purchaseCount} phiếu nhập trong kỳ (ngày chứng từ).</li>
        )}
        {v.uncostedQty > 0 && (
          <li className="text-status-late">{v.uncostedQty} phần món chưa đủ giá — chưa tính vào giá vốn (lợi nhuận đang cao hơn thực tế).</li>
        )}
        {v.provisionalQty > 0 && <li>{v.provisionalQty} phần món của ngày chưa chốt sổ tính tạm (sổ tự chốt sau 7 ngày).</li>}
        {v.excludedA.count > 0 && (
          <li>
            {v.excludedA.count} phiếu chi nguyên liệu ({formatVnd(v.excludedA.amount)}) không cộng vào chi phí — đã nằm trong giá vốn.
          </li>
        )}
        <li>Trả tiền nhà cung cấp không phải chi phí (tiền hàng đã tính ở giá vốn). Chỉ phiếu chi có &quot;Hạch toán&quot; mới vào đây.</li>
        {v.taxes.length === 0 && settingsHref && (
          <li>
            Chưa khai thuế nộp nhà nước —{" "}
            <Link href={settingsHref} className="text-primary">
              khai ở Cài đặt
            </Link>{" "}
            để thấy lợi nhuận sau thuế.
          </li>
        )}
      </ul>
      {exportHref && (
        <div>
          <a href={exportHref} className="inline-flex h-9 items-center rounded-md border border-hairline-strong px-md text-sm text-ink hover:bg-surface">
            Xuất Excel kết quả kinh doanh
          </a>
        </div>
      )}
    </div>
  );
}
