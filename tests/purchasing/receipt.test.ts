import { describe, it, expect } from "vitest";
import { lineAmount, purchaseErrorMessage, qty3, receiptTotals, validateReceipt } from "@/lib/purchasing/receipt";

describe("lineAmount — khớp round() của Postgres tới từng đồng", () => {
  it("số tròn", () => {
    expect(lineAmount(2, 280_000)).toBe(560_000);
  });
  it("0,35 × 33.333 = 11.666,55 → 11.667 (số thực dễ ra 11.666)", () => {
    expect(lineAmount(0.35, 33_333)).toBe(11_667);
  });
  it("nửa đồng làm tròn lên; dưới nửa làm tròn xuống", () => {
    expect(lineAmount(0.5, 3)).toBe(2);
    expect(lineAmount(0.001, 499)).toBe(0);
    expect(lineAmount(0.001, 500)).toBe(1);
  });
  it("không giá → không thành tiền", () => {
    expect(lineAmount(3, null)).toBeNull();
  });
  it("qty3 làm tròn 3 chữ số lẻ như cột numeric(14,3)", () => {
    expect(qty3(1.23456)).toBe(1.235);
    expect(qty3(0.1 + 0.2)).toBe(0.3);
  });
});

describe("receiptTotals", () => {
  it("dòng không giá không vào tổng; cần trả = tổng − giảm", () => {
    expect(receiptTotals([{ qty: 2, unit_price: 280_000 }, { qty: 3, unit_price: null }], 56_000)).toEqual({
      subtotal: 560_000,
      total: 504_000,
    });
  });
});

describe("validateReceipt — cùng luật với save_purchase_receipt", () => {
  const base = { lineCount: 1, subtotal: 100_000, discount: 0, payNow: 100_000, hasSupplier: false, complete: true };
  it("hợp lệ", () => expect(validateReceipt(base)).toBeNull());
  it("không dòng nào", () => expect(validateReceipt({ ...base, lineCount: 0 })).toMatch(/số lượng/));
  it("giảm giá lớn hơn tổng", () => expect(validateReceipt({ ...base, discount: 100_001 })).toMatch(/Giảm giá/));
  it("trả nhiều hơn cần trả", () => expect(validateReceipt({ ...base, payNow: 100_001 })).toMatch(/Tiền trả/));
  it("không NCC mà trả thiếu khi Hoàn thành → lỗi; Lưu tạm thì được", () => {
    expect(validateReceipt({ ...base, payNow: 0 })).toMatch(/nhà cung cấp/);
    expect(validateReceipt({ ...base, payNow: 0, complete: false })).toBeNull();
  });
  it("có NCC thì trả thiếu được (phần còn lại thành nợ)", () => {
    expect(validateReceipt({ ...base, payNow: 30_000, hasSupplier: true })).toBeNull();
  });
});

describe("purchaseErrorMessage", () => {
  it("mã lỗi SQL → câu tiếng Việt", () => {
    expect(purchaseErrorMessage('... thieu_ncc_con_no ...')).toMatch(/trả đủ/);
    expect(purchaseErrorMessage("lạ")).toContain("lạ");
  });
});
