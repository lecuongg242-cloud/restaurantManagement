import { describe, it, expect } from "vitest";
import { toBaseQty, unitCostFromPurchase, purchasePrice, parseQty } from "@/lib/inventory/units";

describe("quy đổi đơn vị nhập → đơn vị gốc (INV-01, INV-04)", () => {
  it("2 kg → 2000 g", () => {
    expect(toBaseQty(2, 1000)).toBe(2000);
  });

  it("1 vỉ (10) → 10 cái", () => {
    expect(toBaseQty(1, 10)).toBe(10);
  });

  it("số lẻ giữ nguyên độ chính xác: 0,35 kg → 350 g", () => {
    expect(toBaseQty(0.35, 1000)).toBe(350);
  });

  it("factor 0 bị từ chối", () => {
    expect(() => toBaseQty(1, 0)).toThrow();
    expect(() => unitCostFromPurchase(1000, 0)).toThrow();
  });

  it("280.000đ/kg → 280đ/g, không làm tròn khi lưu", () => {
    expect(unitCostFromPurchase(280_000, 1000)).toBe(280);
    // Muối 15.000đ/kg = 15đ/g; gia vị đắt hơn vẫn giữ lẻ.
    expect(unitCostFromPurchase(150, 1000)).toBe(0.15);
  });

  it("đổi ngược giá đơn vị gốc ra giá theo đơn vị nhập để hiện trên form", () => {
    expect(purchasePrice(280, 1000)).toBe(280_000);
    expect(purchasePrice(null, 1000)).toBeNull();
  });
});

describe("đọc số lượng người gõ (form nhập)", () => {
  it("dấu phẩy thập phân kiểu Việt: 0,5 → 0.5", () => {
    expect(parseQty("0,5")).toBe(0.5);
  });

  it("dấu chấm cũng nhận: 1.25 → 1.25", () => {
    expect(parseQty("1.25")).toBe(1.25);
  });

  it("rỗng, chữ, số âm, 0 → null", () => {
    expect(parseQty("")).toBeNull();
    expect(parseQty("abc")).toBeNull();
    expect(parseQty("-2")).toBeNull();
    expect(parseQty("0")).toBeNull();
  });

  it("bỏ khoảng trắng hai đầu", () => {
    expect(parseQty(" 80 ")).toBe(80);
  });
});
