/**
 * Trạng thái từng bàn trong hộp "Ghép bàn" (P23, QD-029 D5/D6, 00-TongQuan §Giao diện mục 2). Hàm thuần, chạy ở
 * client từ ảnh chụp POS. Chỉ để HIỂN THỊ — RPC `set_table_group` mới là chốt thật (ảnh chụp có thể cũ một nhịp).
 */
import type { PosPending, PosSession, PosTable } from "./pos";

export type GroupCandidate = {
  table: PosTable;
  /** Đang tích (bàn chính hoặc bàn phụ hiện tại). */
  checked: boolean;
  /** Không đổi được tích. */
  locked: boolean;
  /** Nhãn nhỏ dưới tên bàn, null = không có. */
  note: string | null;
  /** Nhãn mang tính cảnh báo (bàn mờ). */
  muted: boolean;
};

const unpaid = (status: string) => status !== "served" && status !== "cancelled";

export function groupCandidates(args: {
  mainTableId: string;
  tables: PosTable[];
  sessions: PosSession[];
  pending: PosPending[];
}): GroupCandidate[] {
  const { mainTableId, tables, sessions, pending } = args;
  const nameOf = new Map(tables.map((t) => [t.id, t.name]));
  const ownSession = new Map(sessions.map((s) => [s.tableId, s]));
  const sessionById = new Map(sessions.map((s) => [s.id, s]));
  const group = ownSession.get(mainTableId) ?? null;
  const members = new Set(group?.memberTableIds ?? []);

  return tables.map((t): GroupCandidate => {
    if (t.id === mainTableId) return { table: t, checked: true, locked: true, note: "Bàn chính", muted: false };

    if (members.has(t.id)) {
      let n = 0;
      for (const o of group?.orders ?? [])
        if (o.table_id === t.id) for (const it of o.items) if (unpaid(it.status)) n++;
      for (const p of pending) if (p.tableId === t.id) for (const it of p.items) if (unpaid(it.status)) n++;
      return n > 0
        ? { table: t, checked: true, locked: true, note: `còn ${n} món chưa thu`, muted: false }
        : { table: t, checked: true, locked: false, note: null, muted: false };
    }

    if (t.groupSessionId) {
      const main = sessionById.get(t.groupSessionId);
      const mainName = main ? nameOf.get(main.tableId) : undefined;
      return { table: t, checked: false, locked: true, note: `Nhóm ${mainName ?? "khác"}`, muted: true };
    }

    const own = ownSession.get(t.id);
    if (own && own.memberTableIds.length > 0)
      return { table: t, checked: false, locked: true, note: `Nhóm ${t.name}`, muted: true };
    if (own?.openBill) return { table: t, checked: false, locked: true, note: "Đang có hóa đơn", muted: true };

    let n = 0;
    for (const o of own?.orders ?? []) for (const it of o.items) if (it.status !== "cancelled") n++;
    for (const p of pending) if (p.tableId === t.id) n += p.items.length;
    return { table: t, checked: false, locked: false, note: n > 0 ? `${n} món — chuyển vào nhóm` : null, muted: false };
  });
}
