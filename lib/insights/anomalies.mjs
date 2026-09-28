/**
 * Phát hiện bất thường bằng LUẬT CỨNG (P18 18-03, AI-05, QD-025 D3). Mô hình ngôn ngữ chỉ DIỄN GIẢI những gì luật
 * này đã tìm ra — không tự "phát hiện" gì. Thuần; mỗi luật có test dương + âm.
 */
import { congNgay, thuTrongTuan } from "../forecast/model.mjs";

const THU = ["Chủ nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];

/** Doanh thu một ngày lệch quá 2 độ lệch chuẩn so với cùng thứ 8 tuần trước (cần ≥ 4 mẫu). */
export const SO_SIGMA = 2;
export const MAU_TOI_THIEU = 4;
/** Tỷ lệ hủy món / giảm giá tăng hơn chừng này ĐIỂM % so với tuần trước. */
export const DIEM_TANG = 3;

/**
 * Một ngày có lệch so với cùng thứ các tuần trước không.
 * @param {string} ngay
 * @param {Map<string, number>} lichSu ngày → doanh thu (0 / thiếu = không bán, bỏ qua)
 */
export function lechNgay(ngay, lichSu) {
  const v = lichSu.get(ngay) ?? 0;
  const mau = [];
  for (let k = 1; k <= 8; k++) {
    const x = lichSu.get(congNgay(ngay, -7 * k)) ?? 0;
    if (x > 0) mau.push(x);
  }
  if (mau.length < MAU_TOI_THIEU) return null;
  const tb = mau.reduce((s, x) => s + x, 0) / mau.length;
  const sd = Math.sqrt(mau.reduce((s, x) => s + (x - tb) ** 2, 0) / (mau.length - 1));
  if (sd === 0 || Math.abs(v - tb) <= SO_SIGMA * sd) return null;
  return {
    loai: "doanh-thu-ngay",
    ngay,
    thu: THU[thuTrongTuan(ngay)],
    doanhThu: v,
    trungBinhCungThu: Math.round(tb),
    lechPct: Math.round(((v - tb) / tb) * 1000) / 10,
    huong: v > tb ? "cao" : "thap",
  };
}

/**
 * @param {ReturnType<typeof import("./facts.mjs").buildWeeklyFacts>} facts
 * @param {Map<string, number>} lichSu doanh thu theo ngày (≥ 9 tuần tới hết tuần được xét)
 * @param {{ ten: string, doanhThu: number }[]} monTuanTruoc
 */
export function detectAnomalies(facts, lichSu, monTuanTruoc) {
  /** @type {Record<string, unknown>[]} */
  const out = [];
  for (let i = 0; i < 7; i++) {
    const a = lechNgay(congNgay(facts.tuan.tu, i), lichSu);
    if (a) out.push(a);
  }
  if (facts.tyLeHuyPct.tuanNay - facts.tyLeHuyPct.tuanTruoc > DIEM_TANG) {
    out.push({ loai: "huy-tang", tuanNayPct: facts.tyLeHuyPct.tuanNay, tuanTruocPct: facts.tyLeHuyPct.tuanTruoc });
  }
  if (facts.tyLeGiamGiaPct.tuanNay - facts.tyLeGiamGiaPct.tuanTruoc > DIEM_TANG) {
    out.push({ loai: "giam-gia-tang", tuanNayPct: facts.tyLeGiamGiaPct.tuanNay, tuanTruocPct: facts.tyLeGiamGiaPct.tuanTruoc });
  }
  // Món top 5 tuần trước rơi khỏi top 10 tuần này (theo doanh thu).
  const top5Truoc = [...monTuanTruoc].sort((a, b) => b.doanhThu - a.doanhThu).slice(0, 5);
  top5Truoc.forEach((m, i) => {
    if (!facts.monTop10.includes(m.ten)) out.push({ loai: "mon-tut-hang", ten: m.ten, hangTuanTruoc: i + 1 });
  });
  return out;
}
