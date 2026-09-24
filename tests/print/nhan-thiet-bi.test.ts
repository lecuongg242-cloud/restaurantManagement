import { describe, it, expect } from "vitest";
import { nhanThietBiIn } from "@/lib/print/nhan-thiet-bi";

/**
 * Chip "thiết bị in" thường trực trên thanh công cụ POS.
 *
 * Nhân viên đứng quầy mới là người cần biết máy in bếp có chạy không — trước đây chỉ chủ quán thấy,
 * và chỉ khi vào /admin/printers. Mỗi trạng thái phải nói ra MỘT điều nhân viên hiểu ngay, không
 * phải thuật ngữ kỹ thuật.
 */
describe("nhanThietBiIn", () => {
  it("cầu in sống + máy in phản hồi → xanh, 'sẵn sàng'", () => {
    expect(nhanThietBiIn({ cauIn: "song", mayIn: "ok" })).toEqual({ tone: "tot", nhan: "Máy in bếp sẵn sàng" });
  });

  it("cầu in sống + máy in KHÔNG phản hồi → đỏ — phiếu gửi lúc này sẽ lỗi", () => {
    expect(nhanThietBiIn({ cauIn: "song", mayIn: "loi" })).toEqual({
      tone: "xau",
      nhan: "Máy in bếp không phản hồi",
    });
  });

  it("cầu in sống nhưng chưa rõ máy in (cầu in bản cũ / chưa kiểm) → xám, không nói 'sẵn sàng'", () => {
    expect(nhanThietBiIn({ cauIn: "song", mayIn: "khong-biet" })).toEqual({
      tone: "chua-ro",
      nhan: "Máy in bếp: chưa rõ",
    });
  });

  it("cầu in chết → đỏ, nói về CẦU IN — máy in lúc này không kiểm được", () => {
    expect(nhanThietBiIn({ cauIn: "chet", mayIn: "khong-biet" })).toEqual({
      tone: "xau",
      nhan: "Cầu in mất kết nối",
    });
  });

  it("chưa từng có cầu in → xám", () => {
    expect(nhanThietBiIn({ cauIn: "chua-co", mayIn: "khong-biet" })).toEqual({
      tone: "chua-ro",
      nhan: "Chưa có cầu in",
    });
  });
});
