import type { ChannelSlice } from "@/lib/billing/reports";
import type { ServiceMode } from "@/lib/tenant/settings";
import { orderPlaceGroup } from "@/lib/orders/place-label";
import { formatVnd } from "@/lib/orders/cart";
import { BarRow } from "./BarRow";
import { formatShare } from "@/lib/billing/report-format";

/** Thứ tự hiển thị cố định để kỳ này với kỳ khác không nhảy hàng lung tung. */
const ORDER = ["Tại bàn", "Tại quán", "Mang về", "Giao tận nơi"];

/**
 * Doanh thu theo NƠI PHỤC VỤ (REPORT-08). Không đọc thô cột `channel`: quán chế độ quầy gõ đơn
 * cho khách ăn tại chỗ nhưng không gắn bàn, những đơn đó lưu channel='takeaway' — quy hết về
 * "Mang về" là sai. Dùng chung `orderPlaceGroup` với phiếu bếp và hóa đơn.
 */
export function PlaceBreakdown({
  channels,
  serviceMode,
}: {
  channels: ChannelSlice[];
  serviceMode: ServiceMode;
}) {
  if (channels.length === 0) return <p className="text-sm text-steel">Chưa có dữ liệu.</p>;

  const total = channels.reduce((s, c) => s + c.revenue, 0);
  const grouped = new Map<string, { revenue: number; qr: number }>();
  for (const c of channels) {
    const label = orderPlaceGroup({
      serviceMode,
      hasTable: c.hasTable,
      channel: c.channel,
      source: c.source,
      eatIn: c.eatIn,
    });
    const g = grouped.get(label) ?? { revenue: 0, qr: 0 };
    g.revenue += c.revenue;
    if (c.source === "qr") g.qr += c.revenue;
    grouped.set(label, g);
  }

  const rows = [...grouped.entries()]
    .filter(([, g]) => g.revenue > 0)
    .sort((a, b) => ORDER.indexOf(a[0]) - ORDER.indexOf(b[0]));

  if (rows.length === 0) return <p className="text-sm text-steel">Chưa có dữ liệu.</p>;

  return (
    <ul className="flex flex-col gap-sm">
      {rows.map(([label, g]) => {
        const qrPct = g.revenue > 0 ? Math.round((g.qr / g.revenue) * 100) : 0;
        return (
          <BarRow
            key={label}
            label={label}
            value={`${formatVnd(g.revenue)} · ${formatShare(g.revenue, total)}`}
            pct={total > 0 ? (g.revenue / total) * 100 : 0}
            // Chỉ nói tới QR khi thực sự có khách tự gọi — quán chưa bật QR khỏi phải đọc "QR 0%".
            sub={g.qr > 0 ? `Khách tự gọi QR ${qrPct}% · nhân viên nhập ${100 - qrPct}%` : undefined}
          />
        );
      })}
    </ul>
  );
}
