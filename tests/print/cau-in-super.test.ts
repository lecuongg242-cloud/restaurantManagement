import { describe, it, expect } from "vitest";
import { hangCauIn } from "@/lib/print/cau-in-super";

/**
 * PRINT-13 — bảng cầu in mọi quán ở /super. Một dòng mỗi quán: chế độ in · cầu in sống/chết ·
 * máy in · phiên bản (đánh dấu bản cũ). Dùng lại logic sống/chết của màn "Máy in" (09-05) — không
 * viết lại, để hai màn không bao giờ nói hai điều khác nhau.
 */
const NOW = Date.parse("2026-09-27T03:00:00Z");
const vuaXong = new Date(NOW - 20_000).toISOString();
const lau = new Date(NOW - 30 * 60_000).toISOString();

describe("hangCauIn", () => {
  it("quán in trình duyệt, chưa có cầu in", () => {
    expect(hangCauIn({ printMode: "browser", nhip: null, banMoiNhat: 3, now: NOW })).toEqual({
      printMode: "browser",
      cauIn: "chua-co",
      mayIn: "khong-biet",
      version: null,
      banCu: false,
      canChuY: false,
    });
  });

  it("cầu in sống, đúng bản mới nhất, máy in phản hồi → không cần chú ý", () => {
    const r = hangCauIn({
      printMode: "bridge",
      nhip: { seen_at: vuaXong, printer_ok: true, printer_checked_at: vuaXong, version: 3 },
      banMoiNhat: 3,
      now: NOW,
    });
    expect(r).toMatchObject({ cauIn: "song", mayIn: "ok", version: 3, banCu: false, canChuY: false });
  });

  it("bản cũ → đánh dấu; cầu in bản trước 11-06 (không báo phiên bản) cũng là bản cũ", () => {
    const cu = hangCauIn({
      printMode: "bridge",
      nhip: { seen_at: vuaXong, printer_ok: true, printer_checked_at: vuaXong, version: 2 },
      banMoiNhat: 3,
      now: NOW,
    });
    expect(cu.banCu).toBe(true);
    const khongBao = hangCauIn({
      printMode: "bridge",
      nhip: { seen_at: vuaXong, printer_ok: true, printer_checked_at: vuaXong, version: null },
      banMoiNhat: 3,
      now: NOW,
    });
    expect(khongBao.banCu).toBe(true);
  });

  it("quán dùng cầu in mà cầu in chết / máy in lỗi → cần chú ý", () => {
    expect(
      hangCauIn({
        printMode: "bridge",
        nhip: { seen_at: lau, printer_ok: true, printer_checked_at: lau, version: 3 },
        banMoiNhat: 3,
        now: NOW,
      }).canChuY
    ).toBe(true);
    expect(
      hangCauIn({
        printMode: "bridge",
        nhip: { seen_at: vuaXong, printer_ok: false, printer_checked_at: vuaXong, version: 3 },
        banMoiNhat: 3,
        now: NOW,
      }).canChuY
    ).toBe(true);
  });

  it("quán in trình duyệt còn sót cầu in chết từ trước → KHÔNG báo động (không dùng tới)", () => {
    expect(
      hangCauIn({
        printMode: "browser",
        nhip: { seen_at: lau, printer_ok: null, printer_checked_at: null, version: 1 },
        banMoiNhat: 3,
        now: NOW,
      }).canChuY
    ).toBe(false);
  });
});
