import { describe, it, expect, afterEach } from "vitest";
import { mayChuGia } from "./gia-lap";
import { taiDanhSachNoi, chuanHoaDanhSachNoi } from "../../desktop/lib/noi-in.mjs";
import { chuanHoa, PHIEN_BAN_CAU_HINH } from "../../desktop/lib/cau-hinh.mjs";
import { moiTruongCauIn } from "../../desktop/lib/moi-truong.mjs";

/**
 * P37 (PRINT-21/22) — app Windows: đọc bếp/bar từ web, lưu máy riêng từng nơi + số liên hóa đơn. Cầu in thật đưa phiếu ra
 * đúng máy: xem `cau-in-app.test.ts` (chung tệp vì khóa một phiên của cầu in).
 */
const S1 = "aaaaaaaa-0000-4000-8000-000000000001";
const S2 = "aaaaaaaa-0000-4000-8000-000000000002";

let donDep: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const d of donDep) await d();
  donDep = [];
});

describe("P37 danh sách bếp/bar + cấu hình app", () => {
  it("đọc bếp/bar bằng tài khoản printer; Bếp chính đứng đầu", async () => {
    const may = await mayChuGia({
      noi: [
        { id: S1, name: "Quầy pha chế", is_default: false },
        { id: "bbbbbbbb-0000-4000-8000-000000000000", name: "Bếp nóng", is_default: true },
      ],
    });
    donDep.push(may.dong);
    const ds = await taiDanhSachNoi({ supabaseUrl: may.url, anonKey: "anon", email: "p@x", matKhau: "mk" });
    expect(ds).toEqual([
      { id: "", ten: "Bếp nóng", macDinh: true },
      { id: S1, ten: "Quầy pha chế", macDinh: false },
    ]);
  });

  it("quán chưa lưu bếp/bar → chỉ Bếp chính ngầm", () => {
    expect(chuanHoaDanhSachNoi([])).toEqual([{ id: "", ten: "Bếp chính", macDinh: true }]);
  });

  const goc = {
    phienBan: PHIEN_BAN_CAU_HINH,
    apiBase: "https://techmenu.vn",
    slug: "quan-thu",
    tenantName: "Quán Thử",
    coMayIn: true,
    printer: { email: "p@x", matKhauMaHoa: "abc", supabaseUrl: "https://s.supabase.co", anonKey: "anon" },
  };

  it("cấu hình: chỉ giữ máy LAN theo id uuid; số liên 1–3; tệp cũ → {} / 1", () => {
    const c = chuanHoa({
      ...goc,
      mayIn: {
        bep: null,
        quay: { kieu: "usb", ten: "XP-80C" },
        kho: "80",
        noi: {
          [S1]: { kieu: "lan", host: "192.168.1.90", port: 9100 },
          "khong-phai-uuid": { kieu: "lan", host: "1.1.1.1", port: 9100 },
          [S2]: { kieu: "usb", ten: "X" },
        },
        lienHoaDon: 2,
      },
    })!;
    expect(c.mayIn.noi).toEqual({ [S1]: { kieu: "lan", host: "192.168.1.90", port: 9100 } });
    expect(c.mayIn.lienHoaDon).toBe(2);
    const cu = chuanHoa({ ...goc, mayIn: { bep: null, quay: null, kho: "80" } })!;
    expect(cu.mayIn).toMatchObject({ noi: {}, lienHoaDon: 1 });
    expect(chuanHoa({ ...goc, mayIn: { lienHoaDon: 9 } })!.mayIn.lienHoaDon).toBe(1);
  });

  it("biến môi trường cầu in: KITCHEN_STATIONS + COUNTER_COPIES; không cài gì → không có hai biến", () => {
    const c = chuanHoa({
      ...goc,
      mayIn: {
        bep: null,
        quay: { kieu: "usb", ten: "XP-80C" },
        kho: "80",
        noi: { [S1]: { kieu: "lan", host: "192.168.1.90", port: 9100 } },
        lienHoaDon: 3,
      },
    })!;
    const env = moiTruongCauIn(c, { matKhau: "mk", phienBanApp: "1.0.6" })!;
    expect(JSON.parse(env.KITCHEN_STATIONS)).toEqual({ [S1]: "lan:192.168.1.90:9100" });
    expect(env.COUNTER_COPIES).toBe("3");
    expect(env.KITCHEN_PRINTER).toBe("counter");
    const tron = moiTruongCauIn(chuanHoa({ ...goc, mayIn: {} })!, { matKhau: "mk", phienBanApp: "1.0.6" })!;
    expect("KITCHEN_STATIONS" in tron || "COUNTER_COPIES" in tron).toBe(false);
  });
});
