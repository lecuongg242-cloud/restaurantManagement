/**
 * Phiếu đang chờ cầu in khi cầu in mất kết nối (P17 17-02, OFFLINE-03). Thuần — test được không cần DB.
 *
 * Cầu in bỏ phiếu `pending` cũ hơn 30 phút (`MAX_JOB_AGE_MIN` trong scripts/print-bridge.mjs) để bếp không nhận
 * phiếu hôm qua khi máy bật lại. Nhân viên phải BIẾT phiếu nào sẽ không in bù để tự đọc cho bếp.
 */
export const KHONG_IN_BU_MS = 30 * 60_000;

export type DongPhieuCho = {
  id: string;
  type: string;
  created_at: string;
  payload: { kitchenNo?: number | null; tableName?: string | null; items?: { name: string; qty: number }[] } | null;
};

export type PhieuCho = {
  id: string;
  /** Phiếu bếp / hóa đơn / phiếu khách. */
  loai: "bep" | "hoa-don" | "phieu-khach";
  soDon: number | null;
  noi: string | null;
  luc: string;
  mon: string[];
  /** Đã quá 30 phút — cầu in có mạng lại cũng KHÔNG in phiếu này. */
  khongInBu: boolean;
};

const LOAI: Record<string, PhieuCho["loai"]> = {
  kitchen_ticket: "bep",
  receipt: "hoa-don",
  customer_ticket: "phieu-khach",
};

export function phieuCho(rows: DongPhieuCho[], now: number): PhieuCho[] {
  return [...rows]
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((r) => ({
      id: r.id,
      loai: LOAI[r.type] ?? "bep",
      soDon: r.payload?.kitchenNo ?? null,
      noi: r.payload?.tableName ?? null,
      luc: r.created_at,
      mon: (r.payload?.items ?? []).map((i) => `${i.qty}× ${i.name}`),
      khongInBu: now - Date.parse(r.created_at) > KHONG_IN_BU_MS,
    }));
}
