/**
 * Bản chụp dữ liệu POS để máy quầy MẤT MẠNG vẫn xem được (P17 17-01, OFFLINE-01, QD-024 D4).
 *
 * Máy quầy offline CHỈ XEM — không gọi món, không thu tiền (việc đó làm trên điện thoại 5G). Vì vậy bản chụp
 * dựng bằng DANH SÁCH TRẮNG từng trường, không bao giờ trải (`...`) đối tượng gốc: thêm một cột vào snapshot
 * server (PIN, token, SĐT khách, tài khoản ngân hàng…) không được tự lọt xuống ổ đĩa máy quầy.
 * `tests/offline/snapshot.test.ts` liệt kê mọi khóa được lưu.
 *
 * Tách theo slug: một máy có thể mở nhiều chi nhánh (P15).
 */
import type { PosSnapshot } from "@/lib/orders/pos";
import type { CustomerMenu } from "@/lib/orders/customer-menu";

/** Đổi HÌNH DẠNG bản chụp thì tăng số này — bản cũ trên máy bị bỏ, không đọc sai. */
export const PHIEN_BAN_BAN_CHUP = 1;

export type MonChup = { ten: string; sl: number; tuyChon: string[]; ghiChu: string | null; huy: boolean };
export type DonChup = { soDon: number | null; trangThai: string; luc: string; mon: MonChup[] };

export type BanChup = {
  v: typeof PHIEN_BAN_BAN_CHUP;
  slug: string;
  tenQuan: string;
  luc: string;
  khu: { id: string; ten: string }[];
  ban: { id: string; ten: string; khuId: string | null; trangThai: string }[];
  /** `banPhu` = bàn ghép vào phiên (P23). Bản chụp cũ không có khóa này ⇒ đọc như rỗng. */
  phien: { banId: string; banPhu?: string[]; moLuc: string; soHd: number | null; tongHd: number | null; don: DonChup[] }[];
  /** Đơn không bàn (mang về / tại quầy / online). KHÔNG có tên, SĐT khách — số đơn đủ để giao món. */
  khongBan: { soDon: number | null; kenh: string; trangThai: string; luc: string; tong: number; mon: MonChup[] }[];
  thucDon: { nhom: string; mon: { ten: string; gia: number; con: boolean }[] }[];
};

const mon = (m: { name: string; qty: number; modifiers: string[]; note: string | null; status: string }): MonChup => ({
  ten: m.name,
  sl: m.qty,
  tuyChon: [...m.modifiers],
  ghiChu: m.note,
  huy: m.status === "cancelled",
});

export function taoBanChup(slug: string, s: PosSnapshot, menu: CustomerMenu | null, now: Date): BanChup {
  return {
    v: PHIEN_BAN_BAN_CHUP,
    slug,
    tenQuan: menu?.tenant.name ?? slug,
    luc: now.toISOString(),
    khu: s.areas.map((a) => ({ id: a.id, ten: a.name })),
    ban: s.tables.map((t) => ({ id: t.id, ten: t.name, khuId: t.area_id, trangThai: t.status })),
    phien: s.sessions.map((p) => ({
      banId: p.tableId,
      banPhu: [...p.memberTableIds],
      moLuc: p.opened_at,
      soHd: p.openBill?.bill_no ?? null,
      tongHd: p.openBill?.total ?? null,
      don: p.orders.map((o) => ({ soDon: o.kitchen_no, trangThai: o.status, luc: o.created_at, mon: o.items.map(mon) })),
    })),
    khongBan: s.takeawayOrders.map((o) => ({
      soDon: o.kitchenNo,
      kenh: o.channel,
      trangThai: o.status,
      luc: o.createdAt,
      tong: o.total,
      mon: o.items.map((i) => mon({ name: i.name, qty: i.qty, modifiers: i.modifiers, note: i.note, status: i.status })),
    })),
    thucDon: (menu?.categories ?? []).map((c) => ({
      nhom: c.name,
      mon: c.items.map((i) => ({ ten: i.name, gia: i.base_price, con: i.is_available })),
    })),
  };
}

/** Đọc lại từ ổ đĩa: sai phiên bản / sai quán / hỏng → null (máy sẽ xóa bản đó). */
export function banChupHopLe(raw: unknown, slug: string): BanChup | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Partial<BanChup>;
  if (b.v !== PHIEN_BAN_BAN_CHUP || b.slug !== slug || typeof b.luc !== "string") return null;
  if (!Array.isArray(b.ban) || !Array.isArray(b.phien) || !Array.isArray(b.khongBan) || !Array.isArray(b.thucDon)) return null;
  return b as BanChup;
}

// ── IndexedDB (chỉ chạy ở trình duyệt) ────────────────────────────────────────
const TEN_DB = "pos-offline";
const KHO = "ban-chup";

function moDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(TEN_DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(KHO);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function giaoDich<T>(che: IDBTransactionMode, lam: (kho: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await moDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = lam(db.transaction(KHO, che).objectStore(KHO));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

let daXinGiu = false;

/** Ghi bản chụp. Lỗi (trình duyệt chặn lưu trữ, tab ẩn danh) → bỏ qua: POS online vẫn chạy bình thường. */
export async function luuBanChup(b: BanChup): Promise<void> {
  try {
    await giaoDich("readwrite", (kho) => kho.put(b, b.slug));
    // Xin trình duyệt KHÔNG tự xóa dữ liệu khi thiếu chỗ. Chỉ xin một lần mỗi phiên trang.
    if (!daXinGiu && navigator.storage?.persist) {
      daXinGiu = true;
      navigator.storage.persist().catch(() => {});
    }
  } catch {
    /* không lưu được thì lúc mất mạng màn xem offline báo "chưa có dữ liệu" */
  }
}

export async function docBanChup(slug: string): Promise<BanChup | null> {
  try {
    const raw = await giaoDich("readonly", (kho) => kho.get(slug));
    const b = banChupHopLe(raw, slug);
    if (!b && raw) await giaoDich("readwrite", (kho) => kho.delete(slug));
    return b;
  } catch {
    return null;
  }
}
