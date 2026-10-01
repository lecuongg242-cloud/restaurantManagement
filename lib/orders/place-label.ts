/**
 * Nhãn CHỖ của một đơn — dùng chung cho phiếu khách, hóa đơn/tạm tính và màn hình bếp, để ba nơi
 * không bao giờ nói khác nhau về cùng một đơn.
 *
 * Quán chạy chế độ QUẦY (service_mode='counter'): nhân viên gõ đơn cho khách ngay tại quầy, khách
 * ngồi ăn tại quán nhưng ngồi ngẫu nhiên nên KHÔNG gắn bàn. Những đơn này lưu channel='takeaway'
 * (để dùng chung luồng đơn không bàn) nhưng KHÔNG phải mang về → in "Tại quán". Chỉ đơn do KHÁCH
 * tự đặt online (source='online') mới thật sự là mang về / giao tận nơi.
 */
import type { ServiceMode } from "@/lib/tenant/settings";
import type { OrderChannel, OrderSource } from "./types";

export function orderPlaceLabel(args: {
  serviceMode: ServiceMode;
  tableName?: string | null;
  channel: OrderChannel;
  source?: OrderSource | null;
}): string {
  if (args.tableName) return `Bàn ${args.tableName}`;
  if (args.channel === "delivery") return "Giao tận nơi";
  if (args.channel === "takeaway") {
    // Khách tự đặt online → mang về thật. Nhân viên gõ tại quầy ở quán chế độ quầy → ăn tại quán.
    if (args.source === "online" || args.serviceMode !== "counter") return "Mang về";
    return "Tại quán";
  }
  return "Tại quán";
}

/**
 * Nhãn NHÓM cho báo cáo (REPORT-08): mọi đơn có bàn gộp thành "Tại bàn" thay vì tách ra
 * "Bàn B1", "Bàn B2"… Còn lại dùng đúng quy tắc của `orderPlaceLabel` để báo cáo, phiếu bếp
 * và hóa đơn không bao giờ gọi khác nhau về cùng một đơn.
 */
export function orderPlaceGroup(args: {
  serviceMode: ServiceMode;
  hasTable: boolean;
  channel: OrderChannel;
  source?: OrderSource | null;
}): string {
  if (args.hasTable) return "Tại bàn";
  return orderPlaceLabel({ ...args, tableName: null });
}

/** Bàn tối thiểu để dựng nhãn nhóm (P23, QD-029). `group_session_id` = phiên mà bàn được GHÉP vào (bàn phụ). */
export type GroupTableRef = { id: string; name: string; group_session_id?: string | null };

/**
 * Tên bàn trên PHIẾU BẾP / màn bếp / chip "Đơn cần in phiếu" (QD-029 D4): bàn GỌI kèm nhóm — "B3 (nhóm B1)" —
 * để phục vụ biết bưng món ra bàn nào. Bàn không ghép giữ nguyên "B3". Trả TÊN (không có chữ "Bàn"): nơi gọi
 * tự thêm như trước. `null` khi không tra ra bàn chính.
 */
export function kitchenTableName(args: {
  sessionId: string | null;
  mainTableId: string | null;
  orderTableId: string | null;
  tables: Map<string, GroupTableRef>;
}): string | null {
  const main = args.mainTableId ? args.tables.get(args.mainTableId) : undefined;
  if (!main) return null;
  const caller = args.orderTableId ? args.tables.get(args.orderTableId) : undefined;
  const fromOther = !!caller && caller.id !== main.id;
  const grouped =
    fromOther ||
    (args.sessionId != null && [...args.tables.values()].some((t) => t.group_session_id === args.sessionId));
  if (!grouped) return main.name;
  return `${(fromOther ? caller : main).name} (nhóm ${main.name})`;
}

/**
 * Tên bàn trên HÓA ĐƠN / phiếu khách / khối hóa đơn POS (QD-029 D4, theo Sapo): bàn chính + số bàn còn lại —
 * "B1 +4". Bàn còn lại = bàn đang ghép vào phiên ∪ bàn gọi của các đơn trong phiên (để hóa đơn in lại sau khi
 * phiên đóng — lúc đó không còn bàn nào trỏ về phiên — vẫn ghi đúng nhóm). Không ghép ⇒ "B1".
 */
export function groupTableName(args: {
  sessionId: string | null;
  mainTableId: string | null;
  orderTableIds?: (string | null)[];
  tables: Map<string, GroupTableRef>;
}): string | null {
  const main = args.mainTableId ? args.tables.get(args.mainTableId) : undefined;
  if (!main) return null;
  const others = new Set<string>();
  for (const t of args.tables.values())
    if (args.sessionId != null && t.group_session_id === args.sessionId) others.add(t.id);
  for (const id of args.orderTableIds ?? []) if (id) others.add(id);
  others.delete(main.id);
  return others.size > 0 ? `${main.name} +${others.size}` : main.name;
}
