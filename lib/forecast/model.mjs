/**
 * Dự báo con số bằng THỐNG KÊ THUẦN (P18 18-01, AI-01/02, QD-025 D1) — không mô hình ngôn ngữ, không thư viện.
 *
 * Viết bằng JavaScript (JSDoc) thay vì TypeScript: job đêm (`scripts/du-bao-dem.mjs`, Node trên GitHub Actions) nhập
 * thẳng tệp này, không cần bước build. Mọi ngày là chuỗi `YYYY-MM-DD` theo NGÀY KINH DOANH GIỜ VN; phép cộng ngày làm
 * trên UTC nên không phụ thuộc múi giờ máy chạy.
 *
 * Cách tính (đơn giản, kiểm được):
 *  - Mỗi thứ trong tuần: trung bình CÓ TRỌNG SỐ của `weeks` lần gần nhất (lần mới nhất nặng nhất).
 *  - Nhân hệ số xu hướng nhẹ: TB 14 ngày gần nhất ÷ TB 28 ngày trước đó, chỉ lấy một nửa độ lệch, kẹp [0,85; 1,15] —
 *    trung bình có trọng số đã nghiêng về gần đây, lấy đủ độ lệch là đếm xu hướng hai lần.
 *  - Ngày lễ và ngày không bán (0) KHÔNG đưa vào lịch sử: quán đóng Tết không kéo tụt dự báo tuần thường.
 *  - Khoảng sai số ~80%: ± 1,28 × hệ số biến thiên của chính thứ đó.
 */

/** @typedef {{ date: string, value: number }} Diem */
/** @typedef {{ date: string, value: number, low: number, high: number, holiday: boolean }} DuBao */

/** @param {string} d @param {number} n */
export function congNgay(d, n) {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}

/** 0 = Chủ nhật … 6 = thứ Bảy. @param {string} d */
export function thuTrongTuan(d) {
  return new Date(`${d}T00:00:00Z`).getUTCDay();
}

/** Số ngày từ a tới b (b − a). @param {string} a @param {string} b */
export function soNgay(a, b) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}

const Z80 = 1.28;

/** @param {number[]} xs */
const tb = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

/** @param {number[]} xs */
function heSoBienThien(xs) {
  const m = tb(xs);
  if (m === null || m === 0 || xs.length < 2) return null;
  const v = xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(v) / m;
}

/**
 * @param {Diem[]} history lịch sử theo ngày (thiếu ngày = không bán)
 * @param {{ horizon: number, holidays?: string[], weeks?: number, from?: string }} opts
 *   `from`: ngày đầu cần dự báo (mặc định: ngày sau ngày cuối của lịch sử)
 * @returns {DuBao[]}
 */
export function forecastDaily(history, opts) {
  const le = new Set(opts.holidays ?? []);
  const weeks = opts.weeks ?? 6;
  const cuoi = history.reduce((m, p) => (p.date > m ? p.date : m), "");
  const from = opts.from ?? (cuoi ? congNgay(cuoi, 1) : "");
  if (!from) return [];

  // Chỉ ngày có bán, không phải lễ, TRƯỚC `from`.
  const sach = history.filter((p) => p.date < from && p.value > 0 && !le.has(p.date));
  const cuaSo = sach.filter((p) => soNgay(p.date, from) <= weeks * 7);

  /** @type {Map<number, number[]>} thứ → giá trị, MỚI NHẤT trước */
  const theoThu = new Map();
  for (const p of [...cuaSo].sort((a, b) => (a.date < b.date ? 1 : -1))) {
    const k = thuTrongTuan(p.date);
    const arr = theoThu.get(k) ?? [];
    if (arr.length < weeks) arr.push(p.value);
    theoThu.set(k, arr);
  }
  const coTrongSo = (/** @type {number[]} */ xs) => {
    let s = 0;
    let w = 0;
    xs.forEach((x, i) => {
      const wi = xs.length - i;
      s += wi * x;
      w += wi;
    });
    return w ? s / w : null;
  };
  const tatCa = cuaSo.map((p) => p.value);
  const tbChung = tb(tatCa) ?? 0;
  const cvChung = heSoBienThien(tatCa);

  const ganDay = tb(sach.filter((p) => soNgay(p.date, from) <= 14).map((p) => p.value));
  const truocDo = tb(sach.filter((p) => soNgay(p.date, from) > 14 && soNgay(p.date, from) <= 42).map((p) => p.value));
  const xuHuong =
    ganDay !== null && truocDo !== null && truocDo > 0
      ? Math.min(1.15, Math.max(0.85, 1 + (ganDay / truocDo - 1) / 2))
      : 1;

  /** @type {DuBao[]} */
  const out = [];
  for (let i = 0; i < opts.horizon; i++) {
    const date = congNgay(from, i);
    const mau = theoThu.get(thuTrongTuan(date)) ?? [];
    const goc = coTrongSo(mau) ?? tbChung;
    const value = goc * xuHuong;
    // Quá ít mẫu để đo dao động → khoảng RẤT rộng (cv = 1), không bao giờ là khoảng 0 trông như chắc chắn.
    const cv = heSoBienThien(mau) ?? cvChung ?? 1;
    out.push({
      date,
      value,
      low: Math.max(0, value * (1 - Z80 * cv)),
      high: value * (1 + Z80 * cv),
      holiday: le.has(date),
    });
  }
  return out;
}

