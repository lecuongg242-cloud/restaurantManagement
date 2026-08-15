import { describe, it, expect } from "vitest";
import { formatCancelNote } from "@/lib/orders/cancel-label";

// 20:15 giờ VN = 13:15 UTC
const AT = "2026-08-16T13:15:00.000Z";

describe("formatCancelNote (ORDER-17)", () => {
  it("đủ ba phần: giờ VN · lý do · người duyệt kèm vai trò", () => {
    expect(
      formatCancelNote({ reason: "khách đổi ý", at: AT, actor: { name: "Hoàng", role: "manager" } })
    ).toBe('Đã hủy 20:15 · "khách đổi ý" · Hoàng (Quản lý)');
  });

  it("không tra được người duyệt → bỏ hẳn phần đó, không in ra dấu gạch trơ", () => {
    expect(formatCancelNote({ reason: "hết hàng", at: AT, actor: null })).toBe(
      'Đã hủy 20:15 · "hết hàng"'
    );
  });

  it("thiếu mốc thời gian (dữ liệu cũ chưa backfill) → vẫn đọc được", () => {
    expect(
      formatCancelNote({ reason: "gọi nhầm", at: null, actor: { name: "Lan", role: "cashier" } })
    ).toBe('Đã hủy · "gọi nhầm" · Lan (Thu ngân)');
  });

  it("không có lý do → chỉ còn giờ và người duyệt", () => {
    expect(formatCancelNote({ reason: null, at: AT, actor: { name: "Lan", role: "cashier" } })).toBe(
      "Đã hủy 20:15 · Lan (Thu ngân)"
    );
  });

  it("lý do chỉ có khoảng trắng bị coi như không có", () => {
    expect(formatCancelNote({ reason: "   ", at: null, actor: null })).toBe("Đã hủy");
  });

  it("vai trò lạ thì hiện tên trơn, không in mã tiếng Anh ra màn hình", () => {
    expect(formatCancelNote({ reason: null, at: null, actor: { name: "Ai đó", role: "robot" } })).toBe(
      "Đã hủy · Ai đó"
    );
  });

  it("qua nửa đêm giờ VN vẫn đúng (17:30 UTC = 00:30 hôm sau)", () => {
    expect(
      formatCancelNote({ reason: null, at: "2026-08-16T17:30:00.000Z", actor: null })
    ).toBe("Đã hủy 00:30");
  });

  it("membership tra ra nhưng không có tên (display_name null → rỗng) + vai trò hợp lệ → rơi về vai trò", () => {
    expect(
      formatCancelNote({ reason: "khách đổi ý", at: AT, actor: { name: "", role: "manager" } })
    ).toBe('Đã hủy 20:15 · "khách đổi ý" · Quản lý');
  });

  it("không có tên (chỉ khoảng trắng) + vai trò lạ → bỏ hẳn phần người duyệt", () => {
    expect(
      formatCancelNote({ reason: "khách đổi ý", at: AT, actor: { name: "   ", role: "robot" } })
    ).toBe('Đã hủy 20:15 · "khách đổi ý"');
  });
});
