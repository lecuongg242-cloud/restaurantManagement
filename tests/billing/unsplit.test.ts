import { describe, it, expect } from "vitest";
import { parseUnsplitResult } from "@/lib/billing/unsplit";

const FALLBACK = "Không gỡ được chia đều. Vui lòng thử lại.";

describe("parseUnsplitResult (BILL-06)", () => {
  it("gỡ xong 3 phần → ok kèm số phần đã hủy", () => {
    expect(parseUnsplitResult({ ok: true, voided: 3 })).toEqual({ ok: true, voided: 3 });
  });

  it("vỏ mồ côi (0 con) → vẫn là ok, chỉ bỏ cờ chia đều", () => {
    expect(parseUnsplitResult({ ok: true, voided: 0 })).toEqual({ ok: true, voided: 0 });
  });

  it("con đã thu → câu lỗi bảo hoàn tiền trước", () => {
    expect(parseUnsplitResult({ ok: false, code: "has_payment" })).toEqual({
      ok: false,
      error: "Đã thu một phần — không gỡ chia được. Hoàn tiền phần đã thu trước.",
    });
  });

  it("không phải hóa đơn đã chia → nói đúng lý do", () => {
    expect(parseUnsplitResult({ ok: false, code: "not_split" })).toEqual({
      ok: false,
      error: "Hóa đơn này chưa chia đều.",
    });
  });

  it("không tìm thấy hóa đơn → nói đúng lý do", () => {
    expect(parseUnsplitResult({ ok: false, code: "not_found" })).toEqual({
      ok: false,
      error: "Không tìm thấy hóa đơn.",
    });
  });

  it("mã lỗi lạ (RPC đổi mà app chưa theo) → vẫn là thất bại", () => {
    expect(parseUnsplitResult({ ok: false, code: "chua_biet" })).toEqual({ ok: false, error: FALLBACK });
  });

  // Fail-closed: mọi hình dạng không hiểu được đều là THẤT BẠI, không bao giờ suy ra "chắc xong rồi".
  it.each([
    ["null", null],
    ["undefined", undefined],
    ["chuỗi", "ok"],
    ["mảng", [{ ok: true, voided: 1 }]],
    ["thiếu cờ ok", { voided: 2 }],
    ["ok không phải true", { ok: "true", voided: 2 }],
    ["voided không phải số", { ok: true, voided: "2" }],
    ["voided âm", { ok: true, voided: -1 }],
    ["voided lẻ", { ok: true, voided: 1.5 }],
  ])("hình dạng lạ (%s) → thất bại", (_label, raw) => {
    expect(parseUnsplitResult(raw)).toEqual({ ok: false, error: FALLBACK });
  });
});
