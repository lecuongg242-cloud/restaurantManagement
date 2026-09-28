import { describe, it, expect } from "vitest";
import { dangMoCua } from "@/lib/brand/open-hours";
import { parseSettings } from "@/lib/tenant/settings";

/** P15 15-05 — nhãn mở/đóng theo giờ VN, test chạy dưới TZ=UTC. */
const vn = (hhmm: string) => new Date(`2026-09-27T${hhmm}:00+07:00`);

describe("dangMoCua", () => {
  it("06:00–22:00: 21:59 VN mở, 22:01 VN đóng, 05:59 đóng", () => {
    expect(dangMoCua("06:00", "22:00", vn("21:59"))).toBe(true);
    expect(dangMoCua("06:00", "22:00", vn("22:01"))).toBe(false);
    expect(dangMoCua("06:00", "22:00", vn("05:59"))).toBe(false);
  });
  it("qua nửa đêm 17:00–02:00: 23:30 và 01:30 mở, 03:00 đóng", () => {
    expect(dangMoCua("17:00", "02:00", vn("23:30"))).toBe(true);
    expect(dangMoCua("17:00", "02:00", vn("01:30"))).toBe(true);
    expect(dangMoCua("17:00", "02:00", vn("03:00"))).toBe(false);
  });
  it("thiếu giờ → null (không hiện nhãn)", () => {
    expect(dangMoCua("", "22:00")).toBeNull();
  });
});

describe("parseSettings — thông tin chi nhánh", () => {
  it("chuẩn hóa giờ, bỏ giờ sai", () => {
    const s = parseSettings({ open_time: "7:05", close_time: "25:00", address: "  12 Lê Lợi ", phone: "0909" });
    expect(s).toMatchObject({ open_time: "07:05", close_time: "", address: "12 Lê Lợi", phone: "0909" });
  });
});
