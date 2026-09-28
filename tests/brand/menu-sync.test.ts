import { describe, it, expect } from "vitest";
import { khongConThayDoi, planMenuSync, type MenuSnapshot, type SnapItem } from "@/lib/brand/menu-sync";

/** P15 15-03 — mỗi dòng của bảng "Quy tắc đồng bộ" trong 15-03-PLAN là một test. */
const cat = (id: string, name: string, source_id: string | null = null, active = true) => ({ id, name, sort_order: 0, active, source_id });
const item = (id: string, name: string, category_id: string, base_price: number, extra: Partial<SnapItem> = {}): SnapItem => ({
  id, name, category_id, base_price, description: null, image_url: null, sort_order: 0, active: true, is_available: true,
  price_locked: false, source_id: null, ...extra,
});
const snap = (p: Partial<MenuSnapshot>): MenuSnapshot => ({ categories: [], items: [], groups: [], options: [], links: [], ...p });

const ROOT = snap({
  categories: [cat("rc1", "Phở")],
  items: [item("ri1", "Phở bò", "rc1", 50000), item("ri2", "Phở gà", "rc1", 45000)],
  groups: [{ id: "rg1", name: "Size", min_select: 0, max_select: 1, required: false, sort_order: 0, source_id: null }],
  options: [{ id: "ro1", group_id: "rg1", name: "Lớn", price_delta: 10000, sort_order: 0, is_available: true, source_id: null }],
  links: [{ item_id: "ri1", group_id: "rg1", sort_order: 0 }],
});
// Chi nhánh đã đồng bộ một lần, khớp gốc hoàn toàn.
const KHOP = snap({
  categories: [cat("bc1", "Phở", "rc1")],
  items: [item("bi1", "Phở bò", "bc1", 50000, { source_id: "ri1" }), item("bi2", "Phở gà", "bc1", 45000, { source_id: "ri2" })],
  groups: [{ id: "bg1", name: "Size", min_select: 0, max_select: 1, required: false, sort_order: 0, source_id: "rg1" }],
  options: [{ id: "bo1", group_id: "bg1", name: "Lớn", price_delta: 10000, sort_order: 0, is_available: true, source_id: "ro1" }],
  links: [{ item_id: "bi1", group_id: "bg1", sort_order: 0 }],
});

describe("planMenuSync — quy tắc đồng bộ", () => {
  it("chi nhánh trống → thêm đủ nhóm, món, nhóm tùy chọn, tùy chọn, gắn nhóm", () => {
    const p = planMenuSync(ROOT, snap({}));
    expect(p.them.map((d) => d.loai).sort()).toEqual(["category", "group", "item", "item", "link", "option"].sort());
    expect(p.sua).toEqual([]);
    expect(p.an).toEqual([]);
  });

  it("đã khớp → không còn gì (đồng bộ lần hai không đổi gì)", () => {
    expect(khongConThayDoi(planMenuSync(ROOT, KHOP))).toBe(true);
  });

  it("tên / mô tả / ảnh / thứ tự đổi ở gốc → ghi đè", () => {
    const root = { ...ROOT, items: [item("ri1", "Phở bò tái", "rc1", 50000, { image_url: "a.png", sort_order: 3 }), ROOT.items[1]] };
    const p = planMenuSync(root, KHOP);
    expect(p.sua).toHaveLength(1);
    expect(p.sua[0].chiTiet).toMatch(/tên.*ảnh.*thứ tự/);
  });

  it("giá đổi ở gốc → ghi đè khi chi nhánh CHƯA khóa giá", () => {
    const root = { ...ROOT, items: [item("ri1", "Phở bò", "rc1", 55000), ROOT.items[1]] };
    expect(planMenuSync(root, KHOP).sua[0].chiTiet).toContain("giá 50000 → 55000");
  });

  it("giá đổi ở gốc → KHÔNG ghi đè khi chi nhánh đã khóa giá (tự sửa giá riêng)", () => {
    const root = { ...ROOT, items: [item("ri1", "Phở bò", "rc1", 55000), ROOT.items[1]] };
    const cn = { ...KHOP, items: [{ ...KHOP.items[0], base_price: 60000, price_locked: true }, KHOP.items[1]] };
    expect(khongConThayDoi(planMenuSync(root, cn))).toBe(true);
  });

  it("hết món ở chi nhánh → không đụng", () => {
    const cn = { ...KHOP, items: [{ ...KHOP.items[0], is_available: false }, KHOP.items[1]] };
    expect(khongConThayDoi(planMenuSync(ROOT, cn))).toBe(true);
  });

  it("món bị xóa ở gốc → ẩn ở chi nhánh (không xóa)", () => {
    const root = { ...ROOT, items: [ROOT.items[0]] };
    const p = planMenuSync(root, KHOP);
    expect(p.an).toEqual([{ loai: "item", ten: "Phở gà" }]);
  });

  it("món ẩn ở gốc → ẩn ở chi nhánh", () => {
    const root = { ...ROOT, items: [ROOT.items[0], { ...ROOT.items[1], active: false }] };
    expect(planMenuSync(root, KHOP).sua[0].chiTiet).toContain("ẩn theo gốc");
  });

  it("món chỉ có ở chi nhánh (không nối gốc) → không đụng", () => {
    const cn = { ...KHOP, items: [...KHOP.items, item("bi9", "Món riêng quận 3", "bc1", 30000)] };
    const p = planMenuSync(ROOT, cn);
    expect(khongConThayDoi(p)).toBe(true);
    expect(p.goiYNoi).toEqual([]);
  });

  it("lần đầu, chi nhánh có sẵn món cùng tên + cùng nhóm → gợi ý nối; xác nhận thì không thêm bản trùng", () => {
    const cn = snap({ categories: [cat("bc1", "phở ")], items: [item("bi1", "Phở Bò", "bc1", 48000)] });
    const p = planMenuSync(ROOT, cn);
    expect(p.goiYNoi).toEqual(
      expect.arrayContaining([
        { kind: "category", branchId: "bc1", rootId: "rc1", ten: "phở " },
        { kind: "item", branchId: "bi1", rootId: "ri1", ten: "Phở Bò" },
      ])
    );
    const daNoi = planMenuSync(ROOT, cn, p.goiYNoi);
    expect(daNoi.them.filter((d) => d.loai === "item").map((d) => d.ten)).toEqual(["Phở gà"]);
    expect(daNoi.sua.find((d) => d.loai === "item")?.chiTiet).toContain("giá 48000 → 50000");
  });

  it("giá cộng thêm của tùy chọn theo gốc; tùy chọn bị xóa ở gốc → tắt", () => {
    const root = { ...ROOT, options: [{ ...ROOT.options[0], price_delta: 15000 }] };
    expect(planMenuSync(root, KHOP).sua[0]).toMatchObject({ loai: "option" });
    expect(planMenuSync({ ...ROOT, options: [] }, KHOP).an).toEqual([{ loai: "option", ten: "Lớn" }]);
  });

  it("bỏ gắn nhóm tùy chọn ở gốc → gỡ ở chi nhánh; gắn riêng của chi nhánh (món riêng) không đụng", () => {
    const cn = {
      ...KHOP,
      items: [...KHOP.items, item("bi9", "Món riêng", "bc1", 1)],
      links: [...KHOP.links, { item_id: "bi9", group_id: "bg1", sort_order: 0 }],
    };
    const p = planMenuSync({ ...ROOT, links: [] }, cn);
    expect(p.an).toEqual([{ loai: "link", ten: "Phở bò" }]);
  });
});
