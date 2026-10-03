import type { KdsTicket } from "./kds";

/**
 * Hai cột màn bếp (P27 ORDER-04, như KiotViet "Chờ chế biến" / "Đã xong – Chờ cung ứng"): một đơn có thể nằm ở cả hai cột,
 * mỗi cột chỉ mang món đúng trạng thái. Giữ thứ tự vé (cũ → mới).
 */
export function splitKdsColumns(tickets: KdsTicket[]): { todo: KdsTicket[]; done: KdsTicket[] } {
  const todo: KdsTicket[] = [];
  const done: KdsTicket[] = [];
  for (const t of tickets) {
    const cho = t.items.filter((i) => i.status === "queued" || i.status === "preparing");
    const xong = t.items.filter((i) => i.status === "ready");
    if (cho.length) todo.push({ ...t, items: cho });
    if (xong.length) done.push({ ...t, items: xong });
  }
  return { todo, done };
}
