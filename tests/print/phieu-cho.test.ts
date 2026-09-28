import { describe, it, expect } from "vitest";
import { KHONG_IN_BU_MS, phieuCho } from "@/lib/print/phieu-cho";

/** P17 17-02 (OFFLINE-03): danh sách phiếu chờ khi cầu in mất kết nối — sắp theo giờ, đánh dấu "Không in bù". */
const NOW = Date.parse("2026-09-28T05:00:00Z");
const truoc = (phut: number) => new Date(NOW - phut * 60_000).toISOString();

describe("phieuCho", () => {
  const ds = phieuCho(
    [
      { id: "b", type: "kitchen_ticket", created_at: truoc(5), payload: { kitchenNo: 9, tableName: "Bàn 2", items: [{ name: "Phở bò", qty: 2 }] } },
      { id: "a", type: "kitchen_ticket", created_at: truoc(31), payload: { kitchenNo: 7, tableName: "Mang về", items: [] } },
      { id: "c", type: "receipt", created_at: truoc(29), payload: null },
    ],
    NOW
  );

  it("sắp theo giờ tạo, cũ trước", () => {
    expect(ds.map((p) => p.id)).toEqual(["a", "c", "b"]);
  });

  it("quá 30 phút → Không in bù (khớp MAX_JOB_AGE_MIN của cầu in); dưới 30 phút → sẽ in bù", () => {
    expect(ds.find((p) => p.id === "a")!.khongInBu).toBe(true);
    expect(ds.find((p) => p.id === "c")!.khongInBu).toBe(false);
    expect(KHONG_IN_BU_MS).toBe(30 * 60_000);
  });

  it("đọc số đơn, bàn, món; loại theo type", () => {
    expect(ds.find((p) => p.id === "b")).toMatchObject({ loai: "bep", soDon: 9, noi: "Bàn 2", mon: ["2× Phở bò"] });
    expect(ds.find((p) => p.id === "c")).toMatchObject({ loai: "hoa-don", soDon: null, mon: [] });
  });
});

describe("ngưỡng khớp cầu in", () => {
  it("cầu in bỏ phiếu cũ hơn đúng 30 phút mặc định — đổi một bên phải đổi bên kia", async () => {
    const fs = await import("node:fs");
    const nguon = fs.readFileSync("scripts/print-bridge.mjs", "utf8");
    const m = nguon.match(/MAX_JOB_AGE_MIN \|\| (\d+)\)/);
    expect(Number(m?.[1]) * 60_000).toBe(KHONG_IN_BU_MS);
  });
});
