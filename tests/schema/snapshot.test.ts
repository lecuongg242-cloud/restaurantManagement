import { describe, it, expect } from "vitest";
import { soSanh } from "../../scripts/schema-snapshot.mjs";

/** Snapshot là bản đồ mở: mỗi nhóm chứa tên object → định nghĩa đã chuẩn hoá. */
type Snapshot = Record<string, Record<string, string>>;

/**
 * OPS-07 — Logic so sánh snapshot schema.
 *
 * Một cổng chặn chưa từng đỏ là một cổng chưa chứng minh được gì: nó có thể xanh vì schema khớp,
 * mà cũng có thể xanh vì so sai. Ba phép dưới đây là ba loại lệch đã gặp thật ngày 23–24/09/2026.
 */
const nen: Snapshot = {
  view: { bills_revenue: "select id, tenant_id from bills b" },
  ham: { "report_summary(uuid, timestamptz, timestamptz)": "CREATE FUNCTION ... from bills_revenue" },
  policy: { "storage.objects.menu_images_public_read": "r | (bucket_id = 'menu-images') |" },
};

describe("soSanh", () => {
  it("schema y hệt → không lệch", () => {
    expect(soSanh(nen, structuredClone(nen))).toEqual([]);
  });

  it("object THỪA trên DB (đúng ca bills_revenue) → báo tên nó", () => {
    const moi = structuredClone(nen);
    moi.view.drift_canary = "select 1 as x";
    const lech = soSanh(nen, moi);
    expect(lech).toHaveLength(1);
    expect(lech[0]).toContain("drift_canary");
    expect(lech[0]).toContain("THỪA");
  });

  it("THÂN HÀM bị sửa (đúng ca report_summary) → báo, dù tên không đổi", () => {
    const moi = structuredClone(nen);
    moi.ham["report_summary(uuid, timestamptz, timestamptz)"] =
      "CREATE FUNCTION ... from bills";
    const lech = soSanh(nen, moi);
    expect(lech).toHaveLength(1);
    expect(lech[0]).toContain("report_summary");
    expect(lech[0]).toContain("ĐỊNH NGHĨA KHÁC");
  });

  it("object THIẾU trên DB → báo (ai đó xoá tay mà repo vẫn mô tả)", () => {
    const moi = structuredClone(nen);
    delete moi.policy["storage.objects.menu_images_public_read"];
    const lech = soSanh(nen, moi);
    expect(lech).toHaveLength(1);
    expect(lech[0]).toContain("THIẾU");
  });

  it("nhiều lệch cùng lúc → liệt kê đủ, không dừng ở cái đầu", () => {
    const moi = structuredClone(nen);
    moi.view.canary_a = "x";
    moi.view.canary_b = "y";
    moi.ham["report_summary(uuid, timestamptz, timestamptz)"] = "khac";
    expect(soSanh(nen, moi)).toHaveLength(3);
  });

  it("import script KHÔNG khởi động kết nối DB", async () => {
    const mod = await import("../../scripts/schema-snapshot.mjs");
    expect(typeof mod.soSanh).toBe("function");
  });
});
