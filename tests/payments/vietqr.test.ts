import { describe, it, expect } from "vitest";
import { buildVietQrPayload, crc16, transferContent } from "@/lib/payments/vietqr";

/**
 * PAY-01 — chuỗi VietQR phải khớp TỪNG BYTE với chuỗi do thư viện đã dùng thật sinh ra. Sai một byte
 * là app ngân hàng báo "mã không hợp lệ" ngay trước mặt khách.
 *
 * Nguồn chuỗi mẫu (chép 27/09/2026):
 *  - [S] https://pkg.go.dev/github.com/subiz/vietqr — ví dụ Generate() và phần giải thích chuẩn.
 *  - [W] https://pkg.go.dev/github.com/weirdobeardo48/vietqr — ví dụ HDBank 505.000đ, CRC công bố 33C4.
 *    Bản chép trên mạng rơi mất một số 0 ở tag 54 ("5406" + 5 ký tự); chuỗi dưới là bản đủ 6 ký tự —
 *    CRC 33C4 của nguồn khớp đúng bản này, nên đây là chuỗi gốc.
 */
const MAU = [
  {
    ten: "[S] có số tiền, nội dung có khoảng trắng (VietinBank)",
    input: { bin: "970415", accountNo: "0011001932418", amount: 120000, content: "ung ho lu lut" },
    payload:
      "00020101021238570010A00000072701270006970415011300110019324180208QRIBFTTA530370454061200005802VN62170813ung ho lu lut6304C15C",
  },
  {
    ten: "[S] mã tĩnh — không số tiền, không nội dung (TPBank)",
    input: { bin: "970423", accountNo: "0099999999" },
    payload: "00020101021138540010A00000072701240006970423011000999999990208QRIBFTTA53037045802VN6304CBB4",
  },
  {
    ten: "[S] số TK 19 ký tự, nội dung đúng 25 ký tự (MBBank)",
    input: { bin: "970422", accountNo: "0023457923442ASDFLJ", amount: 40123, content: "chuyen khoan alsdkf laksj" },
    payload:
      "00020101021238630010A0000007270133000697042201190023457923442ASDFLJ0208QRIBFTTA53037045405401235802VN62290825chuyen khoan alsdkf laksj6304E5DB",
  },
  {
    ten: "[W] có số tiền (HDBank)",
    input: { bin: "970437", accountNo: "999990335280715", amount: 505000, content: "test noi dung" },
    payload:
      "00020101021238590010A0000007270129000697043701159999903352807150208QRIBFTTA530370454065050005802VN62170813test noi dung630433C4",
  },
];

describe("buildVietQrPayload", () => {
  it.each(MAU)("$ten → khớp từng byte", ({ input, payload }) => {
    expect(buildVietQrPayload(input)).toBe(payload);
  });

  it("CRC16: chuỗi chuẩn '123456789' → 29B1 (CRC-16/CCITT-FALSE)", () => {
    expect(crc16("123456789")).toBe("29B1");
  });

  it("CRC luôn đúng 4 ký tự hex IN HOA, kể cả khi có số 0 đứng đầu", () => {
    for (let i = 0; i < 200; i++) {
      const p = buildVietQrPayload({ bin: "970436", accountNo: String(1000 + i), amount: 1000 + i });
      expect(p.slice(-8, -4)).toBe("6304");
      expect(p.slice(-4)).toMatch(/^[0-9A-F]{4}$/);
    }
  });

  it("độ dài TLV: giá trị 1 ký tự và 2 chữ số độ dài đều đệm đúng", () => {
    const p = buildVietQrPayload({ bin: "970436", accountNo: "1", amount: 5, content: "A" });
    expect(p).toContain("0006970436" + "01011"); // tag 01 (số TK) dài 01, giá trị "1"
    expect(p).toContain("54015"); // tag 54 dài 01
    expect(p).toContain("62050801A"); // tag 62 dài 05 bọc tag 08 dài 01
  });

  it.each([0, -1000, 1.5, Number.NaN])("số tiền %s → báo lỗi, không có QR '0đ'", (amount) => {
    expect(() => buildVietQrPayload({ bin: "970436", accountNo: "123456", amount })).toThrow(/số tiền/);
  });

  it("nội dung có dấu / ký tự đặc biệt / dài hơn 25 → báo lỗi", () => {
    for (const content of ["Hóa đơn", "HD#12", "A".repeat(26)]) {
      expect(() => buildVietQrPayload({ bin: "970436", accountNo: "123456", amount: 1, content })).toThrow(/nội dung/);
    }
  });

  it("BIN sai → báo lỗi", () => {
    expect(() => buildVietQrPayload({ bin: "97043", accountNo: "123456" })).toThrow(/BIN/);
  });
});

describe("transferContent", () => {
  it("23:30 giờ VN 27/09 (16:30Z) → ngày 27/09", () => {
    expect(transferContent(12, new Date("2026-09-27T16:30:00Z"))).toBe("HD12 2709");
  });

  it("00:30 giờ VN 28/09 (17:30Z hôm trước) → ngày 28/09, không phải 27/09", () => {
    expect(transferContent(3, new Date("2026-09-27T17:30:00Z"))).toBe("HD3 2809");
  });

  it("chỉ ASCII chữ/số/khoảng trắng, ≤ 25 ký tự — dùng được làm nội dung QR", () => {
    const c = transferContent(99999, new Date("2026-12-31T16:59:59Z"));
    expect(c).toMatch(/^[A-Z0-9 ]{1,25}$/);
    expect(() => buildVietQrPayload({ bin: "970436", accountNo: "123456", amount: 1, content: c })).not.toThrow();
  });
});
