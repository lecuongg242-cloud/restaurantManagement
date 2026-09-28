import { describe, it, expect } from "vitest";
import { trangTinhBaoCao, type DuLieuXuat } from "@/lib/reports/export-sheets";
import type { DongNhanVien } from "@/lib/reports/deep";

/** P16 16-04 — file Excel xuất ĐÚNG số trên màn: tổng cột tiền = số tổng của báo cáo. */
const nv = (ten: string, o: Partial<DongNhanVien>): DongNhanVien => ({
  kind: "staff", membershipId: ten, ten, vaiTro: "cashier", dangLam: true,
  donNhan: 0, monNhan: 0, tienHangNhan: 0, hoaDonThu: 0, tienThu: 0, tienMat: 0, chuyenKhoan: 0,
  monHuy: 0, tienHuy: 0, lanGiam: 0, tienGiam: 0, ...o,
});

const DU: DuLieuXuat = {
  tieuDe: "Phở Việt",
  kyNhan: "2026-09-01 → 2026-09-27",
  summary: { totalRevenue: 300000, billCount: 3, avgPerBill: 100000 },
  series: [
    { label: "01/09", revenue: 100000, billCount: 1 },
    { label: "02/09", revenue: 200000, billCount: 2 },
  ],
  categories: [{ name: "Phở", qty: 5, revenue: 300000 }],
  topItems: [{ name: "Phở bò", qty: 5, revenue: 300000 }],
  payments: [
    { method: "cash", amount: 250000, count: 2 },
    { method: "transfer", amount: 50000, count: 1 },
  ],
  staff: [
    nv("Lan", { hoaDonThu: 2, tienThu: 250000, tienMat: 250000, donNhan: 2, tienHangNhan: 200000 }),
    nv("Hùng", { hoaDonThu: 1, tienThu: 50000, chuyenKhoan: 50000, donNhan: 1, tienHangNhan: 100000 }),
    nv("Mai", {}), // không làm gì trong kỳ → không có dòng
  ],
};

const tong = (rows: (string | number | null | undefined)[][], cot: number) => rows.reduce((s, r) => s + Number(r[cot] ?? 0), 0);

describe("trangTinhBaoCao", () => {
  const trang = trangTinhBaoCao(DU);
  const lay = (ten: string) => trang.find((t) => t.ten === ten)!;

  it("tổng cột tiền mỗi trang = doanh thu trên màn", () => {
    expect(tong(lay("Doanh thu theo kỳ").dong, 1)).toBe(DU.summary.totalRevenue);
    expect(tong(lay("Nhóm món").dong, 2)).toBe(DU.summary.totalRevenue);
    expect(tong(lay("Phương thức thanh toán").dong, 2)).toBe(DU.summary.totalRevenue);
    expect(tong(lay("NV theo thu ngân").dong, 4)).toBe(DU.summary.totalRevenue);
    expect(tong(lay("NV theo phục vụ").dong, 3)).toBe(DU.summary.totalRevenue);
  });

  it("tiền là SỐ (Excel cộng được), không phải chuỗi có dấu chấm", () => {
    expect(typeof lay("Tổng quan").dong[2][1]).toBe("number");
    expect(lay("Phương thức thanh toán").dong[0]).toEqual(["Tiền mặt", 2, 250000]);
  });

  it("nhân viên không làm gì trong kỳ không có dòng; khối không có dữ liệu không có trang", () => {
    expect(lay("NV theo thu ngân").dong.map((r) => r[0])).toEqual(["Lan", "Hùng"]);
    expect(trang.find((t) => t.ten === "Hiệu quả bàn")).toBeUndefined();
    expect(trang.find((t) => t.ten === "So sánh chi nhánh")).toBeUndefined();
  });
});
