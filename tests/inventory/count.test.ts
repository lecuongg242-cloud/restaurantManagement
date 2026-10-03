import { describe, it, expect } from "vitest";
import { countDiff, isBigDiff, countSummary, parseCount, countToBase } from "@/lib/inventory/count";

describe("lệch kiểm kê (INV-11)", () => {
  it("lệch = thực tế − tồn sổ, giữ 3 chữ số lẻ", () => {
    expect(countDiff(10, 82)).toBe(72);
    expect(countDiff(1, 0.8)).toBe(-0.2);
    expect(countDiff(0.3, 0.1)).toBe(-0.2);
  });

  it("sổ 10 kg mà đếm 82 kg là lệch lớn", () => {
    expect(isBigDiff(10, 82)).toBe(true);
  });

  it("đếm 0 khi sổ còn 10 là lệch lớn", () => {
    expect(isBigDiff(10, 0)).toBe(true);
  });

  it("lệch tới đúng 50% sổ chưa tính là lớn; quá 50% mới tính", () => {
    expect(isBigDiff(10, 15)).toBe(false);
    expect(isBigDiff(10, 5)).toBe(false);
    expect(isBigDiff(10, 15.1)).toBe(true);
  });

  it("sổ 0 mà đếm được hàng là lệch lớn; sổ 0 đếm 0 là khớp", () => {
    expect(isBigDiff(0, 3)).toBe(true);
    expect(isBigDiff(0, 0)).toBe(false);
  });

  it("sổ âm (nhập thiếu) so theo độ lớn", () => {
    expect(isBigDiff(-2, 3)).toBe(true);
    expect(isBigDiff(-2, -1.5)).toBe(false);
  });
});

describe("tổng kiểm kê (INV-11)", () => {
  it("tách lệch tăng, lệch giảm, khớp; giá trị = lệch × giá theo đơn vị nhập", () => {
    const s = countSummary([
      { theoretical: 10, counted: 82, unitPrice: 70_000 }, // +72 kg → +5.040.000
      { theoretical: 2, counted: 1.5, unitPrice: 30_000 }, // −0,5 kg → −15.000
      { theoretical: 5, counted: 5, unitPrice: 10_000 }, // khớp
    ]);
    expect(s).toEqual({
      matched: 1,
      up: { count: 1, value: 5_040_000 },
      down: { count: 1, value: -15_000 },
      unpriced: 0,
    });
  });

  it("dòng chưa có giá vẫn đếm vào số dòng lệch, không cộng tiền, báo số dòng thiếu giá", () => {
    const s = countSummary([{ theoretical: 1, counted: 3, unitPrice: null }]);
    expect(s.up).toEqual({ count: 1, value: 0 });
    expect(s.unpriced).toBe(1);
  });
});

describe("ô Thực tế (P26 P2, P4)", () => {
  it("trống = chưa đếm; '0' = đếm hết hàng; '8,2' và '8.2' đọc được", () => {
    expect(parseCount("")).toBeNull();
    expect(parseCount("  ")).toBeNull();
    expect(parseCount("0")).toEqual({ ok: true, value: 0 });
    expect(parseCount("8,2")).toEqual({ ok: true, value: 8.2 });
    expect(parseCount("8.2")).toEqual({ ok: true, value: 8.2 });
  });

  it("số âm, chữ, nhiều dấu phẩy = KHÔNG hợp lệ (không lặng lẽ coi là chưa đếm)", () => {
    expect(parseCount("-0,3")).toEqual({ ok: false });
    expect(parseCount("abc")).toEqual({ ok: false });
    expect(parseCount("1,2,3")).toEqual({ ok: false });
  });

  it("đếm theo đơn vị nhập nhân hệ số; theo đơn vị trừ kho giữ nguyên — 69 chai không thành 69,12", () => {
    expect(countToBase(2.88, "purchase", 24)).toBeCloseTo(69.12, 6);
    expect(countToBase(69, "base", 24)).toBe(69);
    expect(countToBase(8.2, "purchase", 1000)).toBe(8200);
  });
});
