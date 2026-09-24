import { describe, it, expect } from "vitest";
import { allocateDiscount } from "@/lib/billing/net-revenue";

const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);

describe("phân bổ giảm giá cấp bill về từng món (QD-017 D8, REPORT-13)", () => {
  it("không giảm giá giữ nguyên", () => {
    expect(allocateDiscount([50_000, 30_000], 80_000, 0)).toEqual([50_000, 30_000]);
  });

  it("giảm 10% trên 3 dòng lẻ Σ đúng", () => {
    // 10% của 100.001đ = 10.000đ (đã làm tròn ở bill) → còn 90.001đ
    const r = allocateDiscount([33_333, 33_334, 33_334], 100_001, 10_000);
    expect(sum(r)).toBe(90_001);
    expect(r.every((x) => Number.isInteger(x))).toBe(true);
  });

  it("giảm tiền cố định: phần dư dồn vào dòng tiền lớn nhất", () => {
    // 20.000 / 70.000 → hệ số 5/7: 50.000 → 35.714,28 (floor 35.714), 20.000 → 14.285,71 (floor 14.285)
    // Σ floor = 49.999 → dư 1đ dồn vào dòng 50.000
    expect(allocateDiscount([20_000, 50_000], 70_000, 20_000)).toEqual([14_285, 35_715]);
  });

  it("hai dòng bằng tiền nhau: dư vào dòng đứng trước", () => {
    expect(sum(allocateDiscount([10_000, 10_000], 20_000, 1))).toBe(19_999);
    expect(allocateDiscount([10_000, 10_000], 20_000, 1)).toEqual([10_000, 9_999]);
  });

  it("giảm 100% ra 0 hết", () => {
    expect(allocateDiscount([50_000, 30_000], 80_000, 80_000)).toEqual([0, 0]);
  });

  it("subtotal 0 không chia 0", () => {
    expect(allocateDiscount([0], 0, 0)).toEqual([0]);
  });
});
