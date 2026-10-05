import { describe, it, expect } from "vitest";
import { lockLines, lockMessage, parseLockDetail, parseVnDateTime, toVnDateTimeInput } from "@/lib/inventory/lock";
import { firstOpenDay, openDaysIn, OPEN_DAYS } from "@/lib/inventory/close";

describe("Thời gian nhập theo giờ VN (P34 INV-18)", () => {
  it("14:00 ngày 05/10 giờ VN = 07:00 UTC, không phụ thuộc múi giờ máy chạy", () => {
    expect(parseVnDateTime("2026-10-05T14:00")).toBe("2026-10-05T07:00:00.000Z");
    expect(parseVnDateTime("2026-10-06T03:30")).toBe("2026-10-05T20:30:00.000Z");
  });

  it("chuỗi sai / ngày không có thật → null", () => {
    expect(parseVnDateTime("")).toBeNull();
    expect(parseVnDateTime("2026-10-05")).toBeNull();
    expect(parseVnDateTime("2026-02-31T10:00")).toBeNull();
    expect(parseVnDateTime("2026-10-05T25:00")).toBeNull();
    expect(parseVnDateTime(null)).toBeNull();
  });

  it("đi hai chiều với ô nhập", () => {
    expect(toVnDateTimeInput("2026-10-05T07:00:00.000Z")).toBe("2026-10-05T14:00");
    expect(parseVnDateTime(toVnDateTimeInput("2026-10-05T20:30:00Z"))).toBe("2026-10-05T20:30:00.000Z");
    expect(toVnDateTimeInput(null)).toBe("");
  });
});

describe("Thông báo vướng kiểm kê (P34 INV-20)", () => {
  const detail = JSON.stringify([
    { ingredient: "Thịt bò thăn", count_id: "c1", code: "KK000012", at: "2026-10-05T14:45:00Z" },
    { ingredient: "Bia Hà Nội", count_id: "c1", code: "KK000012", at: "2026-10-05T14:45:00Z" },
    { ingredient: "Thịt bò thăn", count_id: "c2", code: "KK000013", at: "2026-10-05T15:10:00Z" },
  ]);

  it("đọc chi tiết của lỗi vuong_kiem_ke, bỏ qua lỗi khác", () => {
    expect(parseLockDetail("vuong_kiem_ke", detail)).toHaveLength(3);
    expect(parseLockDetail("ngay_da_chot", detail)).toBeNull();
    expect(parseLockDetail("vuong_kiem_ke", "không phải json")).toBeNull();
    expect(parseLockDetail("vuong_kiem_ke", null)).toBeNull();
  });

  it("gộp nguyên liệu cùng phiếu, ghi giờ VN", () => {
    const c = parseLockDetail("vuong_kiem_ke", detail)!;
    expect(lockLines(c)).toEqual([
      "Thịt bò thăn, Bia Hà Nội — đã kiểm kê lúc 21:45 05/10 (phiếu KK000012)",
      "Thịt bò thăn — đã kiểm kê lúc 22:10 05/10 (phiếu KK000013)",
    ]);
    expect(lockMessage(c.slice(0, 1), "Không hủy được")).toContain("Hủy phiếu kiểm kê → ghi phiếu này → Hoàn thành lại");
  });
});

describe("Sổ để mở 7 ngày (P34 INV-22)", () => {
  it("ngày cũ nhất còn mở = hôm nay − 6; ngày D chốt khi hôm nay ≥ D + 7", () => {
    expect(OPEN_DAYS).toBe(7);
    expect(firstOpenDay("2026-10-12")).toBe("2026-10-06");
  });

  it("ngày chưa chốt trong kỳ báo cáo", () => {
    expect(openDaysIn({ fromDay: "2026-10-01", toDay: "2026-10-31" }, "2026-10-03", "2026-10-05")).toEqual([
      "2026-10-03",
      "2026-10-04",
      "2026-10-05",
    ]);
    // Kỳ đã chốt hết.
    expect(openDaysIn({ fromDay: "2026-09-01", toDay: "2026-09-30" }, "2026-10-03", "2026-10-05")).toEqual([]);
    // Kỳ bắt đầu sau ngày mở đầu tiên.
    expect(openDaysIn({ fromDay: "2026-10-05", toDay: "2026-10-05" }, "2026-10-03", "2026-10-05")).toEqual(["2026-10-05"]);
    expect(openDaysIn({ fromDay: "2026-10-01", toDay: "2026-10-31" }, null, "2026-10-05")).toEqual([]);
  });
});
