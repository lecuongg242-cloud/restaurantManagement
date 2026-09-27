import { describe, it, expect } from "vitest";
import { conLaiSauKhiGui } from "@/lib/orders/cart";
import type { CartLine } from "@/lib/orders/types";

/**
 * Lỗi tìm ra khi làm POS điện thoại (12-05): bấm "Xác nhận thêm" rồi, trong lúc chờ mạng, thêm món khác
 * vào giỏ → lượt gửi đầu xong thì `setCart([])` XÓA LUÔN món vừa thêm. Món đó không vào bếp, không báo gì.
 * Điện thoại mạng chậm + phục vụ thao tác nhanh là gặp. Sửa: chỉ bỏ những dòng đã gửi.
 */
const dong = (lineId: string, itemId = "mon"): CartLine => ({ lineId, itemId, qty: 1, note: "", optionIds: [] });

describe("conLaiSauKhiGui", () => {
  it("bỏ đúng những dòng đã gửi, GIỮ dòng thêm vào trong lúc chờ", () => {
    const daGui = [dong("a"), dong("b")];
    const gioHienTai = [dong("a"), dong("b"), dong("c", "mon-moi")];
    expect(conLaiSauKhiGui(gioHienTai, daGui)).toEqual([dong("c", "mon-moi")]);
  });

  it("không ai thêm gì trong lúc chờ → giỏ trống như cũ", () => {
    const g = [dong("a")];
    expect(conLaiSauKhiGui(g, g)).toEqual([]);
  });

  it("dòng đã gửi bị xóa khỏi giỏ trong lúc chờ → không lỗi", () => {
    expect(conLaiSauKhiGui([dong("c")], [dong("a")])).toEqual([dong("c")]);
  });
});
