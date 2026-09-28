/**
 * Dựng chuỗi VietQR (chuẩn EMVCo MPM + NAPAS 24/7) — PAY-01, QD-021 D1. Thuần hàm, không gọi mạng:
 * lúc thu tiền không được phụ thuộc bên thứ ba (img.vietqr.io).
 *
 * Cấu trúc (mỗi trường là TLV: mã 2 số + độ dài 2 số + giá trị):
 *   00 "01"                 phiên bản
 *   01 "11" | "12"          11 = mã tĩnh (không số tiền), 12 = mã động (có số tiền)
 *   38 { 00 A000000727      GUID NAPAS
 *        01 { 00 BIN, 01 số TK }
 *        02 QRIBFTTA }      chuyển tới TÀI KHOẢN (QRIBFTTC là tới thẻ — sai mã này app báo "không hợp lệ")
 *   53 "704"                VND
 *   54 số tiền              số nguyên, không dấu phân cách
 *   58 "VN"
 *   62 { 08 nội dung }
 *   63 CRC16-CCITT          tính trên toàn chuỗi kể cả "6304", 4 hex IN HOA
 */

const GUID_NAPAS = "A000000727";
const DICH_VU_TOI_TAI_KHOAN = "QRIBFTTA";

/** Nội dung chuyển khoản: chỉ chữ/số/khoảng trắng — một số app ngân hàng bỏ hoặc cắt ký tự khác. */
const NOI_DUNG_HOP_LE = /^[A-Za-z0-9 ]{1,25}$/;

function tlv(tag: string, value: string): string {
  if (value.length > 99) throw new Error(`VietQR: trường ${tag} dài quá 99 ký tự.`);
  return `${tag}${String(value.length).padStart(2, "0")}${value}`;
}

/** CRC-16/CCITT-FALSE (đa thức 0x1021, khởi tạo 0xFFFF) — đúng thuật toán EMVCo quy định cho tag 63. */
export function crc16(s: string): string {
  let crc = 0xffff;
  // Mọi trường đã bị ép về ASCII ở trên ⇒ mã ký tự = byte; không cần Buffer (chạy được cả ở client).
  for (let k = 0; k < s.length; k++) {
    crc ^= s.charCodeAt(k) << 8;
    for (let i = 0; i < 8; i++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export function buildVietQrPayload(input: {
  bin: string;
  accountNo: string;
  amount?: number;
  content?: string;
}): string {
  const { bin, accountNo, amount, content } = input;
  if (!/^\d{6}$/.test(bin)) throw new Error("VietQR: mã ngân hàng (BIN) phải gồm 6 chữ số.");
  if (!/^[A-Za-z0-9]{1,19}$/.test(accountNo)) throw new Error("VietQR: số tài khoản không hợp lệ.");
  if (amount !== undefined && (!Number.isInteger(amount) || amount <= 0)) {
    // Không bao giờ in QR "0đ": khách quét xong app để trống số tiền, dễ chuyển nhầm.
    throw new Error("VietQR: số tiền phải là số nguyên dương.");
  }
  if (content !== undefined && !NOI_DUNG_HOP_LE.test(content)) {
    throw new Error("VietQR: nội dung chỉ gồm chữ không dấu, số, khoảng trắng và ≤ 25 ký tự.");
  }

  const merchant =
    tlv("00", GUID_NAPAS) + tlv("01", tlv("00", bin) + tlv("01", accountNo)) + tlv("02", DICH_VU_TOI_TAI_KHOAN);

  let s =
    tlv("00", "01") +
    tlv("01", amount !== undefined ? "12" : "11") +
    tlv("38", merchant) +
    tlv("53", "704") +
    (amount !== undefined ? tlv("54", String(amount)) : "") +
    tlv("58", "VN") +
    (content ? tlv("62", tlv("08", content)) : "");
  s += "6304";
  return s + crc16(s);
}

/** "dd/mm" → "ddmm" theo giờ Việt Nam (máy chủ chạy UTC). */
function ngayThangVn(day: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
  }).formatToParts(day);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("day")}${get("month")}`;
}

/**
 * Nội dung chuyển khoản cho một hóa đơn — QD-021 D4. `bill_no` reset mỗi ngày nên phải kèm ngày
 * (theo giờ VN) để không trùng giữa các ngày: `HD12 2709`.
 */
export function transferContent(billNo: number, day: Date): string {
  return `HD${billNo} ${ngayThangVn(day)}`;
}

/**
 * "Nguyễn Văn Đức" → "NGUYEN VAN DUC": bỏ dấu, in hoa, chỉ giữ A-Z 0-9 và một khoảng trắng. Tên chủ
 * tài khoản và nội dung chuyển khoản đều phải ở dạng này (ngân hàng in không dấu, app cắt ký tự lạ).
 */
export function khongDauInHoa(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "D")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}
