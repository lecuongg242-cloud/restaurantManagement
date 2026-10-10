import { describe, it, expect } from "vitest";
import fs from "node:fs";
import {
  buildKitchenTicket,
  buildCancelTicket,
  giayPhieuBep,
  mayChoNoi,
  docMayNoi,
  soLien,
  dichInCua,
} from "../../scripts/print-bridge.mjs";
import { normalizeStations, splitByStation, stationFor, targetOf, DEFAULT_TARGET } from "@/lib/print/stations";
import { toState } from "@/lib/print/trang-thai";

/** Số lệnh cắt giấy GS V 66 0 trong buffer = số tờ. */
function soTo(buf: Buffer): number {
  let n = 0;
  for (let i = 0; i + 3 < buf.length; i++) {
    if (buf[i] === 0x1d && buf[i + 1] === 0x56 && buf[i + 2] === 0x42 && buf[i + 3] === 0x00) n++;
  }
  return n;
}

const phieu = JSON.parse(fs.readFileSync("android/app/src/test/resources/phieu-bep.json", "utf8"));

describe("P37 phiếu bếp (PRINT-20/22)", () => {
  it("không có tên bếp/bar → giống TỪNG BYTE phiếu cũ (file mẫu Android khổ 80)", () => {
    const vang = fs.readFileSync("android/app/src/test/resources/phieu-bep-48.hex", "utf8").replace(/\s+/g, "");
    expect(buildKitchenTicket(phieu).toString("hex")).toBe(vang);
    expect(giayPhieuBep(phieu).toString("hex")).toBe(vang);
  });

  it("có tên bếp/bar → in hoa, to, đầu phiếu", () => {
    const s = buildKitchenTicket({ ...phieu, stationName: "Quầy pha chế" }).toString("latin1");
    expect(s).toContain("QUAY PHA CHE");
    expect(s.indexOf("QUAY PHA CHE")).toBeLessThan(s.indexOf("PHIEU BEP"));
  });

  it("số liên N → N tờ; in riêng từng món → mỗi món một tờ × số liên", () => {
    const n = phieu.items.length;
    expect(n).toBeGreaterThan(1);
    expect(soTo(giayPhieuBep({ ...phieu, copies: 2 }))).toBe(2);
    expect(soTo(giayPhieuBep({ ...phieu, perItem: true }))).toBe(n);
    expect(soTo(giayPhieuBep({ ...phieu, perItem: true, copies: 3 }))).toBe(n * 3);
    // mỗi tờ in riêng chỉ có đúng một món: tách theo lệnh cắt, mỗi tờ đúng một dòng "<tên> … x<sl>"
    const to = giayPhieuBep({ ...phieu, perItem: true }).toString("latin1").split("\x1dVB\x00").filter((t) => t.includes("PHIEU BEP"));
    expect(to).toHaveLength(n);
    for (const [i, t] of to.entries()) {
      expect(t.match(/ x\d+\n/g)).toHaveLength(1);
      expect(t).toContain(` x${phieu.items[i].qty}\n`);
    }
  });

  it("số liên chặn 1–3", () => {
    expect([soLien(undefined), soLien(0), soLien("2"), soLien(9)]).toEqual([1, 1, 2, 3]);
  });
});

describe("P37 phiếu hủy món (PRINT-23)", () => {
  const huy = {
    orderId: "o1",
    kitchenNo: 12,
    tableName: "B3",
    ticketNo: "ABC123",
    cancelledAt: "2026-10-10T05:00:00Z",
    reason: "Khách đổi ý",
    cancelledBy: "Thu ngân Lan",
    stationName: "Quầy pha chế",
    copies: 2,
    items: [{ name: "Trà đào", qty: 2, modifiers: ["Ít đá"], note: null }],
  };
  it("có HUY MON, đơn, bàn, món + SL, lý do, người hủy; đúng số liên", () => {
    const b = buildCancelTicket(huy);
    const s = b.toString("latin1");
    for (const t of ["HUY MON", "DON #12", "Ban: B3", "HUY 2x Tra dao", "Ly do: Khach doi y", "Nguoi huy: Thu ngan Lan", "QUAY PHA CHE"]) {
      expect(s).toContain(t);
    }
    expect(soTo(b)).toBe(2);
  });
  it("phiếu hủy đi đường máy in bếp", () => {
    expect(dichInCua("cancel_ticket", false)).toBe("bep");
    expect(dichInCua("kitchen_ticket", true)).toBe("bep");
  });
});

