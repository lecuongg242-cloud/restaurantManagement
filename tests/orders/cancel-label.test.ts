import { describe, it, expect } from "vitest";
import {
  formatCancelNote,
  orderCancelActorId,
  isSharedOrderCancelReason,
} from "@/lib/orders/cancel-label";

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

describe("isSharedOrderCancelReason (ORDER-18)", () => {
  it("hủy cả đơn: lý do món trùng lý do đơn → là bản lặp, dòng món khỏi hiện", () => {
    expect(isSharedOrderCancelReason("khách về", "khách về")).toBe(true);
  });

  it("roll-up 'Tất cả món bị hủy' KHÔNG phải lý do chung → dòng món phải hiện", () => {
    expect(isSharedOrderCancelReason("hết hàng", "Tất cả món bị hủy")).toBe(false);
  });

  it("đơn chưa hủy (không có lý do cấp đơn) → dòng món luôn hiện", () => {
    expect(isSharedOrderCancelReason("hết hàng", null)).toBe(false);
    expect(isSharedOrderCancelReason("hết hàng", "   ")).toBe(false);
  });

  it("món không có lý do riêng → coi như lặp, không thêm dòng trống nghĩa", () => {
    expect(isSharedOrderCancelReason(null, "khách về")).toBe(true);
    expect(isSharedOrderCancelReason("  ", "khách về")).toBe(true);
  });

  it("khoảng trắng thừa hai đầu không làm hai lý do giống nhau thành khác nhau", () => {
    expect(isSharedOrderCancelReason(" khách về ", "khách về")).toBe(true);
  });
});

describe("orderCancelActorId (ORDER-18)", () => {
  // 19:00 VN và 20:15 VN
  const AT_A = "2026-08-16T12:00:00.000Z";
  const AT_B = "2026-08-16T13:15:00.000Z";

  it("lấy người duyệt từ món đầu tiên có cancelled_by khớp mốc hủy của đơn", () => {
    expect(
      orderCancelActorId(
        [
          { cancelledBy: null, cancelledAt: null },
          { cancelledBy: "B", cancelledAt: AT_B },
          { cancelledBy: "B", cancelledAt: AT_B },
        ],
        AT_B
      )
    ).toBe("B");
  });

  // Hồi quy: cancelOrder bỏ qua món đã hủy từ trước (.neq status cancelled) nên món của A vẫn
  // giữ nguyên cancelled_by=A. Lấy "món đầu tiên có cancelled_by" sẽ đọc ra
  // 'Đã hủy 20:15 · "lý do của B" · A' — gán nhầm tên.
  it("món bị A hủy lẻ 19:00, B hủy cả đơn 20:15 → phải ra B, không phải A", () => {
    expect(
      orderCancelActorId(
        [
          { cancelledBy: "A", cancelledAt: AT_A },
          { cancelledBy: "B", cancelledAt: AT_B },
        ],
        AT_B
      )
    ).toBe("B");
  });

  it("mọi món đều hủy lẻ trước đó (đơn roll-up) → không gán ai vào ghi chú cấp thẻ", () => {
    expect(orderCancelActorId([{ cancelledBy: "A", cancelledAt: AT_A }], AT_B)).toBe(null);
  });

  it("dữ liệu trước 0027 (cancelled_at món backfill từ created_at, lệch mốc đơn) → null", () => {
    expect(
      orderCancelActorId([{ cancelledBy: "A", cancelledAt: "2026-08-01T03:00:00.000Z" }], AT_B)
    ).toBe(null);
  });

  it("đơn không có mốc hủy → null (không có gì để neo, thà bỏ trống còn hơn chỉ sai người)", () => {
    expect(orderCancelActorId([{ cancelledBy: "B", cancelledAt: AT_B }], null)).toBe(null);
  });

  it("không món nào có người duyệt (đơn khách tự hủy / dữ liệu cũ) → null", () => {
    expect(orderCancelActorId([{ cancelledBy: null, cancelledAt: AT_B }], AT_B)).toBe(null);
    expect(orderCancelActorId([], AT_B)).toBe(null);
  });
});
