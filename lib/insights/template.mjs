/**
 * Nhận xét dựng bằng MẪU CÂU CỐ ĐỊNH (P18 18-03, QD-025 D7 bậc cuối): khi mọi nguồn AI miễn phí lỗi / hết hạn mức, hoặc
 * đoạn văn AI không qua được kiểm số. Mọi con số lấy thẳng từ facts / bất thường — `verifyNumbers` phải luôn đạt.
 */

/** 45230000 → "45.230.000". @param {number} n */
export const tien = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
/** 12.3 → "12,3". @param {number} n */
const phay = (n) => String(Math.abs(n)).replace(".", ",");
/** "2026-09-21" → "21/09". @param {string} d */
export const ngayThang = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/** @param {number | null} p @param {string} moc */
function soSanh(p, moc) {
  if (p === null) return "";
  if (p === 0) return `, bằng ${moc}`;
  return `, ${p > 0 ? "tăng" : "giảm"} ${phay(p)}% so với ${moc}`;
}

/**
 * @param {ReturnType<typeof import("./facts.mjs").buildWeeklyFacts>} f
 * @param {Record<string, any>[]} batThuong
 */
export function templateInsight(f, batThuong) {
  const cau = [];
  cau.push(
    `Tuần ${ngayThang(f.tuan.tu)}–${ngayThang(f.tuan.den)}: doanh thu ${tien(f.doanhThu.tuanNay)}đ` +
      `${soSanh(f.doanhThu.soVoiTuanTruocPct, `tuần trước (${tien(f.doanhThu.tuanTruoc)}đ)`)}` +
      `${soSanh(f.doanhThu.soVoiTb4TuanPct, `trung bình 4 tuần (${tien(f.doanhThu.tb4TuanTruoc)}đ)`)}.`
  );
  cau.push(`${tien(f.hoaDon.tuanNay)} hóa đơn, trung bình ${tien(f.tbMoiHoaDon.tuanNay)}đ mỗi hóa đơn.`);
  if (f.ngayCaoNhat && f.ngayThapNhat && f.ngayCaoNhat.ngay !== f.ngayThapNhat.ngay) {
    cau.push(
      `Bán tốt nhất ${f.ngayCaoNhat.thu} ${ngayThang(f.ngayCaoNhat.ngay)} (${tien(f.ngayCaoNhat.doanhThu)}đ), ` +
        `thấp nhất ${f.ngayThapNhat.thu} ${ngayThang(f.ngayThapNhat.ngay)} (${tien(f.ngayThapNhat.doanhThu)}đ).`
    );
  }
  if (f.monBanChay[0]) cau.push(`Món bán chạy nhất: ${f.monBanChay[0].ten} (${tien(f.monBanChay[0].sl)} phần).`);
  if (f.gioCaoDiem) cau.push(`Đông nhất lúc ${f.gioCaoDiem.gio} giờ.`);
  if (f.duBaoTuanToi) cau.push(`Dự báo tuần tới: khoảng ${tien(f.duBaoTuanToi.doanhThu)}đ.`);

  const bt = [];
  const goiY = [];
  for (const a of batThuong) {
    if (a.loai === "doanh-thu-ngay") {
      bt.push(`${a.thu} ${ngayThang(a.ngay)} doanh thu ${tien(a.doanhThu)}đ, ${a.huong === "cao" ? "cao" : "thấp"} bất thường so với cùng thứ các tuần trước (trung bình ${tien(a.trungBinhCungThu)}đ).`);
      if (a.huong === "thap") goiY.push(`Xem lại ${a.thu} ${ngayThang(a.ngay)}: quán nghỉ, hay còn đơn chưa thu tiền?`);
    } else if (a.loai === "huy-tang") {
      bt.push(`Tỷ lệ hủy món tăng từ ${phay(a.tuanTruocPct)}% lên ${phay(a.tuanNayPct)}%.`);
      goiY.push("Xem lý do hủy món ở Báo cáo → Nhân viên.");
    } else if (a.loai === "giam-gia-tang") {
      bt.push(`Tỷ lệ giảm giá tăng từ ${phay(a.tuanTruocPct)}% lên ${phay(a.tuanNayPct)}%.`);
      goiY.push("Kiểm tra các lần giảm giá: ai duyệt, vì sao.");
    } else if (a.loai === "mon-tut-hang") {
      bt.push(`${a.ten} (hạng ${a.hangTuanTruoc} tuần trước) rơi khỏi top 10.`);
      goiY.push(`Kiểm tra món ${a.ten}: còn hàng không, chất lượng có đổi không.`);
    }
  }
  if (goiY.length === 0) goiY.push("Chuẩn bị nguyên liệu theo dự báo tuần tới.");

  let body = cau.join(" ");
  if (bt.length) body += `\n\nĐiểm bất thường: ${bt.join(" ")}`;
  body += `\n\nGợi ý:\n${goiY.slice(0, 3).map((g) => `- ${g}`).join("\n")}`;
  return body;
}
