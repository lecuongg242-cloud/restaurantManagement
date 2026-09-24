import { describe, it, expect } from "vitest";
import { businessDate, addDays } from "@/lib/inventory/day";

describe("ngày kinh doanh theo giờ VN (INV-04) — chạy dưới TZ=UTC", () => {
  it("23:59 VN là hôm nay", () => {
    // 23:59 ngày 24/09 giờ VN = 16:59 UTC
    expect(businessDate(new Date("2026-09-24T16:59:00Z"))).toBe("2026-09-24");
  });

  it("00:01 VN là ngày mới", () => {
    // 00:01 ngày 25/09 giờ VN = 17:01 UTC ngày 24/09 — máy UTC sẽ nói "24/09" nếu tính sai
    expect(businessDate(new Date("2026-09-24T17:01:00Z"))).toBe("2026-09-25");
  });

  it("cộng/trừ ngày qua ranh giới tháng", () => {
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});
