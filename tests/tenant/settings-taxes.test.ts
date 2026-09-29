import { describe, it, expect } from "vitest";
import { parseSettings, parseTaxes } from "@/lib/tenant/settings";

describe("parseTaxes — Thuế nộp nhà nước (QD-027 C9)", () => {
  it("dòng hợp lệ giữ nguyên; % lẻ làm tròn 2 số", () => {
    expect(parseTaxes([{ name: "GTGT", pct: 3, base: "revenue" }, { name: "TNCN", pct: "1.505", base: "revenue" }])).toEqual([
      { name: "GTGT", pct: 3, base: "revenue" },
      { name: "TNCN", pct: 1.51, base: "revenue" },
    ]);
  });
  it("dòng hỏng bị lọc: % âm / 0 / > 100, thiếu tên, cơ sở lạ", () => {
    expect(
      parseTaxes([
        { name: "a", pct: -1, base: "revenue" },
        { name: "b", pct: 0, base: "revenue" },
        { name: "c", pct: 101, base: "profit" },
        { name: " ", pct: 5, base: "profit" },
        { name: "d", pct: 5, base: "lai" },
        "x",
      ])
    ).toEqual([]);
  });
  it("quá 5 dòng → giữ 5 dòng đầu", () => {
    const six = Array.from({ length: 6 }, (_, i) => ({ name: `T${i}`, pct: 1, base: "revenue" }));
    expect(parseTaxes(six)).toHaveLength(5);
  });
  it("khối taxes hỏng không làm mất các khóa cài đặt khác; mặc định rỗng", () => {
    const s = parseSettings({ vat_pct: 8, receipt_footer: "Cảm ơn", taxes: "rác" });
    expect(s.taxes).toEqual([]);
    expect(s.vat_pct).toBe(8);
    expect(s.receipt_footer).toBe("Cảm ơn");
    expect(parseSettings({}).taxes).toEqual([]);
  });
});
