import { describe, it, expect } from "vitest";
import { cashErrorMessage, fundOf, isoToVnLocal, vnLocalToIso } from "@/lib/cashbook/labels";

describe("fundOf", () => {
  it("tiền mặt → quỹ tiền mặt; chuyển khoản → ngân hàng", () => {
    expect(fundOf("cash")).toBe("cash");
    expect(fundOf("transfer")).toBe("bank");
  });
});

describe("giờ VN của ô datetime-local (chạy dưới TZ=UTC)", () => {
  it("23:30 giờ VN ngày 29 = 16:30 UTC ngày 29; 00:30 ngày 30 = 17:30 UTC ngày 29", () => {
    expect(vnLocalToIso("2026-09-29T23:30")).toBe("2026-09-29T16:30:00.000Z");
    expect(vnLocalToIso("2026-09-30T00:30")).toBe("2026-09-29T17:30:00.000Z");
  });
  it("đi rồi về ra đúng giá trị cũ", () => {
    expect(isoToVnLocal(vnLocalToIso("2026-01-01T07:05")!)).toBe("2026-01-01T07:05");
  });
  it("sai định dạng → null", () => {
    expect(vnLocalToIso("29/09/2026 10:00")).toBeNull();
    expect(vnLocalToIso("")).toBeNull();
  });
});

describe("cashErrorMessage", () => {
  it("mã lỗi SQL → câu tiếng Việt", () => {
    expect(cashErrorMessage("huy_tu_phieu_nhap")).toMatch(/Hủy bỏ trên phiếu nhập/);
    expect(cashErrorMessage("lạ")).toContain("lạ");
  });
});
