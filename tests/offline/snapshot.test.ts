import { describe, it, expect } from "vitest";
import { banChupHopLe, taoBanChup, PHIEN_BAN_BAN_CHUP } from "@/lib/offline/snapshot";
import type { PosSnapshot } from "@/lib/orders/pos";
import type { CustomerMenu } from "@/lib/orders/customer-menu";

/**
 * P17 17-01 (OFFLINE-01): bản chụp POS lưu trên máy quầy. Máy quầy offline chỉ XEM — bản chụp không được mang
 * PIN, token, SĐT / tên khách, tài khoản ngân hàng, thông tin HĐĐT (QD-024 D4).
 */
const SNAP = {
  areas: [{ id: "a1", name: "Tầng 1" }],
  tables: [
    { id: "t1", name: "Bàn 1", area_id: "a1", status: "occupied", seats: 4, groupSessionId: null },
    { id: "t2", name: "Bàn 2", area_id: "a1", status: "occupied", seats: 4, groupSessionId: "s1" },
  ],
  pending: [],
  unprinted: [],
  reservations: [{ id: "r1", tableId: "t1", reservedAt: "2026-09-28T05:00:00Z", timeLabel: "12:00", customerName: "Chị Hoa", partySize: 4 }],
  calls: [],
  sessions: [
    {
      id: "s1",
      tableId: "t1",
      memberTableIds: ["t2"],
      opened_at: "2026-09-28T04:00:00Z",
      openBill: { id: "b1", bill_no: 12, total: 150000, splitCount: null },
      orders: [
        {
          id: "o1",
          kitchen_no: 7,
          status: "confirmed",
          source: "staff",
          note: null,
          customer_contact: { name: "Anh Nam", phone: "0912345678" },
          created_at: "2026-09-28T04:01:00Z",
          table_session_id: "s1",
          table_id: null,
          items: [
            { id: "i1", name: "Phở bò", qty: 2, note: "ít hành", status: "confirmed", unit_price: 50000, modifiers: ["Thêm thịt"], cancel_reason: null },
            { id: "i2", name: "Trà đá", qty: 1, note: null, status: "cancelled", unit_price: 5000, modifiers: [], cancel_reason: "khách đổi" },
          ],
        },
      ],
    },
  ],
  takeawayOrders: [
    {
      id: "o2",
      channel: "takeaway",
      status: "confirmed",
      kitchenNo: 8,
      createdAt: "2026-09-28T04:05:00Z",
      note: null,
      contact: { name: "Chị Lan", phone: "0987654321" },
      items: [
        { id: "i3", name: "Bún chả", qty: 1, note: null, status: "confirmed", unitPrice: 45000, modifiers: [], cancelReason: null, cancelledBy: null, cancelledAt: null },
      ],
      total: 45000,
      parentOrderId: null,
      cancelReason: null,
      cancelledAt: null,
    },
  ],
} as unknown as PosSnapshot;

const MENU = {
  tenant: { id: "tn", name: "Phở Việt", logo_url: null },
  categories: [
    { id: "c1", name: "Phở", items: [{ id: "m1", name: "Phở bò", description: "x", base_price: 50000, image_url: "a.jpg", is_available: true, groups: [] }] },
  ],
} as CustomerMenu;

/** Mọi đường khóa (a.b[].c) trong một giá trị JSON. */
function khoa(v: unknown, p = ""): string[] {
  if (Array.isArray(v)) return v.flatMap((x) => khoa(x, `${p}[]`));
  if (v && typeof v === "object") {
    return Object.entries(v).flatMap(([k, x]) => {
      const q = p ? `${p}.${k}` : k;
      return [q, ...khoa(x, q)];
    });
  }
  return [];
}

describe("taoBanChup", () => {
  const b = taoBanChup("pho-viet", SNAP, MENU, new Date("2026-09-28T05:00:00Z"));

  it("chỉ lưu đúng các khóa đã liệt kê — thêm khóa mới phải sửa test này", () => {
    expect([...new Set(khoa(b))].sort()).toEqual(
      [
        "v", "slug", "tenQuan", "luc",
        "khu", "khu[].id", "khu[].ten",
        "ban", "ban[].id", "ban[].ten", "ban[].khuId", "ban[].trangThai",
        "phien", "phien[].banId", "phien[].banPhu", "phien[].moLuc", "phien[].soHd", "phien[].tongHd",
        "phien[].don", "phien[].don[].soDon", "phien[].don[].trangThai", "phien[].don[].luc",
        "phien[].don[].mon", "phien[].don[].mon[].ten", "phien[].don[].mon[].sl", "phien[].don[].mon[].tuyChon",
        "phien[].don[].mon[].ghiChu", "phien[].don[].mon[].huy",
        "khongBan", "khongBan[].soDon", "khongBan[].kenh", "khongBan[].trangThai", "khongBan[].luc", "khongBan[].tong",
        "khongBan[].mon", "khongBan[].mon[].ten", "khongBan[].mon[].sl", "khongBan[].mon[].tuyChon",
        "khongBan[].mon[].ghiChu", "khongBan[].mon[].huy",
        "thucDon", "thucDon[].nhom", "thucDon[].mon", "thucDon[].mon[].ten", "thucDon[].mon[].gia", "thucDon[].mon[].con",
      ].sort()
    );
  });

  it("không có SĐT, tên khách, PIN, token, ngân hàng ở bất kỳ đâu trong nội dung", () => {
    const s = JSON.stringify(b);
    expect(s).not.toMatch(/0\d{9}/);
    for (const cam of ["Anh Nam", "Chị Lan", "Chị Hoa", "pin", "token", "bank", "password", "einvoice"]) {
      expect(s.toLowerCase()).not.toContain(cam.toLowerCase());
    }
  });

  it("giữ đủ để xem: bàn, đơn đang mở, món hủy đánh dấu, tổng hóa đơn, thực đơn", () => {
    expect(b.phien[0]).toMatchObject({ banId: "t1", banPhu: ["t2"], soHd: 12, tongHd: 150000 });
    expect(b.phien[0].don[0].mon).toEqual([
      { ten: "Phở bò", sl: 2, tuyChon: ["Thêm thịt"], ghiChu: "ít hành", huy: false },
      { ten: "Trà đá", sl: 1, tuyChon: [], ghiChu: null, huy: true },
    ]);
    expect(b.khongBan[0]).toMatchObject({ soDon: 8, tong: 45000 });
    expect(b.thucDon).toEqual([{ nhom: "Phở", mon: [{ ten: "Phở bò", gia: 50000, con: true }] }]);
    expect(b.luc).toBe("2026-09-28T05:00:00.000Z");
  });
});

describe("banChupHopLe", () => {
  const b = taoBanChup("pho-viet", SNAP, MENU, new Date());
  it("đọc lại đúng bản cùng phiên bản + cùng quán", () => {
    expect(banChupHopLe(JSON.parse(JSON.stringify(b)), "pho-viet")).toEqual(b);
  });
  it("phiên bản khác / quán khác / hỏng → null (không đọc sai hình dạng)", () => {
    expect(banChupHopLe({ ...b, v: PHIEN_BAN_BAN_CHUP + 1 }, "pho-viet")).toBeNull();
    expect(banChupHopLe(b, "bun-bo")).toBeNull();
    expect(banChupHopLe({ ...b, ban: null }, "pho-viet")).toBeNull();
    expect(banChupHopLe("rác", "pho-viet")).toBeNull();
  });
});
