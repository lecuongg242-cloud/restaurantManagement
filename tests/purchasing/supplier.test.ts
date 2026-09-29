import { describe, it, expect } from "vitest";
import { normalizePhone, parseSupplierForm } from "@/lib/purchasing/supplier";

const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

describe("normalizePhone", () => {
  it("bỏ dấu cách / chấm, +84 → 0", () => {
    expect(normalizePhone("0912 345.678")).toBe("0912345678");
    expect(normalizePhone("+84 912 345 678")).toBe("0912345678");
    expect(normalizePhone("")).toBeNull();
  });
});

describe("parseSupplierForm", () => {
  it("chỉ tên là bắt buộc; trống → null", () => {
    expect(parseSupplierForm(fd({ name: "  Mối thịt Lan  " }))).toEqual({
      ok: true,
      value: { name: "Mối thịt Lan", phone: null, email: null, address: null, tax_code: null, note: null },
    });
  });
  it("thiếu tên / SĐT, MST, email sai → lỗi tiếng Việt", () => {
    expect(parseSupplierForm(fd({ name: " " }))).toMatchObject({ ok: false });
    expect(parseSupplierForm(fd({ name: "A", phone: "12" }))).toMatchObject({ ok: false, error: expect.stringMatching(/điện thoại/) });
    expect(parseSupplierForm(fd({ name: "A", tax_code: "123" }))).toMatchObject({ ok: false, error: expect.stringMatching(/thuế/) });
    expect(parseSupplierForm(fd({ name: "A", email: "x@" }))).toMatchObject({ ok: false, error: expect.stringMatching(/Email/) });
  });
  it("MST 13 số có gạch hợp lệ", () => {
    expect(parseSupplierForm(fd({ name: "A", tax_code: "0101234567-001" }))).toMatchObject({ ok: true });
  });
});
