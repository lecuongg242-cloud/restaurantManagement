import { describe, it, expect } from "vitest";
import { historyStatuses, isHistoryStatusFilter } from "@/lib/orders/history-filter";

describe("historyStatuses (ORDER-18)", () => {
  it("'all' lấy cả đơn đã thu lẫn đơn hủy", () => {
    expect(historyStatuses("all")).toEqual(["completed", "cancelled"]);
  });

  it("'paid' chỉ lấy đơn đã hoàn tất", () => {
    expect(historyStatuses("paid")).toEqual(["completed"]);
  });

  it("'cancelled' chỉ lấy đơn hủy", () => {
    expect(historyStatuses("cancelled")).toEqual(["cancelled"]);
  });
});

describe("isHistoryStatusFilter — chặn giá trị lạ từ client", () => {
  it("nhận đúng 3 giá trị hợp lệ", () => {
    expect(isHistoryStatusFilter("all")).toBe(true);
    expect(isHistoryStatusFilter("paid")).toBe(true);
    expect(isHistoryStatusFilter("cancelled")).toBe(true);
  });

  it("từ chối giá trị ngoài danh sách", () => {
    expect(isHistoryStatusFilter("completed")).toBe(false);
    expect(isHistoryStatusFilter("")).toBe(false);
    expect(isHistoryStatusFilter(undefined)).toBe(false);
  });
});
