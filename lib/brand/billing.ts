/**
 * Thuê bao chuỗi (P15 15-07, QD-023 D8–D12 — chốt 27/09/2026). Thuần hàm.
 *
 * Giá = giá gói × số chi nhánh ĐANG HOẠT ĐỘNG, không giảm (U1 — giống KiotViet/CUKCUK). Chi nhánh tạm ngưng không
 * tính. Hạn chung = ngày muộn nhất của các chi nhánh đang hoạt động (gộp quán có hạn khác nhau không làm ai mất
 * ngày đã trả); còn chi nhánh không giới hạn thì hạn chung là "không giới hạn" cho tới khi super-admin đặt hạn.
 */
export function tienGiaHanChuoi(giaGoi: number, soChiNhanhHoatDong: number): number {
  if (!Number.isInteger(giaGoi) || giaGoi < 0) throw new Error("Giá gói không hợp lệ.");
  return giaGoi * Math.max(0, Math.trunc(soChiNhanhHoatDong));
}

export function hanChung(chiNhanh: { status: string; paid_until: string | null }[]): {
  soDangTinh: number;
  han: string | null;
  coKhongGioiHan: boolean;
} {
  const dang = chiNhanh.filter((c) => c.status === "active");
  const coHan = dang.map((c) => c.paid_until).filter((d): d is string => !!d).sort();
  return {
    soDangTinh: dang.length,
    han: coHan.length ? coHan[coHan.length - 1] : null,
    coKhongGioiHan: dang.some((c) => !c.paid_until),
  };
}
