import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chuanHoa, chuanHoaMayIn, docCauHinh, ghiCauHinh, tuPhanHoiKichHoat, duongDanManHinh, PHIEN_BAN_CAU_HINH } from "../../desktop/lib/cau-hinh.mjs";
import { moiTruongCauIn, chuoiMayQuay, doiTruocKhiChayLai } from "../../desktop/lib/moi-truong.mjs";
import { laTienTrinhCauInCu, mayInTuEnvCu } from "../../desktop/lib/cau-in-cu.mjs";
import { duocCaiBanMoi, YEN_TOI_THIEU_GIAY } from "../../desktop/lib/cap-nhat.mjs";
import { QuanLyCauIn } from "../../desktop/lib/cau-in.mjs";
import { phanLoaiMayIn, giuMayDaLuu } from "../../desktop/lib/may-in-usb.mjs";
import { doiDen } from "./gia-lap";

/** DESK-01/02/05/06/08/10 — phần thuần của app máy quầy (không mở Electron). */

const tam: string[] = [];
afterEach(() => {
  for (const d of tam.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});
function thuMucTam() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "desk-"));
  tam.push(d);
  return d;
}

const phanHoi = {
  slug: "quan-thu",
  tenantName: "Quán Thử",
  email: "print-quan-thu@bridge.local",
  password: "MAT-KHAU-TRAN",
  supabaseUrl: "https://x.supabase.co",
  anonKey: "anon",
};
const maHoa = (s: string) => Buffer.from(`mahoa:${s}`).toString("base64");

describe("cấu hình máy quầy", () => {
  it("kích hoạt có máy in → lưu mật khẩu printer ĐÃ MÃ HÓA, không có mật khẩu trần, không có mật khẩu chủ quán", () => {
    const dir = thuMucTam();
    const tep = path.join(dir, "cau-hinh.json");
    const ch = tuPhanHoiKichHoat(phanHoi, { apiBase: "https://app.test/", coMayIn: true, nhieuChiNhanh: false, maHoa });
    ghiCauHinh(tep, ch!);
    const tho = fs.readFileSync(tep, "utf8");
    expect(tho).not.toContain("MAT-KHAU-TRAN");
    expect(tho).not.toMatch(/owner|matKhauChu|"password"/i);
    const doc = docCauHinh(tep);
    expect(doc).toMatchObject({ slug: "quan-thu", coMayIn: true, manHinh: "pos", apiBase: "https://app.test" });
    expect(doc!.printer!.matKhauMaHoa).toBe(maHoa("MAT-KHAU-TRAN"));
  });

  it("kích hoạt chỉ xem → không có tài khoản printer, mở thẳng Màn bếp", () => {
    const ch = tuPhanHoiKichHoat({ slug: "quan-thu", tenantName: "Q" }, { apiBase: "https://app.test", coMayIn: false, nhieuChiNhanh: true, maHoa })!;
    expect(ch).toMatchObject({ coMayIn: false, printer: null, manHinh: "kds", nhieuChiNhanh: true });
    expect(duongDanManHinh(ch)).toBe("https://app.test/r/quan-thu/kds");
  });

  it("tệp hỏng / khác phiên bản / slug lạ → coi như chưa kích hoạt", () => {
    const dir = thuMucTam();
    const tep = path.join(dir, "cau-hinh.json");
    fs.writeFileSync(tep, "{hỏng");
    expect(docCauHinh(tep)).toBeNull();
    expect(chuanHoa({ phienBan: PHIEN_BAN_CAU_HINH + 1, apiBase: "https://a.test", slug: "q" })).toBeNull();
    expect(chuanHoa({ phienBan: PHIEN_BAN_CAU_HINH, apiBase: "https://a.test", slug: "../x" })).toBeNull();
    expect(docCauHinh(path.join(dir, "khong-co.json"))).toBeNull();
  });

  it("máy in: chặn giá trị lạ đi vào biến môi trường cầu in", () => {
    expect(chuanHoaMayIn({ kieu: "lan", host: "192.168.1.9", port: 9100 })).toEqual({ kieu: "lan", host: "192.168.1.9", port: 9100 });
    expect(chuanHoaMayIn({ kieu: "lan", host: "1.2.3.4 && calc", port: 9100 })).toBeNull();
    expect(chuanHoaMayIn({ kieu: "lan", host: "1.2.3.4", port: 70000 })).toBeNull();
    expect(chuanHoaMayIn({ kieu: "usb", ten: "XP-80C" })).toEqual({ kieu: "usb", ten: "XP-80C" });
    expect(chuanHoaMayIn({ kieu: "usb", ten: 'a"b' })).toBeNull();
    expect(chuanHoaMayIn({ kieu: "bluetooth" })).toBeNull();
  });
});

