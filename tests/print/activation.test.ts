import { describe, it, expect } from "vitest";
import { generateCode, normalizeCode, hashCode, CODE_ALPHABET, CODE_LENGTH } from "@/lib/print/activation";

/**
 * PRINT-11 — mã kích hoạt cầu in (QD-019 D6). Người cài đọc mã qua điện thoại rồi gõ tay trên laptop
 * quán ⇒ mã phải ngắn, không có ký tự dễ nhầm, và gõ kiểu gì (thường/hoa, có gạch, có cách) cũng nhận.
 */
describe("generateCode", () => {
  it("đúng độ dài, chỉ gồm ký tự trong bảng chữ, không có ký tự dễ nhầm", () => {
    for (let i = 0; i < 200; i++) {
      const c = generateCode();
      expect(c).toHaveLength(CODE_LENGTH);
      for (const ch of c) expect(CODE_ALPHABET).toContain(ch);
    }
    expect(CODE_ALPHABET).not.toMatch(/[01OIL]/);
  });

  it("không lặp trong 1.000 lần sinh (đủ ngẫu nhiên)", () => {
    const s = new Set(Array.from({ length: 1000 }, generateCode));
    expect(s.size).toBe(1000);
  });
});

describe("normalizeCode", () => {
  it("chấp nhận chữ thường, gạch nối, dấu cách", () => {
    expect(normalizeCode("abcd-efgh")).toBe("ABCDEFGH");
    expect(normalizeCode(" ABCD EFGH ")).toBe("ABCDEFGH");
  });

  it("sai độ dài hoặc ký tự lạ → null", () => {
    expect(normalizeCode("ABC")).toBeNull();
    expect(normalizeCode("ABCDEFG0")).toBeNull(); // số 0 không có trong bảng chữ
    expect(normalizeCode("")).toBeNull();
    expect(normalizeCode(undefined)).toBeNull();
  });
});

describe("hashCode", () => {
  it("ổn định và không chứa mã gốc — chỉ bản băm được lưu", () => {
    expect(hashCode("ABCDEFGH")).toBe(hashCode("ABCDEFGH"));
    expect(hashCode("ABCDEFGH")).not.toContain("ABCDEFGH");
    expect(hashCode("ABCDEFGH")).not.toBe(hashCode("ABCDEFGJ"));
  });
});
