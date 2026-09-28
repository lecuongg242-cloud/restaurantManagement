/**
 * Số liệu TỔNG HỢP của một tuần cho nhận xét (P18 18-03, AI-04, QD-025 D3/D6). Thuần — job đêm gom dữ liệu rồi gọi.
 *
 * Đây là thứ DUY NHẤT được gửi cho mô hình ngôn ngữ. Chỉ số theo ngày / món / nhóm món / giờ — KHÔNG có SĐT, tên
 * khách, tên nhân viên (đầu vào không nhận các trường đó; test quét cả khóa lẫn chuỗi dạng SĐT).
 * Tiền là số nguyên đồng; phần trăm làm tròn 1 chữ số thập phân.
 */
import { congNgay, thuTrongTuan } from "../forecast/model.mjs";

const THU = ["Chủ nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];

/** @param {number} a @param {number} b */
const pct = (a, b) => (b > 0 ? Math.round(((a - b) / b) * 1000) / 10 : null);
/** @param {number} x @param {number} tong */
const tyLe = (x, tong) => (tong > 0 ? Math.round((x / tong) * 1000) / 10 : 0);

/**
 * @typedef {{ ten: string, sl: number, doanhThu: number }} DongMon
 * @typedef {{
 *   tuNgay: string,
 *   ngay: { ngay: string, doanhThu: number, hoaDon: number }[],
 *   monTuanNay: DongMon[], monTuanTruoc: DongMon[],
 *   nhomTuanNay: { ten: string, doanhThu: number }[], nhomTuanTruoc: { ten: string, doanhThu: number }[],
 *   theoGio: { gio: number, doanhThu: number }[],
 *   giamGia: { tuanNay: number, tuanTruoc: number },
 *   huy: { tuanNay: number, tuanTruoc: number },
 *   duBaoTuanToi: { doanhThu: number, saiLechPct: number | null } | null
 * }} DuLieuTuan
 */

/** @param {DuLieuTuan} d */
export function buildWeeklyFacts(d) {
  const den = congNgay(d.tuNgay, 6);
  const theoNgay = new Map(d.ngay.map((x) => [x.ngay, x]));
  const tongKhoang = (/** @type {string} */ tu) => {
    let dt = 0;
    let hd = 0;
    for (let i = 0; i < 7; i++) {
      const x = theoNgay.get(congNgay(tu, i));
      dt += x?.doanhThu ?? 0;
      hd += x?.hoaDon ?? 0;
    }
    return { dt, hd };
  };
  const nay = tongKhoang(d.tuNgay);
  const truoc = tongKhoang(congNgay(d.tuNgay, -7));
  const bonTuan = [1, 2, 3, 4].map((k) => tongKhoang(congNgay(d.tuNgay, -7 * k)).dt);
  const tb4 = Math.round(bonTuan.reduce((s, x) => s + x, 0) / 4);

  const ngayTuan = Array.from({ length: 7 }, (_, i) => {
    const ngay = congNgay(d.tuNgay, i);
    return { ngay, thu: THU[thuTrongTuan(ngay)], doanhThu: theoNgay.get(ngay)?.doanhThu ?? 0 };
  });
  const coBan = ngayTuan.filter((x) => x.doanhThu > 0);
  const cao = coBan.reduce((m, x) => (!m || x.doanhThu > m.doanhThu ? x : m), /** @type {any} */ (null));
  const thap = coBan.reduce((m, x) => (!m || x.doanhThu < m.doanhThu ? x : m), /** @type {any} */ (null));

  const xepHang = [...d.monTuanNay].sort((a, b) => b.doanhThu - a.doanhThu);
  const top = xepHang.slice(0, 5);
  const nhomTruoc = new Map(d.nhomTuanTruoc.map((x) => [x.ten, x.doanhThu]));
  const gio = d.theoGio.reduce((m, x) => (!m || x.doanhThu > m.doanhThu ? x : m), /** @type {any} */ (null));

  return {
    tuan: { tu: d.tuNgay, den },
    doanhThu: {
      tuanNay: nay.dt,
      tuanTruoc: truoc.dt,
      tb4TuanTruoc: tb4,
      soVoiTuanTruocPct: pct(nay.dt, truoc.dt),
      soVoiTb4TuanPct: pct(nay.dt, tb4),
    },
    hoaDon: { tuanNay: nay.hd, tuanTruoc: truoc.hd, soVoiTuanTruocPct: pct(nay.hd, truoc.hd) },
    tbMoiHoaDon: {
      tuanNay: nay.hd ? Math.round(nay.dt / nay.hd) : 0,
      tuanTruoc: truoc.hd ? Math.round(truoc.dt / truoc.hd) : 0,
    },
    ngay: ngayTuan,
    ngayCaoNhat: cao,
    ngayThapNhat: thap,
    monBanChay: top.map((m) => ({ ten: m.ten, sl: m.sl, doanhThu: m.doanhThu })),
    /** Tên 10 món doanh thu cao nhất — cho luật "món tụt hạng". */
    monTop10: xepHang.slice(0, 10).map((m) => m.ten),
    nhomMon: [...d.nhomTuanNay]
      .sort((a, b) => b.doanhThu - a.doanhThu)
      .slice(0, 6)
      .map((n) => ({ ten: n.ten, doanhThu: n.doanhThu, soVoiTuanTruocPct: pct(n.doanhThu, nhomTruoc.get(n.ten) ?? 0) })),
    gioCaoDiem: gio ? { gio: gio.gio, doanhThu: gio.doanhThu } : null,
    tyLeHuyPct: {
      tuanNay: tyLe(d.huy.tuanNay, nay.dt + d.huy.tuanNay),
      tuanTruoc: tyLe(d.huy.tuanTruoc, truoc.dt + d.huy.tuanTruoc),
    },
    tyLeGiamGiaPct: {
      tuanNay: tyLe(d.giamGia.tuanNay, nay.dt + d.giamGia.tuanNay),
      tuanTruoc: tyLe(d.giamGia.tuanTruoc, truoc.dt + d.giamGia.tuanTruoc),
    },
    duBaoTuanToi: d.duBaoTuanToi,
  };
}
