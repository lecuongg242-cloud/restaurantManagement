import { describe, it, expect } from "vitest";
import { hanChung, tienGiaHanChuoi } from "@/lib/brand/billing";

/** P15 15-07 — tiền thuê bao chuỗi = giá gói × số chi nhánh đang hoạt động, không giảm (QD-023 U1). */
describe("tienGiaHanChuoi", () => {
  it.each([
    [350_000, 1, 350_000],
    [350_000, 2, 700_000],
    [350_000, 5, 1_750_000],
    [3_000_000, 1, 3_000_000],
    [3_000_000, 5, 15_000_000],
    [5_500_000, 0, 0],
  ])("gói %i × %i chi nhánh = %i", (gia, n, tien) => {
    expect(tienGiaHanChuoi(gia, n)).toBe(tien);
  });
  it("giá âm / lẻ → lỗi", () => {
    expect(() => tienGiaHanChuoi(-1, 1)).toThrow();
    expect(() => tienGiaHanChuoi(1.5, 1)).toThrow();
  });
});

describe("hanChung", () => {
  it("lấy ngày MUỘN nhất, bỏ chi nhánh tạm ngưng", () => {
    expect(
      hanChung([
        { status: "active", paid_until: "2026-10-01" },
        { status: "active", paid_until: "2026-12-01" },
        { status: "suspended", paid_until: "2027-06-01" },
      ])
    ).toEqual({ soDangTinh: 2, han: "2026-12-01", coKhongGioiHan: false });
  });
  it("có chi nhánh không giới hạn → báo", () => {
    expect(hanChung([{ status: "active", paid_until: null }, { status: "active", paid_until: "2026-10-01" }])).toEqual({
      soDangTinh: 2,
      han: "2026-10-01",
      coKhongGioiHan: true,
    });
  });
});
