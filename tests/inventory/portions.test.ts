import { describe, it, expect } from "vitest";
import { portionBadge, LOW_PORTIONS } from "@/lib/inventory/portions";

describe("nhãn số phần trên POS (INV-07, QD-017 D5)", () => {
  it("ngưỡng là 5", () => {
    expect(LOW_PORTIONS).toBe(5);
  });

  it("undefined (món không khai định lượng) → không nhãn", () => {
    expect(portionBadge(undefined)).toEqual({ tone: "none", text: "" });
  });

  it("6 → không nhãn", () => {
    expect(portionBadge(6).tone).toBe("none");
  });

  it("5 → còn ~5", () => {
    expect(portionBadge(5)).toEqual({ tone: "neutral", text: "còn ~5" });
  });

  it("1 → còn ~1", () => {
    expect(portionBadge(1)).toEqual({ tone: "neutral", text: "còn ~1" });
  });

  it("0 và -2 → cảnh báo vàng", () => {
    const w = { tone: "warning", text: "Có thể đã hết — hãy hỏi bếp" };
    expect(portionBadge(0)).toEqual(w);
    expect(portionBadge(-2)).toEqual(w);
  });
});
