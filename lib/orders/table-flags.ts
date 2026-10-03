/**
 * Dấu "cần xử lý" trên thẻ bàn + lọc sơ đồ bàn (P27 ORDER-24). Thuần — POS tính từ snapshot đã có, không truy vấn thêm.
 * Như KiotViet: chuông trên ô bàn, lọc "Tất cả / Sử dụng / Còn trống"; thêm "Cần xử lý" cho quán đông.
 */
export type TableFlags = {
  /** Đơn khách gọi qua QR đang chờ duyệt. */
  pending: number;
  /** Đơn đã xác nhận chưa in phiếu bếp (ORDER-16). */
  unprinted: number;
  /** Lượt gọi nhân viên chưa xử lý. */
  calls: number;
  /** Món bếp đã xong, phục vụ chưa mang ra (QD-032). */
  ready: number;
  /** Đang chờ thanh toán (lib/orders/payment-queue — ORDER-26): 1 / 0. */
  payment: number;
};

export type TableFilter = "all" | "busy" | "free" | "attention" | "pay";

type SessionLike = {
  tableId: string;
  orders: { table_id: string | null; items: { status: string; delivered: boolean }[] }[];
};

export function tableFlags(input: {
  pending: { tableId: string | null }[];
  unprinted: { tableId: string }[];
  calls: { tableId: string }[];
  sessions: SessionLike[];
  /** Bàn (chính) đang trong hàng chờ thanh toán. */
  payTableIds?: string[];
}): Map<string, TableFlags> {
  const out = new Map<string, TableFlags>();
  const of = (id: string) => {
    let f = out.get(id);
    if (!f) out.set(id, (f = { pending: 0, unprinted: 0, calls: 0, ready: 0, payment: 0 }));
    return f;
  };
  for (const id of input.payTableIds ?? []) of(id).payment = 1;
  for (const p of input.pending) if (p.tableId) of(p.tableId).pending++;
  for (const u of input.unprinted) if (u.tableId) of(u.tableId).unprinted++;
  for (const c of input.calls) if (c.tableId) of(c.tableId).calls++;
  for (const s of input.sessions)
    for (const o of s.orders) {
      // Bàn GỌI (P23): đơn từ bàn phụ trong nhóm mang dấu ở bàn phụ, như phiếu bếp ghi.
      const n = o.items.filter((i) => i.status === "ready" && !i.delivered).length;
      if (n > 0) of(o.table_id ?? s.tableId).ready += n;
    }
  return out;
}

export function needsAttention(f: TableFlags | undefined): boolean {
  return !!f && f.pending + f.unprinted + f.calls + f.ready + f.payment > 0;
}

export function matchesTableFilter(
  table: { id: string; status: "available" | "occupied" | "reserved" | "cleaning" },
  flags: TableFlags | undefined,
  filter: TableFilter
): boolean {
  switch (filter) {
    case "busy":
      return table.status === "occupied";
    case "free":
      return table.status === "available";
    case "attention":
      return needsAttention(flags);
    case "pay":
      return (flags?.payment ?? 0) > 0;
    default:
      return true;
  }
}
