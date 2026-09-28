/**
 * Ngày lễ Việt Nam 2026–2028 cho dự báo (P18 18-01, QD-025 hệ quả). Dữ liệu tĩnh — CẬP NHẬT MỖI NĂM.
 *
 * Nguồn: ngày nghỉ theo Bộ luật Lao động 2019 Điều 112 (Tết Dương lịch, Tết Âm lịch, Giỗ Tổ 10/3 âm, 30/4, 1/5,
 * Quốc khánh 2/9). Ngày âm quy đổi sang dương theo lịch âm dương Việt Nam (lịch Hồ Ngọc Đức): mùng 1 Tết 17/02/2026,
 * 06/02/2027, 26/01/2028; Giỗ Tổ 26/04/2026, 16/04/2027, 04/04/2028.
 *
 * "Tết" với quán ăn không chỉ ngày nghỉ luật định: tính 29 Tết → mùng 5 (mùng 1 − 2 ngày … mùng 1 + 4 ngày) —
 * quán đóng hoặc bán khác hẳn ngày thường. Dự báo LOẠI các ngày này khỏi lịch sử và ĐÁNH DẤU khi rơi vào tương lai.
 */
const MUNG_MOT = ["2026-02-17", "2027-02-06", "2028-01-26"];
const GIO_TO = ["2026-04-26", "2027-04-16", "2028-04-04"];
const DUONG = ["01-01", "04-30", "05-01", "09-02"];

function congNgay(d, n) {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}

function dungLe() {
  const out = new Set();
  for (const m1 of MUNG_MOT) for (let i = -2; i <= 4; i++) out.add(congNgay(m1, i));
  for (const d of GIO_TO) out.add(d);
  for (const y of [2026, 2027, 2028]) for (const md of DUONG) out.add(`${y}-${md}`);
  return [...out].sort();
}

/** @type {string[]} Mọi ngày lễ (YYYY-MM-DD), đã sắp. */
export const NGAY_LE_VN = dungLe();
