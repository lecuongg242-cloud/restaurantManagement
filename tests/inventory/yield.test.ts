import { describe, it, expect } from "vitest";
import { measureYield, yieldSamples, YIELD_WINDOW_DAYS } from "@/lib/inventory/yield";

type Ing = { id: string; kind?: string; counted: boolean; order_usage: number; adjust?: number; yield_pct?: number };
const close = (day: string, ings: Ing[]) => ({
  business_date: day,
  payload: { ingredients: ings.map((i) => ({ kind: "purchased", adjust: 0, ...i })) },
});
const pct = (closes: ReturnType<typeof close>[], fallback = 100, truncated = false) =>
  measureYield(yieldSamples(closes, new Map([["bo", fallback]]), truncated).get("bo") ?? []);

describe("% dùng được tự tính (bản chốt → mẫu → %)", () => {
  it("ví dụ chủ dự án: bán cần 4,0 kg, thực dùng 4,5 kg → 89%", () => {
    // order_usage 4000 g (yield đang 100%), kiểm kê thiếu 500 g → adjust −500 → thực dùng 4500 g.
    expect(pct([close("2026-09-28", [{ id: "bo", counted: true, order_usage: 4000, adjust: -500 }])])).toEqual({ pct: 89, days: 1 });
  });

  it("nhập một ngày, dùng nhiều ngày, kiểm kê mỗi ngày → mỗi ngày một mẫu, không cần có nhập", () => {
    // Ngày 1 nhập 10 kg, ngày 2–3 không nhập; mỗi ngày bán cần 2,7 kg, đếm ra thực dùng 3 kg (adjust −300).
    const c = ["2026-09-26", "2026-09-27", "2026-09-28"].map((d) => close(d, [{ id: "bo", counted: true, order_usage: 2700, adjust: -300 }]));
    expect(pct(c)).toEqual({ pct: 90, days: 3 });
  });

  it("kiểm kê cách ngày: chênh lệch của cả khoảng chia cho lượng bán của CẢ khoảng", () => {
    // Ngày 27, 28 không kiểm; ngày 29 kiểm thiếu 900 g cho cả 3 ngày bán 2700 g mỗi ngày → 8100 / 9000 = 90%.
    const c = [
      close("2026-09-27", [{ id: "bo", counted: false, order_usage: 2700 }]),
      close("2026-09-28", [{ id: "bo", counted: false, order_usage: 2700 }]),
      close("2026-09-29", [{ id: "bo", counted: true, order_usage: 2700, adjust: -900 }]),
    ];
    expect(pct(c)).toEqual({ pct: 90, days: 1 });
  });

  it("yield ngày đó đã khác 100 → nhân ngược đúng (order_usage là lượng thô); bản chốt cũ thiếu yield dùng yield hiện tại", () => {
    expect(pct([close("2026-09-28", [{ id: "bo", counted: true, order_usage: 5000, yield_pct: 80 }])]).pct).toBe(80);
    expect(pct([close("2026-09-28", [{ id: "bo", counted: true, order_usage: 5000 }])], 80).pct).toBe(80);
  });

  it(`chỉ lấy ${YIELD_WINDOW_DAYS} lần kiểm kê GẦN NHẤT`, () => {
    const cu = Array.from({ length: 10 }, (_, i) => close(`2026-08-${String(i + 1).padStart(2, "0")}`, [{ id: "bo", counted: true, order_usage: 1000, adjust: -1000 }]));
    const moi = Array.from({ length: 14 }, (_, i) => close(`2026-09-${String(i + 10).padStart(2, "0")}`, [{ id: "bo", counted: true, order_usage: 1000 }]));
    expect(pct([...cu, ...moi])).toEqual({ pct: 100, days: 14 });
  });

  it("khoảng đọc bị cắt (còn bản chốt cũ hơn) → bỏ mẫu đầu vì thiếu phần đầu khoảng", () => {
    const c = [
      close("2026-09-27", [{ id: "bo", counted: false, order_usage: 2700 }]),
      close("2026-09-28", [{ id: "bo", counted: true, order_usage: 2700, adjust: -2000 }]),
      close("2026-09-29", [{ id: "bo", counted: true, order_usage: 2700, adjust: -300 }]),
    ];
    expect(pct(c, 100, true)).toEqual({ pct: 90, days: 1 });
  });

  it("đếm dư → kẹp 100; hụt cực lớn → không dưới 1; không có kiểm kê / không bán → null", () => {
    expect(pct([close("2026-09-28", [{ id: "bo", counted: true, order_usage: 1000, adjust: 300 }])]).pct).toBe(100);
    expect(pct([close("2026-09-28", [{ id: "bo", counted: true, order_usage: 10, adjust: -100_000 }])]).pct).toBe(1);
    expect(pct([close("2026-09-28", [{ id: "bo", counted: false, order_usage: 1000 }])])).toEqual({ pct: null, days: 0 });
    expect(pct([close("2026-09-28", [{ id: "bo", counted: true, order_usage: 0, adjust: -50 }])])).toEqual({ pct: null, days: 0 });
  });

  it("chỉ nguyên liệu mua vào: bán thành phẩm bỏ qua", () => {
    const m = yieldSamples([close("2026-09-28", [{ id: "nd", kind: "prepared", counted: true, order_usage: 9000, adjust: -100 }])], new Map([["nd", 100]]));
    expect(m.size).toBe(0);
  });
});
