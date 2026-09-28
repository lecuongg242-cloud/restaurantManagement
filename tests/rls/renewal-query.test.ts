import { describe, it, expect } from "vitest";
import { adminClient } from "./fixtures";
import { COT_QUAN_GIA_HAN } from "@/lib/tenant/renewal";

/**
 * Trang Gia hạn (lối thoát duy nhất khi quán bị khóa) đọc quán bằng COT_QUAN_GIA_HAN. Sau 0062, tenants ↔ brands có
 * hai khóa ngoại — một lần nhúng mơ hồ đã làm trang này đẩy mọi chủ quán về trang chủ. Chạy đúng chuỗi cột trên DB.
 */
describe("truy vấn trang Gia hạn", () => {
  it("chạy được trên mọi quán, trả brand (hoặc null) đúng hình dạng", async () => {
    const { data, error } = await adminClient().from("tenants").select(COT_QUAN_GIA_HAN);
    expect(error).toBeNull();
    expect((data ?? []).length).toBeGreaterThan(0);
    for (const t of (data ?? []) as unknown as { brands: unknown }[]) {
      expect(t.brands === null || typeof t.brands === "object").toBe(true);
    }
  });
});
