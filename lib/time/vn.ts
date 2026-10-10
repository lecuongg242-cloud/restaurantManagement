/**
 * Định dạng thời điểm theo giờ Việt Nam. Thuần hàm, dùng được ở cả server lẫn client component.
 *
 * VÌ SAO TỒN TẠI: `new Date(iso).toLocaleString("vi-VN", …)` không nêu `timeZone` sẽ lấy múi giờ
 * của MÁY ĐANG CHẠY. Trên Vercel máy chạy ở UTC nên phiếu in ra sớm 7 tiếng — có hóa đơn ghi
 * 23:34 23/09 trong khi khách vừa trả tiền sáng 24/09. Ở máy dev (UTC+7) thì lại nhìn đúng, nên
 * lỗi không lộ ra suốt quá trình phát triển. Với client component thì múi giờ là của máy nhân
 * viên — đúng hôm nay, nhưng một laptop đặt sai giờ là đủ để in sai phiếu.
 *
 * Mọi chỗ hiển thị thời gian cho người ở quán phải đi qua đây, không gọi `toLocale*` trực tiếp.
 *
 * Tự dựng chuỗi từ `formatToParts` thay vì tin vào thứ tự mà locale "vi-VN" trả về: thứ tự đó là
 * dữ liệu ICU, đổi theo phiên bản Node, và phiếu in thì phải ổn định.
 */

const MUI_GIO_VN = "Asia/Ho_Chi_Minh";

type Phan = "hour" | "minute" | "day" | "month" | "year";

function phan(iso: string, can: Phan[]): Record<Phan, string> | null {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return null;

  const opts: Intl.DateTimeFormatOptions = { timeZone: MUI_GIO_VN, hour12: false };
  for (const p of can) opts[p] = p === "year" ? "numeric" : "2-digit";

  const out = {} as Record<Phan, string>;
  for (const { type, value } of new Intl.DateTimeFormat("en-GB", opts).formatToParts(t)) {
    if (can.includes(type as Phan)) out[type as Phan] = value;
  }
  // Giờ 00 bị một số phiên bản ICU trả về "24" khi hour12:false.
  if (out.hour === "24") out.hour = "00";
  return out;
}

/** "13:34" */
export function gioVn(iso: string | null | undefined): string {
  if (!iso) return "";
  const p = phan(iso, ["hour", "minute"]);
  return p ? `${p.hour}:${p.minute}` : "";
}

/** "13:34 24/09" */
export function gioNgayVn(iso: string | null | undefined): string {
  if (!iso) return "";
  const p = phan(iso, ["hour", "minute", "day", "month"]);
  return p ? `${p.hour}:${p.minute} ${p.day}/${p.month}` : "";
}

/** "24/09/2026 13:34" — phiếu bếp, phiếu khách (chủ dự án 10/10/2026: ngày trước, có năm, dòng "Ngày: …"). */
export function ngayGioNamVn(iso: string | null | undefined): string {
  if (!iso) return "";
  const p = phan(iso, ["hour", "minute", "day", "month", "year"]);
  return p ? `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}` : "";
}

/** "13:34 24/09/2026" — hóa đơn. */
export function gioNgayNamVn(iso: string | null | undefined): string {
  if (!iso) return "";
  const p = phan(iso, ["hour", "minute", "day", "month", "year"]);
  return p ? `${p.hour}:${p.minute} ${p.day}/${p.month}/${p.year}` : "";
}

/**
 * "8 giây trước" / "3 phút trước" — cho màn Máy in (PRINT-09). `now` truyền vào để server tính,
 * không dùng đồng hồ máy người xem. Lệch đồng hồ ra mốc ở tương lai → "vừa xong", không ra số âm.
 */
export function cachDay(iso: string | null | undefined, now: number): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const giay = Math.floor((now - t) / 1000);
  if (giay < 1) return "vừa xong";
  if (giay < 60) return `${giay} giây trước`;
  if (giay < 3600) return `${Math.floor(giay / 60)} phút trước`;
  if (giay < 86_400) return `${Math.floor(giay / 3600)} giờ trước`;
  return `${Math.floor(giay / 86_400)} ngày trước`;
}

/**
 * Thời gian khách ngồi trên ô bàn POS — "25'", "1g25'" (như Sapo / CUKCUK hiện trên sơ đồ bàn). Đo từ lúc mở phiên,
 * cùng mốc với "phút ngồi" của báo cáo Hiệu quả bàn (`report_table_usage`). Mốc ở tương lai (lệch đồng hồ) → "0'".
 */
export function thoiGianNgoi(openedAt: string | null | undefined, now: number): string {
  if (!openedAt) return "";
  const t = Date.parse(openedAt);
  if (!Number.isFinite(t)) return "";
  const phut = Math.max(0, Math.floor((now - t) / 60_000));
  if (phut < 60) return `${phut}'`;
  return `${Math.floor(phut / 60)}g${String(phut % 60).padStart(2, "0")}'`;
}
