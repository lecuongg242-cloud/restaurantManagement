import { ALT_GROUP, fid, IDX } from "./fixtures";

/**
 * TENANT-05 — Ma trận cách ly tenant trên MỌI bảng mang tenant_id.
 * Phiên là owner thật + anon key, đúng như client production. Service role chỉ dựng fixture
 * và đối chiếu dữ liệu B sau phép ghi chéo.
 */
export type Case = {
  /** Tên bảng trong schema public. */
  table: string;
  /** Cột khóa để trỏ tới dòng fixture. Mặc định "id". */
  idColumn?: string;
  /** Cột dùng khi đọc (phải luôn tồn tại). Mặc định "id". */
  selectColumn?: string;
  /**
   * Dòng mà A cố chèn vào tenant B. Dùng ĐÚNG khóa ngoại của B (qua `fid("B", …)`) để lý do duy
   * nhất bị từ chối là RLS, không phải vi phạm khóa ngoại. `newId` là uuid ngẫu nhiên — trùng
   * khóa chính sẽ che mất thứ cần đo.
   */
  insertRow: (tenantB: string, newId: string) => Record<string, unknown>;
  /** Trường A cố sửa trên dòng của B. Phải là cột vô hại, không đụng ràng buộc. */
  updatePatch: Record<string, unknown>;
};

const B = (n: number) => fid("B", n);
const MARK = "XAM-PHAM";