describe("P37 chọn máy in theo bếp/bar (PRINT-21)", () => {
  const bep = { kieu: "lan", host: "10.0.0.1", port: 9100 };
  const quay = { kieu: "usb", ten: "XP-80C" };
  const bar = { kieu: "lan", host: "10.0.0.9", port: 9100 };
  it("Bếp chính / thiếu target → máy bếp", () => {
    expect(mayChoNoi("kitchen", { noi: {}, quay, bep })).toBe(bep);
    expect(mayChoNoi(null, { noi: {}, quay, bep })).toBe(bep);
  });
  it("bếp/bar có máy riêng → máy đó; chưa cài → máy quầy; không có máy quầy → máy bếp", () => {
    expect(mayChoNoi("s1", { noi: { s1: bar }, quay, bep })).toBe(bar);
    expect(mayChoNoi("s2", { noi: { s1: bar }, quay, bep })).toBe(quay);
    expect(mayChoNoi("s2", { noi: {}, quay: null, bep })).toBe(bep);
  });
  it("KITCHEN_STATIONS: chỉ nhận LAN hợp lệ, JSON hỏng → rỗng", () => {
    expect(docMayNoi('{"a":"lan:10.0.0.9:9100","b":"usb:X","c":"rac"}')).toEqual({ a: bar });
    expect(docMayNoi("{hỏng")).toEqual({});
    expect(docMayNoi(undefined)).toEqual({});
  });
});

describe("P37 chia món theo bếp/bar (PRINT-20)", () => {
  const rows = [
    { id: "bar", name: "Quầy pha chế", is_default: false, copies: 2, per_item: false },
    { id: "def", name: "Bếp nóng", is_default: true, copies: 1, per_item: true },
  ];
  it("Bếp chính đứng đầu; quán chưa lưu → Bếp chính ngầm", () => {
    expect(normalizeStations(rows).map((s) => s.id)).toEqual(["def", "bar"]);
    expect(normalizeStations([])).toEqual([{ id: "", name: "Bếp chính", isDefault: true, copies: 1, perItem: false }]);
  });
  it("món theo nhóm; nhóm chưa gán / nơi đã xóa → Bếp chính; giữ thứ tự món", () => {
    const st = normalizeStations(rows);
    const items = [
      { n: "Phở", stationId: null },
      { n: "Trà", stationId: "bar" },
      { n: "Cơm", stationId: "da-xoa" },
      { n: "Cà phê", stationId: "bar" },
    ];
    const g = splitByStation(items, st);
    expect(g.map((x) => [targetOf(x.station), x.items.map((i) => i.n)])).toEqual([
      [DEFAULT_TARGET, ["Phở", "Cơm"]],
      ["bar", ["Trà", "Cà phê"]],
    ]);
    expect(stationFor("def", st).isDefault).toBe(true);
  });
  it("đơn chỉ có đồ uống → chỉ một phiếu cho quầy pha chế", () => {
    const g = splitByStation([{ stationId: "bar" }], normalizeStations(rows));
    expect(g.map((x) => x.station.id)).toEqual(["bar"]);
  });
});

describe("P37 trạng thái in gộp lượt tách bếp/bar", () => {
  const at = "2026-10-10T05:00:00.000Z";
  const now = Date.parse(at) + 10_000;
  it("hai phiếu cùng lượt đã in → 1 lần in", () => {
    const s = toState(
      [
        { type: "kitchen_ticket", status: "printed", created_at: at, printed_at: "2026-10-10T05:00:03Z" },
        { type: "kitchen_ticket", status: "printed", created_at: at, printed_at: "2026-10-10T05:00:05Z" },
      ],
      now
    );
    expect(s).toMatchObject({ status: "printed", count: 1, at: "2026-10-10T05:00:05Z" });
  });
  it("một phiếu hỏng → cả lượt hỏng; một phiếu chờ → lượt chờ", () => {
    const base = { type: "kitchen_ticket", created_at: at, printed_at: null };
    expect(toState([{ ...base, status: "printed" }, { ...base, status: "failed" }], now).status).toBe("failed");
    expect(toState([{ ...base, status: "pending" }, { ...base, status: "printed" }], now).status).toBe("pending");
  });
});
