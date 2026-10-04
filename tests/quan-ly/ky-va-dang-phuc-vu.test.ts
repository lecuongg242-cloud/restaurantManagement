import { describe, it, expect } from "vitest";
import { docKy, KY, kyQueryBaoCao } from "@/lib/quan-ly/ky";
import { tomTatDangPhucVu } from "@/lib/quan-ly/dang-phuc-vu";
import { resolveRange } from "@/lib/billing/report-range";

/** MGR-02 (P30): kỳ của app Quản lý = đúng kỳ của báo cáo admin (cùng `resolveRange`) ⇒ số khớp. */
describe("docKy", () => {
  const now = new Date("2026-10-04T05:00:00Z"); // 12:00 giờ VN

  it("5 kỳ theo thứ tự chốt (B4)", () => {
    expect(KY.map((k) => k.chu)).toEqual(["Hôm nay", "Hôm qua", "7 ngày qua", "Tháng này", "Tháng trước"]);
  });

  it("mặc định / mã lạ → Hôm nay", () => {
    expect(docKy(undefined).ma).toBe("hom-nay");
    expect(docKy("xyz").ma).toBe("hom-nay");
  });

  it.each([
    ["hom-nay", "2026-10-04", "2026-10-04"],
    ["hom-qua", "2026-10-03", "2026-10-03"],
    ["7-ngay", "2026-09-28", "2026-10-04"],
    ["thang-nay", "2026-10-01", "2026-10-04"],
    ["thang-truoc", "2026-09-01", "2026-09-30"],
  ])("%s → %s…%s (giờ VN)", (ma, tu, den) => {
    const r = resolveRange(docKy(ma).input, now);
    expect([r.fromDay, r.toDay]).toEqual([tu, den]);
  });

  it("kyQueryBaoCao → query của trang báo cáo admin cùng kỳ", () => {
    expect(kyQueryBaoCao(docKy("hom-qua"))).toBe("preset=today&offset=-1");
    expect(kyQueryBaoCao(docKy("7-ngay"))).toBe("preset=7d");
  });
});

/** B5 "Đang phục vụ": cùng cách cộng tạm tính với sơ đồ bàn POS (bỏ món hủy, tiền nhóm bàn tính ở bàn chính). */
describe("tomTatDangPhucVu", () => {
  const tables = [
    { id: "t1", name: "A1" },
    { id: "t2", name: "A2" },
    { id: "t3", name: "A3" },
    { id: "t4", name: "A4" },
  ];
  const it1 = (unit_price: number, qty: number, status = "served") => ({ unit_price, qty, status });

  it("bàn có khách gồm cả bàn ghép; tạm tính bỏ món hủy; sắp theo giờ vào", () => {
    const kq = tomTatDangPhucVu({
      tables,
      sessions: [
        { tableId: "t2", memberTableIds: [], opened_at: "2026-10-04T05:30:00Z", orders: [{ items: [it1(50000, 2)] }] },
        {
          tableId: "t1",
          memberTableIds: ["t3"],
          opened_at: "2026-10-04T04:00:00Z",
          orders: [{ items: [it1(100000, 1), it1(30000, 3, "cancelled")] }, { items: [it1(20000, 1)] }],
        },
      ],
    });
    expect(kq.soBanCoKhach).toBe(3);
    expect(kq.tongBan).toBe(4);
    expect(kq.tamTinh).toBe(220000);
    expect(kq.ds).toEqual([
      { ban: "A1 +1", gioVao: "2026-10-04T04:00:00Z", tamTinh: 120000 },
      { ban: "A2", gioVao: "2026-10-04T05:30:00Z", tamTinh: 100000 },
    ]);
  });

  it("không có phiên → 0", () => {
    expect(tomTatDangPhucVu({ tables, sessions: [] })).toEqual({ soBanCoKhach: 0, tongBan: 4, tamTinh: 0, ds: [] });
  });
});

describe("định dạng giờ VN", () => {
  it("UTC 16:42 ngày 3/10 → 23:42 · 03/10 23:42", async () => {
    const { gioVn, ngayGioVn } = await import("@/lib/quan-ly/dinh-dang");
    expect(gioVn("2026-10-03T16:42:00Z")).toBe("23:42");
    expect(ngayGioVn("2026-10-03T16:42:00Z")).toBe("03/10 23:42");
    expect(ngayGioVn("2026-10-03T17:05:00Z")).toBe("04/10 00:05");
    expect(gioVn(null)).toBe("—");
  });
});