/**
 * Tự kiểm độ chính xác (AI-02): lùi lại `folds` tuần, mỗi lần dự báo 7 ngày CHỈ bằng dữ liệu trước đó rồi so thực tế.
 * Ngày thực tế = 0 (quán nghỉ) hoặc ngày lễ: bỏ khỏi phép tính — không chia cho 0, không phạt vì quán đóng cửa.
 *
 * Sai lệch mỗi tuần = Σ|dự báo − thực tế| ÷ Σ thực tế (MAPE CÓ TRỌNG SỐ theo doanh thu, còn gọi WAPE). MAPE thường
 * chia từng ngày cho thực tế của ngày đó: qt-food ngày 09/09/2026 chỉ bán 760.000đ (nghỉ sớm) → riêng ngày đó lệch
 * ~1.000% và kéo sai lệch cả 4 tuần lên 67%, trong khi các ngày khác lệch ~15–25%. Ngày bán đều thì hai cách bằng nhau.
 * @param {Diem[]} history
 * @param {{ holidays?: string[], weeks?: number }} opts
 * @param {number} [folds]
 * @returns {{ mape: number | null, perFold: (number | null)[] }} % sai lệch (có trọng số) trung bình của các tuần
 */
export function backtest(history, opts, folds = 4) {
  const le = new Set(opts.holidays ?? []);
  const cuoi = history.reduce((m, p) => (p.date > m ? p.date : m), "");
  if (!cuoi) return { mape: null, perFold: [] };
  const thucTe = new Map(history.map((p) => [p.date, p.value]));
  /** @type {(number | null)[]} */
  const perFold = [];
  for (let f = folds; f >= 1; f--) {
    const cut = congNgay(cuoi, -7 * f + 1);
    const du = forecastDaily(
      history.filter((p) => p.date < cut),
      { ...opts, horizon: 7, from: cut }
    );
    let lech = 0;
    let tong = 0;
    for (const d of du) {
      const a = thucTe.get(d.date) ?? 0;
      if (a <= 0 || le.has(d.date)) continue;
      lech += Math.abs(d.value - a);
      tong += a;
    }
    perFold.push(tong > 0 ? (lech / tong) * 100 : null);
  }
  const co = /** @type {number[]} */ (perFold.filter((x) => x !== null));
  return { mape: co.length ? tb(co) : null, perFold };
}

/** Số tuần (thứ Hai → Chủ nhật) có ít nhất một ngày bán. @param {Diem[]} history */
export function soTuanCoBan(history) {
  const tuan = new Set();
  for (const p of history) {
    if (p.value <= 0) continue;
    const lui = (thuTrongTuan(p.date) + 6) % 7; // thứ Hai = 0
    tuan.add(congNgay(p.date, -lui));
  }
  return tuan.size;
}

/**
 * Món mới (bán lần đầu chưa đủ `minDays` ngày trước `from`) không đủ lịch sử để dự báo riêng → gộp vào khóa "khac"
 * ("Món khác"). Trả chuỗi theo ngày của từng khóa sau khi gộp.
 * @param {Map<string, Diem[]>} theoMon
 * @param {string} from
 * @param {number} [minDays]
 * @returns {Map<string, Diem[]>}
 */
export function gomMonMoi(theoMon, from, minDays = 21) {
  /** @type {Map<string, Diem[]>} */
  const out = new Map();
  /** @type {Map<string, number>} */
  const khac = new Map();
  for (const [k, pts] of theoMon) {
    const dau = pts.reduce((m, p) => (p.value > 0 && (m === "" || p.date < m) ? p.date : m), "");
    if (dau && soNgay(dau, from) >= minDays) {
      out.set(k, pts);
      continue;
    }
    for (const p of pts) khac.set(p.date, (khac.get(p.date) ?? 0) + p.value);
  }
  if (khac.size) out.set("khac", [...khac].map(([date, value]) => ({ date, value })));
  return out;
}

/** Ngưỡng hiện dự báo (QD-025 U3, D5): đủ 6 tuần có bán VÀ sai lệch backtest ≤ 25%. */
export const MAPE_TOI_DA = 25;
export const TUAN_TOI_THIEU = 6;
