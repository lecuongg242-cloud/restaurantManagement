import { describe, it, expect } from "vitest";

/**
 * OPS-08 — Bộ test chạy như production.
 *
 * Vercel chạy ở UTC; máy dev ở UTC+7. Ngày 24/09/2026 hóa đơn in sai giờ 7 tiếng vì một hàm dựa
 * vào múi giờ máy chạy — và nó sống sót qua mọi test, vì test chạy trên máy dev thì code hỏng vẫn
 * cho kết quả đúng.
 *
 * Tệp này CỐ Ý không tự đặt `process.env.TZ`: nó chứng minh cấu hình TOÀN CỤC trong
 * vitest.config.ts có hiệu lực với mọi tệp test, kể cả tệp viết sau này mà không ai nhớ tới múi giờ.
 */
describe("múi giờ của bộ test", () => {
  it("là UTC như máy chủ production, không phải múi giờ máy dev", () => {
    expect(new Date(0).getTimezoneOffset(), "bộ test đang chạy theo múi giờ máy dev").toBe(0);
  });

  it("định dạng giờ không nêu timeZone ra giờ UTC — cách viết sai sẽ lộ ngay ở máy dev", () => {
    const s = new Date("2026-09-24T06:34:00.000Z").toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    expect(s).toBe("06:34");
  });
});
