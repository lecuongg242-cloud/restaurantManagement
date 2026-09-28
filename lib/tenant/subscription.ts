/**
 * Hạn dùng của quán (SUB-01..03, QD-021 D6–D7). Thuần hàm — dùng được ở server lẫn client.
 *
 * MỘT ĐỊNH NGHĨA: cổng khóa thật nằm ở SQL (`tenant_usable_on`, migration 0057) vì nó phải chặn cả RLS.
 * File này chỉ tính TRẠNG THÁI để hiển thị (banner, /super, trang Gia hạn); test
 * `tests/rls/subscription.test.ts` chạy cùng một bảng ca qua cả hai để chúng không lệch nhau.
 *
 * Ngày là chuỗi `YYYY-MM-DD` (cột `date` của Postgres), không phải `Date` — tránh lệch múi giờ.
 */
import { khongDauInHoa } from "@/lib/payments/vietqr";

/** Nhắc trước hạn bao nhiêu ngày (QD-021 U1 — mặc định đề xuất, chưa chốt: 7). */
export const REMIND_DAYS = 7;
/** Ân hạn sau `paid_until` bao nhiêu ngày vẫn bán được (QD-021 U2 — mặc định đề xuất: 7). Khớp SQL 0057. */
export const GRACE_DAYS = 7;
/**
 * "Ngày" hạn dùng đổi lúc 04:00 giờ VN, không phải 00:00 — quán đang mở bàn lúc nửa đêm không bị
 * khóa giữa ca. Khớp `interval '4 hours'` trong SQL 0057.
 */
export const GIO_DOI_NGAY = 4;

export type SubscriptionState = "unlimited" | "ok" | "due_soon" | "grace" | "locked";

const NGAY_MS = 86_400_000;

function ngay(s: string): number {
  const [y, m, d] = s.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function chuoi(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Hôm nay theo lịch hạn dùng: giờ VN (UTC+7, không có giờ mùa hè) lùi `GIO_DOI_NGAY` tiếng. */
export function homNayHanDung(now: Date = new Date()): string {
  return chuoi(now.getTime() + (7 - GIO_DOI_NGAY) * 3_600_000);
}

/** Số ngày còn lại tới hết `paid_until` (0 = hôm nay là ngày cuối; âm = đã quá hạn). */
export function daysLeft(paidUntil: string, today: string): number {
  return Math.round((ngay(paidUntil) - ngay(today)) / NGAY_MS);
}

export function subscriptionState(paidUntil: string | null, today: string): SubscriptionState {
  if (!paidUntil) return "unlimited";
  const d = daysLeft(paidUntil, today);
  if (d > REMIND_DAYS) return "ok";
  if (d >= 0) return "due_soon";
  if (d >= -GRACE_DAYS) return "grace";
  return "locked";
}

/**
 * Cộng tháng theo quy ước của Postgres (`date + interval 'n months'`): ngày không tồn tại ở tháng đích
 * thì lùi về ngày cuối tháng — 31/01 + 1 tháng = 28/02 (29/02 năm nhuận). RPC gia hạn (0058) tính bằng
 * SQL; hàm này chỉ để hiển thị trước "hạn mới sẽ là" và để test đối chiếu.
 */
export function congThang(date: string, months: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const tong = y * 12 + (m - 1) + months;
  const ny = Math.floor(tong / 12);
  const nm = tong % 12;
  const cuoiThang = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return chuoi(Date.UTC(ny, nm, Math.min(d, cuoiThang)));
}

/** Hạn mới sau khi gia hạn `months` tháng: cộng từ hạn cũ nếu còn hạn, từ hôm nay nếu đã quá. */
export function hanSauGiaHan(paidUntil: string, today: string, months: number): string {
  return congThang(mocGiaHan(paidUntil, today), months);
}

/** "27/09/2026" */
export function ngayVnHienThi(date: string): string {
  const [y, m, d] = date.split("-");
  return `${d}/${m}/${y}`;
}

/**
 * Banner nhắc hạn (SUB-02) cho một vai trò. CHỈ owner/manager — người trả tiền và quản lý ca; thu ngân,
 * phục vụ, bếp không làm gì được với nó, hiện ra chỉ gây hoang mang giữa ca.
 */
export type SubscriptionBanner = { tone: "warn" | "danger"; text: string };

export function subscriptionBanner(
  role: string,
  paidUntil: string | null,
  today: string
): SubscriptionBanner | null {
  if (role !== "owner" && role !== "manager") return null;
  const state = subscriptionState(paidUntil, today);
  if (!paidUntil || (state !== "due_soon" && state !== "grace")) return null;
  const d = daysLeft(paidUntil, today);
  const han = ngayVnHienThi(paidUntil);
  if (state === "due_soon") {
    return {
      tone: "warn",
      text: d === 0 ? `Hôm nay là ngày cuối của hạn dùng (${han}).` : `Còn ${d} ngày sử dụng — hết hạn ${han}.`,
    };
  }
  const conLai = GRACE_DAYS + d; // số ngày ân hạn còn lại sau hôm nay
  return {
    tone: "danger",
    text:
      conLai === 0
        ? `Đã quá hạn ${-d} ngày — hệ thống sẽ KHÓA từ 04:00 sáng mai.`
        : `Đã quá hạn ${-d} ngày — còn ${conLai} ngày nữa hệ thống sẽ khóa.`,
  };
}

/**
 * Nội dung chuyển khoản gia hạn — đọc là hiểu: việc gì, quán nào, mấy tháng. `GIAHAN QTFOOD 12T` (vĩnh viễn: `VV`)
 * (không dấu, ≤ 25 ký tự — ngân hàng cắt nội dung dài). Mã quán dài hơn 14 ký tự thì cắt còn 8 và thêm
 * 5 ký tự băm của CẢ slug, để hai quán cùng tiền tố vẫn phân biệt được trên sao kê.
 */
export function noiDungGiaHan(slug: string, thang: number | null): string {
  const gon = khongDauInHoa(slug).replace(/ /g, "");
  const duoi = thang == null ? "VV" : `${thang}T`; // VV = vĩnh viễn
  if (gon.length <= 14) return `GIAHAN ${gon} ${duoi}`;
  let h = 0x811c9dc5; // FNV-1a 32-bit
  for (let i = 0; i < slug.length; i++) {
    h ^= slug.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  const bam = h.toString(36).toUpperCase().padStart(5, "0").slice(-5);
  return `GIAHAN ${gon.slice(0, 8)}${bam} ${duoi}`;
}

/** Gia hạn tối đa chọn trên lịch một lần. */
export const THANG_TOI_DA = 36;

/**
 * Super-admin chọn NGÀY hết hạn mới trên lịch → số tháng tương ứng (làm TRÒN LÊN, từ max(hôm nay, hạn cũ)) —
 * chỉ để GỢI Ý số tiền. `null` khi ngày chọn không sau mốc gốc hoặc vượt `THANG_TOI_DA`.
 */
export function soThangToiNgay(goc: string, den: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(den) || den <= goc) return null;
  for (let m = 1; m <= THANG_TOI_DA; m++) if (congThang(goc, m) >= den) return m;
  return null;
}

/** Mốc bắt đầu cộng khi gia hạn: hạn cũ nếu còn, không thì hôm nay (khớp RPC 0058). */
export function mocGiaHan(paidUntil: string | null, today: string): string {
  return paidUntil && paidUntil > today ? paidUntil : today;
}
