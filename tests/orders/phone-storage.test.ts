import { describe, expect, it } from "vitest";
import { phoneForStorage } from "@/lib/orders/guest-contact";

/**
 * CUST-01: mọi đường ghi (QR, online, POS mang về, đặt bàn) lưu SĐT cùng MỘT dạng, để danh sách khách
 * (P16) gom đúng một người. Trước đây chỉ màn QR (client) chuẩn hóa; online/POS/đặt bàn lưu nguyên chuỗi.
 */
describe("phoneForStorage", () => {
  it("các cách viết của cùng một số về một dạng 0…", () => {
    for (const raw of ["+84 912 345 678", "84912345678", "0912.345.678", " 0912 345 678 ", "0912-345-678"]) {
      expect(phoneForStorage(raw)).toBe("0912345678");
    }
  });

  it("số cố định 11 chữ số giữ nguyên", () => {
    expect(phoneForStorage("028 3822 1234")).toBe("02838221234");
  });

  it("rỗng / chỉ khoảng trắng / thiếu → null", () => {
    expect(phoneForStorage("")).toBeNull();
    expect(phoneForStorage("   ")).toBeNull();
    expect(phoneForStorage(undefined)).toBeNull();
    expect(phoneForStorage(null)).toBeNull();
  });

  it("không phải SĐT Việt Nam hợp lệ → giữ chuỗi gốc đã cắt (không làm mất thông tin khách đã gõ)", () => {
    expect(phoneForStorage(" gọi Zalo ")).toBe("gọi Zalo");
    expect(phoneForStorage("12345")).toBe("12345");
  });

  it("chuỗi quá dài bị cắt ở 20 ký tự như trước", () => {
    expect(phoneForStorage("x".repeat(30))).toBe("x".repeat(20));
  });
});
