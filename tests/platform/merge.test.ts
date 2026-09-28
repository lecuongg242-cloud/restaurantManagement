import { describe, it, expect } from "vitest";
import { gopCauHinh, type DongCauHinh } from "@/lib/platform/merge";

/** Cấu hình nền tảng (0060): DB là nguồn chính, env PLATFORM_* dự phòng TỪNG trường. */
const DONG: DongCauHinh = {
  bank_bin: "970422",
  bank_account_no: "0011223344",
  bank_account_name: "CONG TY A",
  support_phone: "0911 111 111",
};
const ENV = {
  PLATFORM_BANK_BIN: "970436",
  PLATFORM_BANK_ACCOUNT_NO: "0123456789",
  PLATFORM_BANK_ACCOUNT_NAME: "CONG TY ENV",
  PLATFORM_SUPPORT_PHONE: "0900 000 000",
};

describe("gopCauHinh", () => {
  it("DB đủ → dùng DB", () => {
    const c = gopCauHinh(DONG, ENV);
    expect(c.bank).toEqual({ bin: "970422", account_no: "0011223344", account_name: "CONG TY A" });
    expect(c.bankSource).toBe("db");
    expect(c.supportPhone).toBe("0911 111 111");
  });

  it("chưa có dòng DB → toàn bộ env", () => {
    const c = gopCauHinh(null, ENV);
    expect(c.bank?.account_no).toBe("0123456789");
    expect(c.bankSource).toBe("env");
    expect(c.supportPhone).toBe("0900 000 000");
  });

  it("tài khoản DB thiếu một trường → lấy NGUYÊN khối env, không ghép lẫn hai nguồn", () => {
    const c = gopCauHinh({ ...DONG, bank_account_name: null }, ENV);
    expect(c.bank).toEqual({ bin: "970436", account_no: "0123456789", account_name: "CONG TY ENV" });
    expect(c.bankSource).toBe("env");
  });

  it("không DB, không env → mọi thứ null (trang Gia hạn ẩn QR)", () => {
    const c = gopCauHinh(null, {});
    expect(c).toEqual({ bank: null, bankSource: null, supportPhone: null });
  });

});