describe("môi trường cầu in", () => {
  const ch = () => ({
    ...tuPhanHoiKichHoat(phanHoi, { apiBase: "https://app.test", coMayIn: true, nhieuChiNhanh: false, maHoa })!,
    mayIn: {
      bep: { kieu: "lan" as const, host: "192.168.1.50", port: 9100 },
      quay: { kieu: "usb" as const, ten: "XP-80C" },
      kho: "58" as const,
    },
  });

  it("chuyển đúng cấu hình sang biến của print-bridge.mjs, tắt tự thay tệp, báo nguồn app", () => {
    const env = moiTruongCauIn(ch(), { matKhau: "mk", phienBanApp: "1.2.3", moiTruongGoc: { PATH: "C:\\Windows", SystemRoot: "C:\\Windows" } });
    expect(env).toMatchObject({
      ELECTRON_RUN_AS_NODE: "1",
      NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co",
      PRINT_BRIDGE_EMAIL: "print-quan-thu@bridge.local",
      PRINT_BRIDGE_PASSWORD: "mk",
      PRINTER_HOST: "192.168.1.50",
      PRINTER_PORT: "9100",
      PRINTER_CHARS: "32",
      COUNTER_PRINTER: "usb:XP-80C",
      COUNTER_WIDTH: "58",
      POS_URL: "https://app.test/r/quan-thu/pos",
      BRIDGE_AGENT: "app/1.2.3",
      BRIDGE_TU_CAP_NHAT: "0",
      PATH: "C:\\Windows",
    });
  });

  it("PRINT-18: không có máy in bếp riêng + có máy quầy → phiếu bếp ra máy quầy; còn lại không đặt", () => {
    type May = { kieu: "lan"; host: string; port: number } | { kieu: "usb"; ten: string } | null;
    const env = (bep: May, quay: May) =>
      moiTruongCauIn({ ...ch(), mayIn: { bep, quay, kho: "80" as const } }, { matKhau: "mk", phienBanApp: "1" });
    expect(env(null, { kieu: "usb", ten: "XP-80C" })).toMatchObject({ KITCHEN_PRINTER: "counter", COUNTER_PRINTER: "usb:XP-80C" });
    expect(env({ kieu: "lan", host: "192.168.1.50", port: 9100 }, { kieu: "usb", ten: "XP-80C" })).not.toHaveProperty("KITCHEN_PRINTER");
    expect(env(null, null)).not.toHaveProperty("KITCHEN_PRINTER");
  });

  it("không chuyển nguyên môi trường của app (khóa lạ không lọt vào cầu in)", () => {
    const env = moiTruongCauIn(ch(), { matKhau: "mk", phienBanApp: "1", moiTruongGoc: { SUPABASE_SERVICE_ROLE_KEY: "bi-mat", PATH: "p" } });
    expect(env).not.toHaveProperty("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("máy chỉ xem / thiếu mật khẩu → không chạy cầu in", () => {
    const xem = tuPhanHoiKichHoat({ slug: "q", tenantName: "Q" }, { apiBase: "https://a.test", coMayIn: false, nhieuChiNhanh: false, maHoa })!;
    expect(moiTruongCauIn(xem, { matKhau: "mk", phienBanApp: "1" })).toBeNull();
    expect(moiTruongCauIn(ch(), { matKhau: "", phienBanApp: "1" })).toBeNull();
  });

  it("máy in quầy LAN → cú pháp lan:ip:cổng; chưa có → rỗng", () => {
    expect(chuoiMayQuay({ kieu: "lan", host: "10.0.0.5", port: 9100 })).toBe("lan:10.0.0.5:9100");
    expect(chuoiMayQuay(null)).toBe("");
  });

  it("chạy lại sau khi chết: giãn dần, tối đa 60 giây", () => {
    expect([0, 1, 2, 3, 10].map(doiTruocKhiChayLai)).toEqual([1000, 5000, 30_000, 60_000, 60_000]);
  });
});

describe("cầu in cũ", () => {
  it("nhận ra tiến trình cầu in cũ, bỏ qua cầu in của chính app", () => {
    expect(laTienTrinhCauInCu('"C:\\cau-in\\node\\node.exe" C:\\cau-in\\print-bridge.mjs', "C:\\Users\\a\\AppData\\Local\\Programs\\techmenu")).toBe(true);
    expect(laTienTrinhCauInCu("C:\\Users\\a\\AppData\\Local\\Programs\\techmenu\\resources\\cau-in\\print-bridge.mjs", "C:\\Users\\a\\AppData\\Local\\Programs\\techmenu")).toBe(false);
    expect(laTienTrinhCauInCu("node server.js", "")).toBe(false);
  });

  it("đọc máy in từ .env.local cũ, không lấy mật khẩu", () => {
    const env = [
      "PRINT_BRIDGE_PASSWORD=bi-mat",
      "PRINTER_HOST=192.168.1.234",
      "PRINTER_PORT=9100",
      'COUNTER_PRINTER="usb:POS-80C"',
      "COUNTER_WIDTH=80",
    ].join("\r\n");
    const mi = mayInTuEnvCu(env);
    expect(mi).toEqual({ bep: { kieu: "lan", host: "192.168.1.234", port: 9100 }, quay: { kieu: "usb", ten: "POS-80C" }, kho: "80" });
    expect(JSON.stringify(mi)).not.toContain("bi-mat");
  });
});

describe("được cài bản cập nhật chưa", () => {
  it("chưa tải xong → không; đang có người thao tác → không; rảnh ≥ 5 phút hoặc đang tắt app → có", () => {
    expect(duocCaiBanMoi({ daTaiXong: false, giayKhongThaoTac: 9999, dangTatApp: true })).toBe(false);
    expect(duocCaiBanMoi({ daTaiXong: true, giayKhongThaoTac: YEN_TOI_THIEU_GIAY - 1, dangTatApp: false })).toBe(false);
    expect(duocCaiBanMoi({ daTaiXong: true, giayKhongThaoTac: YEN_TOI_THIEU_GIAY, dangTatApp: false })).toBe(true);
    expect(duocCaiBanMoi({ daTaiXong: true, giayKhongThaoTac: 0, dangTatApp: true })).toBe(true);
  });
});

describe("QuanLyCauIn", () => {
  /** "Cầu in" giả: thoát ngay theo mã cho trước, hoặc chạy tới khi nhận tin "thoat". */
  function cauInGia(noiDung: string) {
    const dir = thuMucTam();
    const tep = path.join(dir, "print-bridge.mjs");
    fs.writeFileSync(tep, noiDung);
    return { dir, tep };
  }

  it("chết → tự chạy lại; dừng → gửi 'thoat', tiến trình thoát, không chạy lại", async () => {
    const { dir, tep } = cauInGia(`
      import fs from "node:fs";
      fs.appendFileSync("lan-chay.txt", "x");
      const n = fs.readFileSync("lan-chay.txt", "utf8").length;
      if (n === 1) process.exit(1);
      process.send({ loai: "trang-thai", nhipOk: true, bep: true });
      process.on("message", (m) => { if (m === "thoat") { fs.writeFileSync("da-thoat.txt", "1"); process.exit(0); } });
      setInterval(() => {}, 1000);
    `);
    const trangThai: unknown[] = [];
    const ql = new QuanLyCauIn({
      node: process.execPath,
      tepCauIn: tep,
      thuMucLog: path.join(dir, "logs"),
      taoMoiTruong: () => ({ PATH: process.env.PATH ?? "" }),
      khiTrangThai: (s: unknown) => trangThai.push(s),
    });
    ql.batDau();
    await doiDen(() => trangThai.some((s) => (s as { nhipOk?: boolean }).nhipOk === true), 15_000, "chạy lại sau lần chết đầu");
    await ql.dungLai(5_000);
    expect(fs.existsSync(path.join(dir, "da-thoat.txt"))).toBe(true);
    expect(ql.dangChay).toBe(false);
    await new Promise((r) => setTimeout(r, 1500));
    expect(fs.readFileSync(path.join(dir, "lan-chay.txt"), "utf8")).toHaveLength(2);
    expect(fs.readdirSync(path.join(dir, "logs")).some((f) => /^cau-in-.*\.log$/.test(f))).toBe(true);
  }, 30_000);

  it("mã thoát 3 (máy đã có cầu in khác) → KHÔNG chạy lại, báo cho app", async () => {
    const { dir, tep } = cauInGia(`import fs from "node:fs"; fs.appendFileSync("lan-chay.txt", "x"); process.exit(3);`);
    let coCauInKhac = 0;
    const ql = new QuanLyCauIn({
      node: process.execPath,
      tepCauIn: tep,
      thuMucLog: path.join(dir, "logs"),
      taoMoiTruong: () => ({ PATH: process.env.PATH ?? "" }),
      khiCoCauInKhac: () => coCauInKhac++,
    });
    ql.batDau();
    await doiDen(() => coCauInKhac === 1, 10_000, "báo có cầu in khác");
    await new Promise((r) => setTimeout(r, 2000));
    expect(fs.readFileSync(path.join(dir, "lan-chay.txt"), "utf8")).toHaveLength(1);
  }, 20_000);

  it("không chịu thoát → quá hạn thì dừng hẳn", async () => {
    const { dir, tep } = cauInGia(`process.on("message", () => {}); setInterval(() => {}, 1000);`);
    const ql = new QuanLyCauIn({ node: process.execPath, tepCauIn: tep, thuMucLog: path.join(dir, "logs"), taoMoiTruong: () => ({}) });
    ql.batDau();
    await new Promise((r) => setTimeout(r, 500));
    const t0 = Date.now();
    await ql.dungLai(1_000);
    expect(ql.dangChay).toBe(false);
    expect(Date.now() - t0).toBeLessThan(5_000);
  }, 20_000);

  it("máy chỉ xem (môi trường null) → không chạy gì", () => {
    const ql = new QuanLyCauIn({ node: process.execPath, tepCauIn: "khong-co.mjs", thuMucLog: os.tmpdir(), taoMoiTruong: () => null });
    ql.batDau();
    expect(ql.dangChay).toBe(false);
  });
});

describe("danh sách máy in USB (P33 DESK-14)", () => {
  const windows = [
    { ten: "OneNote", cong: "Microsoft.Office.OneNote_16001_x64__8wekyb3d8bbwe_microsoft.onenoteim_S-1-5-21" },
    { ten: "Microsoft XPS Document Writer", cong: "PORTPROMPT:" },
    { ten: "Microsoft Print to PDF", cong: "PORTPROMPT:" },
    { ten: "Fax", cong: "SHRFAX:" },
    { ten: "XP-58 cũ", cong: "USB001" },
    { ten: "Canon TS6300 series", cong: "WSD-6c8969c2" },
    { ten: "XP-80C", cong: "USB002" },
  ];

  it("ẩn máy in ảo, máy USB đang kết nối lên đầu, máy rút ghi chưa kết nối, máy khác không ghi trạng thái", () => {
    expect(phanLoaiMayIn(windows, ["usb002"])).toEqual([
      { ten: "XP-80C", nhan: "XP-80C — đang kết nối (USB002)", ketNoi: true },
      { ten: "XP-58 cũ", nhan: "XP-58 cũ — chưa kết nối", ketNoi: false },
      { ten: "Canon TS6300 series", nhan: "Canon TS6300 series", ketNoi: null },
    ]);
  });

  it("không đọc được cổng (null) → chỉ ẩn máy ảo, không đoán trạng thái", () => {
    expect(phanLoaiMayIn(windows, null).map((d) => [d.nhan, d.ketNoi])).toEqual([
      ["XP-58 cũ", null],
      ["Canon TS6300 series", null],
      ["XP-80C", null],
    ]);
  });

  it("chỉ có máy ảo → danh sách trống", () => {
    expect(phanLoaiMayIn(windows.slice(0, 4), [])).toEqual([]);
  });

  it("máy đã lưu Windows không còn thấy → vẫn giữ, ghi chưa kết nối; đã có thì không thêm trùng", () => {
    const ds = phanLoaiMayIn(windows, []);
    expect(giuMayDaLuu(ds, "XP-80 đã gỡ").at(-1)).toEqual({ ten: "XP-80 đã gỡ", nhan: "XP-80 đã gỡ — chưa kết nối", ketNoi: false });
    expect(giuMayDaLuu(ds, "XP-80C")).toBe(ds);
    expect(giuMayDaLuu(ds, null)).toBe(ds);
  });
});
