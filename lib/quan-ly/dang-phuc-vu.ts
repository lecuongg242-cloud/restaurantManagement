/**
 * Thẻ "Đang phục vụ" của app Quản lý (P30, Giao diện B5): số bàn có khách + tiền tạm tính chưa thu. Cùng cách cộng với
 * sơ đồ bàn POS (`components/pos/TableMap.tsx`): bỏ món hủy, tiền nhóm bàn (P23) tính một lần ở bàn chính.
 * Đầu vào là phần nhỏ của `PosSnapshot` (getPosSnapshot) — không đọc lại DB.
 */
type Phien = {
  tableId: string;
  memberTableIds: string[];
  opened_at: string;
  orders: { items: { unit_price: number; qty: number; status: string }[] }[];
};

export type BanDangPhucVu = { ban: string; gioVao: string; tamTinh: number };

export function tomTatDangPhucVu(snap: { tables: { id: string; name: string }[]; sessions: Phien[] }): {
  soBanCoKhach: number;
  tongBan: number;
  tamTinh: number;
  ds: BanDangPhucVu[];
} {
  const ten = new Map(snap.tables.map((t) => [t.id, t.name]));
  const ds = snap.sessions
    .map((s) => {
      let tamTinh = 0;
      for (const o of s.orders) for (const it of o.items) if (it.status !== "cancelled") tamTinh += it.unit_price * it.qty;
      const chinh = ten.get(s.tableId) ?? "?";
      return { ban: s.memberTableIds.length ? `${chinh} +${s.memberTableIds.length}` : chinh, gioVao: s.opened_at, tamTinh };
    })
    .sort((a, b) => a.gioVao.localeCompare(b.gioVao));
  return {
    soBanCoKhach: snap.sessions.reduce((n, s) => n + 1 + s.memberTableIds.length, 0),
    tongBan: snap.tables.length,
    tamTinh: ds.reduce((n, d) => n + d.tamTinh, 0),
    ds,
  };
}
