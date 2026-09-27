import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  nenCapNhat,
  khopSha,
  BRIDGE_VERSION,
  MA_THOAT_DA_CAP_NHAT,
  MA_THOAT_DA_CHAY,
} from "../../scripts/print-bridge.mjs";
import { docPhienBan, docBanPhatHanh } from "@/lib/print/bridge-release";

/**
 * PRINT-12 — cầu in tự cập nhật (QD-019 D8). Sửa cầu in một lần là mọi quán tự lên bản mới, không
 * phải tới từng quán. Đổi lại: một bản cập nhật hỏng cũng tới mọi quán cùng lúc — nên phải kiểm SHA,
 * không cập nhật giữa lúc in, và có đường quay về bản cũ.
 */
describe("nenCapNhat", () => {
  it("bản mới hơn + đang rảnh → cập nhật", () => {
    expect(nenCapNhat({ hienTai: 2, moiNhat: 3, dangIn: false })).toBe(true);
  });

  it("đang in → KHÔNG (thoát giữa chừng là mất phiếu đang gửi)", () => {
    expect(nenCapNhat({ hienTai: 2, moiNhat: 3, dangIn: true })).toBe(false);
  });

  it("bằng hoặc thấp hơn → không", () => {
    expect(nenCapNhat({ hienTai: 3, moiNhat: 3, dangIn: false })).toBe(false);
    expect(nenCapNhat({ hienTai: 3, moiNhat: 2, dangIn: false })).toBe(false);
  });

  it("phản hồi rác từ server → không", () => {
    for (const moiNhat of [null, undefined, "3", 2.5, NaN]) {
      expect(nenCapNhat({ hienTai: 2, moiNhat: moiNhat as number, dangIn: false })).toBe(false);
    }
  });
});

describe("khopSha", () => {
  const noiDung = Buffer.from("console.log('cau in')\n");
  const sha = crypto.createHash("sha256").update(noiDung).digest("hex");

  it("khớp → nhận (không phân biệt hoa/thường)", () => {
    expect(khopSha(noiDung, sha)).toBe(true);
    expect(khopSha(noiDung, sha.toUpperCase())).toBe(true);
  });

  it("lệch 1 byte → từ chối", () => {
    const hong = Buffer.from(noiDung);
    hong[0] ^= 1;
    expect(khopSha(hong, sha)).toBe(false);
  });

  it("thiếu SHA → từ chối", () => {
    expect(khopSha(noiDung, "")).toBe(false);
    expect(khopSha(noiDung, undefined as unknown as string)).toBe(false);
  });
});

describe("mã thoát", () => {
  it("'đã cập nhật' khác 'đã có cầu in chạy' — bat xử lý hai việc ngược nhau", () => {
    expect(MA_THOAT_DA_CAP_NHAT).not.toBe(MA_THOAT_DA_CHAY);
    expect(MA_THOAT_DA_CAP_NHAT).not.toBe(0);
    expect(MA_THOAT_DA_CAP_NHAT).not.toBe(1);
  });
});

describe("bản phát hành phía server", () => {
  it("đọc phiên bản từ nội dung tệp", () => {
    expect(docPhienBan("x\nexport const BRIDGE_VERSION = 7;\ny")).toBe(7);
    expect(docPhienBan("không có hằng")).toBeNull();
  });

  it("server công bố ĐÚNG phiên bản + SHA của scripts/print-bridge.mjs (một nguồn duy nhất)", () => {
    const tep = fs.readFileSync(path.join(__dirname, "../../scripts/print-bridge.mjs"));
    const ban = docBanPhatHanh();
    expect(ban.version).toBe(BRIDGE_VERSION);
    expect(Number.isInteger(ban.version)).toBe(true);
    expect(ban.sha256).toBe(crypto.createHash("sha256").update(tep).digest("hex"));
    expect(khopSha(ban.noiDung, ban.sha256)).toBe(true);
  });
});

describe("route công bố bản phát hành", () => {
  it("/api/bridge/latest → phiên bản + SHA + đường tải; tải về khớp SHA", async () => {
    const { GET } = await import("@/app/api/bridge/latest/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const ban = await res.json();
    expect(ban).toMatchObject({ version: BRIDGE_VERSION, url: "/api/bridge/latest/file" });

    const { GET: taiVe } = await import("@/app/api/bridge/latest/file/route");
    const tep = await taiVe();
    expect(tep.headers.get("content-type")).toMatch(/javascript/);
    expect(khopSha(Buffer.from(await tep.arrayBuffer()), ban.sha256)).toBe(true);
  });
});
