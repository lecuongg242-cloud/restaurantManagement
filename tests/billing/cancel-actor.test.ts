import { describe, it, expect } from "vitest";
import { cancelActorLabel, hasActorName, UNKNOWN_ACTOR } from "@/lib/billing/cancel-actor";

describe("cancelActorLabel (REPORT-10)", () => {
  it("có tên → lấy tên", () => {
    expect(cancelActorLabel({ name: "Hoàng", role: "manager" })).toBe("Hoàng");
  });

  it('RPC coalesce tên rỗng thành "—" → rơi về VAI TRÒ, không in ký tự rác', () => {
    expect(cancelActorLabel({ name: "—", role: "manager" })).toBe("Quản lý");
  });

  it("tên rỗng và vai trò lạ → Không rõ", () => {
    expect(cancelActorLabel({ name: "", role: "robot" })).toBe(UNKNOWN_ACTOR);
  });

  // Chính là ca lệch chữ giữa hai nửa khối "Món bị hủy": bảng "Chi tiết" không có `role` nên
  // trước đây in thẳng "—" trong khi danh sách bên trên đọc ra "Không rõ".
  it('bảng "Chi tiết" không có vai trò → cùng một lượt hủy vẫn đọc ra Không rõ', () => {
    expect(cancelActorLabel({ name: "—" })).toBe(UNKNOWN_ACTOR);
  });

  it("không có người duyệt (cancelled_by null) → Không rõ", () => {
    expect(cancelActorLabel({ name: null, role: null })).toBe(UNKNOWN_ACTOR);
  });

  it("tên chỉ có khoảng trắng bị coi như không có tên", () => {
    expect(hasActorName("   ")).toBe(false);
    expect(cancelActorLabel({ name: "  ", role: "cashier" })).toBe("Thu ngân");
  });

  it("tên có khoảng trắng thừa hai đầu → cắt gọn khi hiện", () => {
    expect(cancelActorLabel({ name: " Lan ", role: "cashier" })).toBe("Lan");
  });
});
