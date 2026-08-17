import { describe, it, expect } from "vitest";
import { changeToReturn, parsePayBillResult } from "@/lib/billing/pay-result";

describe("parsePayBillResult — đọc kết quả RPC pay_bill (0035)", () => {
  it("thu thành công lần đầu → ok, có total, replayed=false", () => {
    expect(parsePayBillResult({ ok: true, replayed: false, total: 150000 })).toEqual({
      ok: true,
      total: 150000,
      replayed: false,
    });
  });

  it("gửi lại (RPC báo replayed) → VẪN ok — nơi gọi phải chạy nốt phần đuôi, không được dừng", () => {
    const out = parsePayBillResult({ ok: true, replayed: true, total: 90000 });
    expect(out).toEqual({ ok: true, total: 90000, replayed: true });
  });

  it("thiếu `replayed` → coi là lượt thường (false), không làm hỏng cả kết quả", () => {
    expect(parsePayBillResult({ ok: true, total: 1000 })).toEqual({
      ok: true,
      total: 1000,
      replayed: false,
    });
  });

  describe("mã lỗi → giữ NGUYÊN VĂN câu của bản trước", () => {
    const cases: [string, string][] = [
      ["not_found", "Không tìm thấy hóa đơn."],
      ["not_open", "Hóa đơn đã đóng."],
      ["split_shell", "Hóa đơn đã chia — thu ở từng phần con."],
      ["empty_total", "Hóa đơn chưa có tiền để thu."],
    ];
    for (const [code, message] of cases) {
      it(`${code} → "${message}"`, () => {
        expect(parsePayBillResult({ ok: false, code })).toEqual({ ok: false, error: message });
      });
    }
  });

  describe("FAIL-CLOSED — hình dạng lạ KHÔNG bao giờ được suy ra 'chắc là xong rồi'", () => {
    const fallback = "Ghi nhận thanh toán thất bại. Vui lòng thử lại.";
    const bad: [string, unknown][] = [
      ["null", null],
      ["undefined", undefined],
      ["chuỗi", "ok"],
      ["số", 1],
      ["mảng", [{ ok: true, total: 1000 }]],
      ["object rỗng", {}],
      ["ok='true' (chuỗi, không phải boolean)", { ok: "true", total: 1000 }],
      ["mã lỗi lạ", { ok: false, code: "chua_tung_thay" }],
      ["ok nhưng thiếu total", { ok: true }],
      ["ok nhưng total = 0", { ok: true, total: 0 }],
      ["ok nhưng total âm", { ok: true, total: -5000 }],
      ["ok nhưng total không nguyên", { ok: true, total: 1000.5 }],
      ["ok nhưng total là chuỗi", { ok: true, total: "150000" }],
    ];
    for (const [name, raw] of bad) {
      it(`${name} → thất bại`, () => {
        expect(parsePayBillResult(raw)).toEqual({ ok: false, error: fallback });
      });
    }
  });
});

describe("changeToReturn — tiền trả lại khách", () => {
  it("khách đưa dư → trả lại phần dư", () => {
    expect(changeToReturn(200000, 150000)).toBe(50000);
  });

  it("khách đưa đúng → 0", () => {
    expect(changeToReturn(150000, 150000)).toBe(0);
  });

  it("khách đưa thiếu (hoặc đường chuyển khoản) → 0, KHÔNG ra số âm", () => {
    expect(changeToReturn(100000, 150000)).toBe(0);
  });

  it("số lẻ được làm tròn trước khi trừ", () => {
    expect(changeToReturn(200000.4, 150000)).toBe(50000);
    expect(changeToReturn(200000.6, 150000)).toBe(50001);
  });
});
