import { describe, it, expect } from "vitest";
import { thuTuHopLe } from "@/lib/menu/reorder";

/**
 * MENU-08 (P38) — kéo thả gửi lên CẢ danh sách id theo thứ tự mới. Server chỉ ghi khi danh sách đó là đúng tập hiện có:
 * thiếu (món vừa thêm ở máy khác), thừa (id quán khác / món đã xóa) hay trùng đều từ chối — ghi bừa sẽ làm `sort_order`
 * trùng hoặc đụng sang dữ liệu quán khác.
 */
describe("thuTuHopLe", () => {
  const hienCo = ["a", "b", "c"];

  it("nhận đúng tập, thứ tự bất kỳ", () => {
    expect(thuTuHopLe(hienCo, ["c", "a", "b"])).toBe(true);
    expect(thuTuHopLe(hienCo, ["a", "b", "c"])).toBe(true);
  });

  it("từ chối khi thiếu id (máy khác vừa thêm món)", () => {
    expect(thuTuHopLe(hienCo, ["a", "b"])).toBe(false);
  });

  it("từ chối khi có id lạ (quán khác / đã xóa)", () => {
    expect(thuTuHopLe(hienCo, ["a", "b", "x"])).toBe(false);
    expect(thuTuHopLe(hienCo, ["a", "b", "c", "x"])).toBe(false);
  });

  it("từ chối khi trùng id", () => {
    expect(thuTuHopLe(hienCo, ["a", "a", "b"])).toBe(false);
  });

  it("danh sách rỗng chỉ hợp lệ khi hiện không có gì", () => {
    expect(thuTuHopLe([], [])).toBe(true);
    expect(thuTuHopLe(hienCo, [])).toBe(false);
  });
});