export const CASES: Case[] = [
  {
    table: "memberships",
    insertRow: (t, id) => ({ id, tenant_id: t, user_id: null, role: "cashier", display_name: MARK }),
    updatePatch: { display_name: MARK },
  },
  {
    table: "menu_categories",
    insertRow: (t, id) => ({ id, tenant_id: t, name: MARK }),
    updatePatch: { name: MARK },
  },
  {
    table: "menu_items",
    insertRow: (t, id) => ({ id, tenant_id: t, category_id: B(1), name: MARK, base_price: 1_000 }),
    updatePatch: { name: MARK },
  },
  {
    table: "modifier_groups",
    insertRow: (t, id) => ({ id, tenant_id: t, name: MARK }),
    updatePatch: { name: MARK },
  },
  {
    table: "modifier_options",
    insertRow: (t, id) => ({ id, tenant_id: t, group_id: B(3), name: MARK }),
    updatePatch: { name: MARK },
  },
  {
    table: "menu_item_modifier_groups",
    idColumn: "item_id",
    selectColumn: "item_id",
    // Cặp (món B, nhóm ALT của B) chưa tồn tại → bị từ chối là do RLS, không do trùng khóa chính.
    insertRow: (t) => ({ item_id: B(2), group_id: B(ALT_GROUP), tenant_id: t, sort_order: 77 }),
    updatePatch: { sort_order: 77 },
  },
  {
    table: "areas",
    insertRow: (t, id) => ({ id, tenant_id: t, name: MARK }),
    updatePatch: { name: MARK },
  },
  {
    table: "tables",
    insertRow: (t, id) => ({ id, tenant_id: t, name: MARK, qr_token: `xampham-${id.slice(0, 8)}` }),
    updatePatch: { name: MARK },
  },
  {
    table: "table_sessions",
    insertRow: (t, id) => ({ id, tenant_id: t, table_id: B(6), status: "open" }),
    updatePatch: { status: "closed" },
  },
  {
    table: "orders",
    insertRow: (t, id) => ({ id, tenant_id: t, channel: "dine_in", source: "staff", note: MARK }),
    updatePatch: { note: MARK },
  },
  {
    table: "order_items",
    insertRow: (t, id) => ({
      id,
      tenant_id: t,
      order_id: B(8),
      name_snapshot: MARK,
      unit_price_snapshot: 1_000,
      qty: 1,
    }),
    updatePatch: { name_snapshot: MARK },
  },
  {
    table: "order_item_modifiers",
    insertRow: (t, id) => ({ id, tenant_id: t, order_item_id: B(9), name_snapshot: MARK }),
    updatePatch: { name_snapshot: MARK },
  },
  {
    table: "bills",
    insertRow: (t, id) => ({ id, tenant_id: t, status: "open", subtotal: 0, total: 0, note: MARK }),
    updatePatch: { note: MARK },
  },
  {
    table: "bill_items",
    insertRow: (t, id) => ({
      id,
      tenant_id: t,
      bill_id: B(11),
      order_item_id: B(9),
      qty_allocated: 1,
      unit_price_snapshot: 1_000,
      amount: 1_000,
    }),
    updatePatch: { amount: 1_000 },
  },
  {
    table: "payments",
    insertRow: (t, id) => ({ id, tenant_id: t, bill_id: B(11), method: "cash", amount: 1, note: MARK }),
    updatePatch: { note: MARK },
  },
  {
    table: "print_jobs",
    insertRow: (t, id) => ({ id, tenant_id: t, type: "kitchen_ticket", payload: { marker: MARK } }),
    updatePatch: { status: "printed" },
  },
  {
    table: "reservations",
    insertRow: (t, id) => ({
      id,
      tenant_id: t,
      customer_name: MARK,
      customer_phone: "0900000001",
      party_size: 2,
      reserved_at: "2030-01-01T11:00:00Z",
    }),
    updatePatch: { customer_name: MARK },
  },
  {
    table: "staff_calls",
    insertRow: (t, id) => ({ id, tenant_id: t, table_id: B(6), table_name: MARK }),
    updatePatch: { table_name: MARK },
  },
  {
    table: "ingredients",
    insertRow: (t, id) => ({ id, tenant_id: t, name: MARK, base_unit: "g" }),
    updatePatch: { name: MARK },
  },
  {
    table: "recipe_lines",
    // Nguyên liệu + option của B, cặp chưa tồn tại → lý do duy nhất bị từ chối là RLS, không phải trùng.
    insertRow: (t, id) => ({ id, tenant_id: t, ingredient_id: B(19), modifier_option_id: B(4), qty: 1 }),
    updatePatch: { qty: 99 },
  },
  {
    table: "production_batches",
    insertRow: (t, id) => ({
      id, tenant_id: t, business_date: "2030-01-02", ingredient_id: B(19),
      batch_count: 1, expected_qty: 1, actual_qty: 1,
    }),
    updatePatch: { actual_qty: 99 },
  },
  {
    table: "stock_entries",
    insertRow: (t, id) => ({
      id, tenant_id: t, business_date: "2030-01-02", occurred_at: "2030-01-02T05:00:00Z", ingredient_id: B(19),
      kind: "receipt", qty: 1, note: MARK,
    }),
    updatePatch: { note: MARK },
  },
  {
    // Không có policy update/delete nào (bất biến) → phép ghi chéo ra 0 dòng là đương nhiên; phần
    // "chính A cũng không sửa được" nằm ở daily-close.test.ts.
    table: "daily_closes",
    insertRow: (t, id) => ({ id, tenant_id: t, business_date: "2000-01-02", payload: { marker: MARK } }),
    updatePatch: { payload: { marker: MARK } },
  },
  // P20 (0076): NCC ghi thẳng được (RLS chủ/quản lý); phiếu nhập, dòng phiếu, phiếu chi chỉ ghi qua hàm — ghi thẳng
  // bị từ chối vì không có quyền bảng, kể cả vào quán mình (p20-purchasing.test.ts).
  {
    table: "suppliers",
    insertRow: (t, id) => ({ id, tenant_id: t, code: `${MARK}-${id.slice(0, 8)}`, name: MARK }),
    updatePatch: { note: MARK },
  },
  {
    table: "purchase_receipts",
    insertRow: (t, id) => ({ id, tenant_id: t, code: `${MARK}-${id.slice(0, 8)}`, doc_date: "2030-01-02" }),
    updatePatch: { note: MARK },
  },
  {
    table: "purchase_receipt_lines",
    insertRow: (t, id) => ({ id, tenant_id: t, receipt_id: B(25), ingredient_id: B(19), qty: 1, purchase_factor: 1 }),
    updatePatch: { qty: 99 },
  },
  {
    table: "cash_vouchers",
    insertRow: (t, id) => ({
      id, tenant_id: t, code: `${MARK}-${id.slice(0, 8)}`, direction: "out", fund: "cash", amount: 1, source: "manual",
    }),
    updatePatch: { note: MARK },
  },
  {
    // P20 20-02 (0077): loại thu/chi — chủ/quản lý ghi thẳng được, không xóa (ngừng dùng thay cho xóa).
    table: "cash_categories",
    insertRow: (t, id) => ({ id, tenant_id: t, direction: "out", name: `${MARK}-${id.slice(0, 8)}` }),
    updatePatch: { cost_group: "none" },
  },
  // P20 20-03 (0078): phân bổ + điều chỉnh nợ — chỉ đọc; ghi qua hàm / trigger.
  {
    table: "cash_voucher_allocations",
    insertRow: (t, id) => ({ id, tenant_id: t, voucher_id: B(27), receipt_id: B(25), amount: 2 }),
    updatePatch: { amount: 99 },
  },
  {
    table: "supplier_debt_adjustments",
    insertRow: (t, id) => ({ id, tenant_id: t, supplier_id: B(24), amount: 1, note: MARK }),
    updatePatch: { note: MARK },
  },
  // P34 (0085): phiếu kiểm kê + dòng — chỉ đọc (chủ/quản lý); ghi qua complete_stock_count / cancel_stock_count.
  {
    table: "stock_counts",
    insertRow: (t, id) => ({ id, tenant_id: t, code: `${MARK}-${id.slice(0, 8)}`, counted_at: "2030-01-02T05:00:00Z" }),
    updatePatch: { code: MARK },
  },
  {
    table: "stock_count_lines",
    insertRow: (t, id) => ({
      id, tenant_id: t, count_id: B(31), ingredient_id: B(19), counted_base: 2, count_unit: "base", theoretical: 0, diff: 2,
    }),
    updatePatch: { diff: 99 },
  },
];

/** Dòng fixture của tenant B ứng với một bảng. */
export function targetIdOfB(c: Case): string {
  return fid("B", IDX[c.table as keyof typeof IDX]);
}

