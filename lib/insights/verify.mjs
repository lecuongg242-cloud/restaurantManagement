/**
 * Kiểm số trong đoạn nhận xét (P18 18-03, AI-04, QD-025): MỌI con số trong văn bản phải khớp một giá trị trong số liệu
 * đầu vào (facts + bất thường). Không khớp → bỏ đoạn văn, dùng bản mẫu cố định. Mô hình ngôn ngữ không được tạo số mới.
 *
 * Quy tắc làm tròn được phép (ghi ở đây, test ở tests/insights/verify.test.ts):
 *  - "12,3%" / "12%": lệch ≤ 0,5 điểm so với một giá trị (lấy trị tuyệt đối: "giảm 12%" khớp −12,3).
 *  - "khoảng 12 triệu", "12,4 tr", "350 nghìn", "350k": lệch ≤ 5% so với một số tiền.
 *  - Số đầy đủ ("12.350.000đ", "1.234"): lệch ≤ 0,5%.
 *  - Số nhỏ (< 1000, không đơn vị): lệch ≤ 0,5 so với một giá trị; riêng 4, 5, 7, 10 luôn được dùng ("4 tuần",
 *    "top 5", "7 ngày", "top 10").
 *  - Ngày "21/9", "21/09/2026": ngày và tháng phải có trong một ngày của số liệu. "Thứ 2…7" và số thứ tự đầu dòng bỏ qua.
 */

const LUON_DUOC = new Set([4, 5, 7, 10]);

/** Mọi con số (trị tuyệt đối) và mọi (ngày, tháng) trong các nguồn. @param {unknown[]} nguon */
function thuThap(nguon) {
  /** @type {number[]} */
  const so = [];
  /** @type {Set<string>} */
  const ngay = new Set();
  /** @type {string[]} tên món / nhóm… — số NẰM TRONG tên ("Combo 2 người") không phải số liệu */
  const chu = [];
  const di = (/** @type {unknown} */ v) => {
    if (typeof v === "number" && Number.isFinite(v)) so.push(Math.abs(v));
    else if (typeof v === "string") {
      const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (m) ngay.add(`${Number(m[3])}/${Number(m[2])}`);
      else if (/\d/.test(v)) chu.push(v);
    } else if (Array.isArray(v)) v.forEach(di);
    else if (v && typeof v === "object") Object.values(v).forEach(di);
  };
  nguon.forEach(di);
  return { so, ngay, chu: chu.sort((a, b) => b.length - a.length) };
}

/** "12.350.000" → 12350000; "12,5" → 12.5; "12.5" → 12.5. @param {string} s */
function docSo(s) {
  if (/^\d{1,3}(\.\d{3})+$/.test(s)) return Number(s.replace(/\./g, ""));
  return Number(s.replace(",", "."));
}

/**
 * @param {string} text
 * @param {...unknown} nguon facts, anomalies…
 * @returns {{ ok: boolean, sai: string[] }}
 */
export function verifyNumbers(text, ...nguon) {
  const { so, ngay, chu } = thuThap(nguon);
  /** @type {string[]} */
  const sai = [];
  let t = text;
  for (const c of chu) t = t.split(c).join(" ");

  t = t.replace(/(\d{1,2})\/(\d{1,2})(?:\/\d{2,4})?/g, (m, d, mo) => {
    if (!ngay.has(`${Number(d)}/${Number(mo)}`)) sai.push(m);
    return " ";
  });
  t = t.replace(/thứ\s*[2-7]\b/gi, " ");
  t = t.replace(/^\s*\d+[.)]\s/gm, " ");

  const re = /(\d{1,3}(?:\.\d{3})+|\d+(?:[.,]\d+)?)\s*(triệu|tr\b|nghìn|ngàn|k\b|%|đồng|đ|₫)?/gi;
  for (const m of t.matchAll(re)) {
    const n = docSo(m[1]);
    const dv = (m[2] ?? "").toLowerCase();
    let khop;
    if (dv === "%") khop = so.some((v) => Math.abs(n - v) <= 0.5);
    else if (dv === "triệu" || dv === "tr") khop = so.some((v) => v >= 1e5 && Math.abs(n * 1e6 - v) <= 0.05 * v);
    else if (dv === "nghìn" || dv === "ngàn" || dv === "k") khop = so.some((v) => v >= 100 && Math.abs(n * 1e3 - v) <= 0.05 * v);
    else if (n >= 1000 || dv) khop = so.some((v) => Math.abs(n - v) <= Math.max(0.005 * v, 1));
    else khop = LUON_DUOC.has(n) || so.some((v) => Math.abs(n - v) <= 0.5);
    if (!khop) sai.push(m[0].trim());
  }
  return { ok: sai.length === 0, sai };
}

/** Số chữ (từ) trong đoạn văn — nhận xét ≤ 200 chữ (AI-04). @param {string} text */
export function demChu(text) {
  return text.split(/\s+/).filter(Boolean).length;
}
