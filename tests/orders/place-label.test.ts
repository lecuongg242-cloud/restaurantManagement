import { describe, expect, it } from "vitest";
import { orderPlaceLabel, orderPlaceGroup } from "@/lib/orders/place-label";

/**
 * Nhãn chỗ phải KHỚP nhau ở phiếu khách / hóa đơn / KDS. Điểm dễ sai: quán chế độ quầy lưu đơn
 * channel='takeaway' cho tiện luồng không-bàn, nhưng khách vẫn ăn tại quán → không được in "Mang về".
 */
describe("orderPlaceLabel", () => {
  it("có bàn thì luôn là tên bàn, bất kể chế độ", () => {
    expect(orderPlaceLabel({ serviceMode: "table", tableName: "B1", channel: "dine_in", source: "qr" })).toBe("Bàn B1");
    expect(orderPlaceLabel({ serviceMode: "counter", tableName: "B1", channel: "dine_in", source: "staff" })).toBe("Bàn B1");
  });

  it("chế độ quầy: nhân viên gõ đơn tại quầy = khách ăn tại quán", () => {
    expect(orderPlaceLabel({ serviceMode: "counter", channel: "takeaway", source: "staff" })).toBe("Tại quán");
  });

  it("chế độ quầy: khách tự đặt online lấy đi vẫn là mang về", () => {
    expect(orderPlaceLabel({ serviceMode: "counter", channel: "takeaway", source: "online" })).toBe("Mang về");
  });

  it("chế độ bàn: đơn không gắn bàn do nhân viên gõ là bán mang về", () => {
    expect(orderPlaceLabel({ serviceMode: "table", channel: "takeaway", source: "staff" })).toBe("Mang về");
    expect(orderPlaceLabel({ serviceMode: "table", channel: "takeaway", source: "staff", eatIn: false })).toBe("Mang về");
  });

  it("chế độ bàn: nhân viên chọn 'Tại quán' cho đơn không bàn (ORDER-28, P35)", () => {
    expect(orderPlaceLabel({ serviceMode: "table", channel: "takeaway", source: "staff", eatIn: true })).toBe("Tại quán");
  });

  it("eat_in không đổi đơn có bàn, đơn online, đơn giao", () => {
    expect(orderPlaceLabel({ serviceMode: "table", tableName: "B2", channel: "dine_in", source: "staff", eatIn: true })).toBe("Bàn B2");
    expect(orderPlaceLabel({ serviceMode: "table", channel: "takeaway", source: "online", eatIn: true })).toBe("Mang về");
    expect(orderPlaceLabel({ serviceMode: "table", channel: "delivery", source: "online", eatIn: true })).toBe("Giao tận nơi");
    expect(orderPlaceLabel({ serviceMode: "counter", channel: "takeaway", source: "staff", eatIn: false })).toBe("Tại quán");
  });

  it("báo cáo tách Tại quán / Mang về ở quán chế độ bàn (ORDER-29)", () => {
    const g = (eatIn: boolean) =>
      orderPlaceGroup({ serviceMode: "table", hasTable: false, channel: "takeaway", source: "staff", eatIn });
    expect(g(true)).toBe("Tại quán");
    expect(g(false)).toBe("Mang về");
    expect(orderPlaceGroup({ serviceMode: "table", hasTable: true, channel: "dine_in", source: "staff", eatIn: true })).toBe("Tại bàn");
  });

  it("đơn giao tận nơi giữ nguyên ở mọi chế độ", () => {
    expect(orderPlaceLabel({ serviceMode: "counter", channel: "delivery", source: "online" })).toBe("Giao tận nơi");
    expect(orderPlaceLabel({ serviceMode: "table", channel: "delivery", source: "online" })).toBe("Giao tận nơi");
  });

  it("đơn tại chỗ mất phiên bàn không rơi về 'Mang về'", () => {
    expect(orderPlaceLabel({ serviceMode: "table", tableName: null, channel: "dine_in", source: "qr" })).toBe("Tại quán");
  });
});
