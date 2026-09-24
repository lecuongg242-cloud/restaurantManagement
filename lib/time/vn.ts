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

/** "13:34 24/09" — phiếu bếp, phiếu khách. */
export function gioNgayVn(iso: string | null | undefined): string {
  if (!iso) return "";
  const p = phan(iso, ["hour", "minute", "day", "month"]);
  return p ? `${p.hour}:${p.minute} ${p.day}/${p.month}` : "";
}

/** "13:34 24/09/2026" — hóa đơn. */
export function gioNgayNamVn(iso: string | null | undefined): string {
  if (!iso) return "";
  const p = phan(iso, ["hour", "minute", "day", "month", "year"]);
  return p ? `${p.hour}:${p.minute} ${p.day}/${p.month}/${p.year}` : "";
}
