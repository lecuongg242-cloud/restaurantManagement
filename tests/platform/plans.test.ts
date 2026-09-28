import { describe, it, expect } from "vitest";
import { chonGoi, giaGoiYTheoThang, sapXepGoi, thoiHanChu, type Plan } from "@/lib/platform/plans";

/** Gói do super-admin tự đặt (0061): giá riêng từng gói, không suy từ công thức. */
const G = (id: string, months: number | null, price: number, visible = true): Plan => ({ id, name: id, months, price, visible });
const PLANS = [G("vv", null, 5_500_000), G("2nam", 24, 5_500_000), G("1thang", 1, 350_000), G("1nam", 12, 3_000_000), G("an", 6, 1_800_000, false)];

describe("gói dịch vụ", () => {
  it("sắp: ngắn → dài, vĩnh viễn cuối", () => {
    expect(sapXepGoi(PLANS).map((p) => p.id)).toEqual(["1thang", "an", "1nam", "2nam", "vv"]);
  });

  it("thời hạn đọc được", () => {
    expect([1, 6, 12, 24, 18, null].map(thoiHanChu)).toEqual(["1 tháng", "6 tháng", "1 năm", "2 năm", "18 tháng", "Vĩnh viễn"]);
  });

  it("trang quán: gói 2 năm dùng ĐÚNG giá gói (5.500.000), không phải 2 × giá năm", () => {
    const c = chonGoi(PLANS, "2nam", "2026-10-07", "2026-09-27")!;
    expect(c.plan.price).toBe(5_500_000);
    expect(c.hanMoi).toBe("2028-10-07");
  });

  it("trang quán: id lạ → gói đầu; gói ẩn không chọn được; vĩnh viễn không có hạn mới", () => {
    expect(chonGoi(PLANS, "khong-co", null, "2026-09-27")!.plan.id).toBe("1thang");
    expect(chonGoi(PLANS, "an", null, "2026-09-27")!.plan.id).toBe("1thang");
    expect(chonGoi(PLANS, "vv", null, "2026-09-27")!.hanMoi).toBeNull();
    expect(chonGoi([G("x", 1, 1, false)], undefined, null, "2026-09-27")).toBeNull();
  });

  it("giá gợi ý ở /super: đúng gói nếu có, không thì giá 1 tháng × số tháng", () => {
    expect(giaGoiYTheoThang(PLANS, 24)).toBe(5_500_000);
    expect(giaGoiYTheoThang(PLANS, 3)).toBe(1_050_000);
    expect(giaGoiYTheoThang([G("1nam", 12, 3_000_000)], 3)).toBeNull();
  });
});
