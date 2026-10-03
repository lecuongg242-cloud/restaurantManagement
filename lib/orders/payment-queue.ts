/**
 * Hàng chờ thanh toán (P27 ORDER-26) — như KiotViet (màu "yêu cầu thanh toán" trên ô bàn) và Sapo (thẻ "Chờ thanh toán"). Một
 * phiên bàn vào hàng khi khách bấm "Gọi thanh toán" ở QR (CALL-02: ghi chú mở đầu "Thanh toán") HOẶC nhân viên đã bấm "Tính
 * tiền" (hóa đơn đang mở). Chờ lâu nhất lên đầu. Thuần — POS tính từ snapshot.
 */
export function isPaymentCall(note: string | null): boolean {
  return !!note && /^(gọi\s+)?thanh toán/i.test(note.trim());
}

const METHODS = ["Tiền mặt", "Chuyển khoản", "Thẻ"];

/** "Thanh toán · Chuyển khoản · …" → "Chuyển khoản" (khách chọn ở CallStaffSheet); không chọn → null. */
export function paymentMethodOf(note: string | null): string | null {
  const parts = (note ?? "").split("·").map((p) => p.trim());
  return parts.find((p) => METHODS.includes(p)) ?? null;
}

export type PayQueueRow = {
  /** Bàn CHÍNH của phiên. */
  tableId: string;
  tableName: string;
  total: number;
  /** Mốc bắt đầu chờ: lượt gọi sớm nhất hoặc lúc mở hóa đơn, cái nào sớm hơn. */
  since: string;
  method: string | null;
  callIds: string[];
  billOpen: boolean;
  /**
   * Đã "Tính tiền" rồi khách gọi thêm: số phần món tính tiền được (đơn đã duyệt, món chưa hủy) CHƯA nằm trên hóa đơn. Mở hóa
   * đơn từ hàng chờ thì `openBillForSession` tự thêm vào → về 0. Tiền `total` lúc đó là của hóa đơn cũ.
   */
  newItems: number;
};

type SessionLike = {
  tableId: string;
  memberTableIds: string[];
  orders: { status?: string; items: { id?: string; status: string; unit_price: number; qty: number }[] }[];
  openBill: { total: number; created_at?: string | null; billedItemIds?: string[] } | null;
};
type CallLike = { id: string; tableId: string; note: string | null; created_at: string };

export function paymentQueue(input: {
  sessions: SessionLike[];
  calls: CallLike[];
  tableName: (tableId: string) => string;
}): PayQueueRow[] {
  const rows: PayQueueRow[] = [];
  for (const s of input.sessions) {
    const ban = new Set([s.tableId, ...s.memberTableIds]);
    const goi = input.calls.filter((c) => ban.has(c.tableId) && isPaymentCall(c.note));
    if (!s.openBill && goi.length === 0) continue;
    const moc = [...goi.map((c) => c.created_at), ...(s.openBill?.created_at ? [s.openBill.created_at] : [])].sort();
    let total = 0;
    let newItems = 0;
    const billed = s.openBill?.billedItemIds ? new Set(s.openBill.billedItemIds) : null;
    for (const o of s.orders)
      for (const it of o.items) {
        if (it.status === "cancelled") continue;
        total += it.unit_price * it.qty;
        // Như collectBillableSessionItems: đơn chờ duyệt / đã hủy chưa tính tiền được.
        const billable = o.status !== "pending_confirm" && o.status !== "cancelled";
        if (billed && billable && it.id && !billed.has(it.id)) newItems += it.qty;
      }
    rows.push({
      tableId: s.tableId,
      tableName: input.tableName(s.tableId),
      total: s.openBill?.total ?? total,
      since: moc[0] ?? new Date().toISOString(),
      method: goi.map((c) => paymentMethodOf(c.note)).find((m) => m) ?? null,
      callIds: goi.map((c) => c.id),
      billOpen: !!s.openBill,
      newItems,
    });
  }
  return rows.sort((a, b) => a.since.localeCompare(b.since));
}
