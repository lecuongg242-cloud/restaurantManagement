import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { OWNER_A, OWNER_B, tenantIdBySlug } from "./setup";

config({ path: ".env.local" });
config();

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !SERVICE) {
  throw new Error(
    "Fixture ma trận RLS cần NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY. " +
      "Service role CHỈ dùng dựng/dọn dữ liệu, không bao giờ để khẳng định quyền."
  );
}

export type TenantKey = "A" | "B";

/**
 * Client service-role. Bỏ qua RLS — dùng ĐÚNG hai việc: dựng/dọn fixture, và đối chiếu
 * "dòng của B còn nguyên" sau phép ghi chéo. Mọi khẳng định về quyền chạy bằng anon.
 */
export function adminClient(): SupabaseClient {
  return createClient(URL!, SERVICE!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Bộ test này chạy trên DB dùng chung với nhà hàng đang hoạt động thật. Fixture chỉ được phép
 * đụng tới tenant demo — chạm nhầm một quán thật là ghi/xóa dữ liệu kinh doanh của họ.
 * Danh sách cho phép khai tường minh, không suy đoán.
 */
const DEMO_SLUGS = new Set([OWNER_A.slug, OWNER_B.slug]);

function assertDemoSlug(slug: string): void {
  if (!DEMO_SLUGS.has(slug)) {
    throw new Error(
      `Từ chối dựng fixture trên "${slug}" — chỉ cho phép tenant demo: ${[...DEMO_SLUGS].join(", ")}.`
    );
  }
}

/** UUID cố định cho fixture: f1… là tenant A, f2… là tenant B. Chạy lại là ghi đè đúng dòng cũ. */
const PREFIX: Record<TenantKey, string> = { A: "f1", B: "f2" };

export function fid(key: TenantKey, n: number): string {
  const nn = n.toString(16).padStart(2, "0");
  return `${PREFIX[key]}000000-0000-4000-8000-0000000000${nn}`;
}

/** Chỉ số thực thể → dùng chung cho fixture, ma trận đọc và ma trận ghi. */
export const IDX = {
  menu_categories: 1,
  menu_items: 2,
  modifier_groups: 3,
  modifier_options: 4,
  areas: 5,
  tables: 6,
  table_sessions: 7,
  orders: 8,
  order_items: 9,
  order_item_modifiers: 10,
  bills: 11,
  bill_items: 12,
  payments: 13,
  reservations: 14,
  staff_calls: 15,
  print_jobs: 16,
  memberships: 17,
  ingredients: 19,
  recipe_lines: 20,
  // Khóa chính là (item_id, group_id) → trỏ theo menu_items.
  menu_item_modifier_groups: 2,
} as const;

/**
 * Nhóm tùy chọn THỨ HAI, cố ý KHÔNG gắn vào món nào. Phép "A chèn vào bảng nối của B" cần một
 * cặp (item_id, group_id) chưa tồn tại — nếu dùng lại cặp đã có thì lỗi trùng khóa chính sẽ che
 * mất thứ cần đo là RLS.
 */
export const ALT_GROUP = 18;

type SeedStep = { table: string; row: Record<string, unknown>; onConflict?: string };

/**
 * Dựng một dây dữ liệu đầy đủ cho một tenant: danh mục → món → nhóm tùy chọn → khu vực → bàn →
 * phiên bàn → đơn → món trong đơn → bill → thanh toán, cộng đặt bàn / gọi nhân viên / phiếu in /
 * nhân viên PIN. Mỗi bảng trong ma trận có đúng 1 dòng, id cố định theo `fid`.
 *
 * `upsert` thay vì `insert` để chạy lại nhiều lần không vỡ (yêu cầu idempotent).
 */
function stepsFor(key: TenantKey, tenantId: string): SeedStep[] {
  const t = { tenant_id: tenantId };
  const id = (n: number) => fid(key, n);
  const label = `RLS-MATRIX-${key}`;

  return [
    { table: "menu_categories", row: { id: id(1), ...t, name: label, sort_order: 900 } },
    {
      table: "menu_items",
      row: { id: id(2), ...t, category_id: id(1), name: label, base_price: 50_000 },
    },
    { table: "modifier_groups", row: { id: id(3), ...t, name: label } },
    { table: "modifier_groups", row: { id: id(ALT_GROUP), ...t, name: `${label}-ALT` } },
    {
      table: "modifier_options",
      row: { id: id(4), ...t, group_id: id(3), name: label, price_delta: 5_000 },
    },
    {
      table: "menu_item_modifier_groups",
      row: { item_id: id(2), group_id: id(3), ...t },
      onConflict: "item_id,group_id",
    },
    { table: "areas", row: { id: id(5), ...t, name: label, sort_order: 900 } },
    {
      table: "tables",
      // qr_token là UNIQUE toàn cục → gắn key để A và B không đụng nhau.
      row: { id: id(6), ...t, area_id: id(5), name: label, seats: 4, qr_token: `rlsmatrix-${key}` },
    },
    { table: "table_sessions", row: { id: id(7), ...t, table_id: id(6), status: "open" } },
    {
      table: "orders",
      row: {
        id: id(8),
        ...t,
        table_session_id: id(7),
        channel: "dine_in",
        source: "staff",
        status: "confirmed",
        note: label,
      },
    },
    {
      table: "order_items",
      row: {
        id: id(9),
        ...t,
        order_id: id(8),
        menu_item_id: id(2),
        name_snapshot: label,
        unit_price_snapshot: 50_000,
        qty: 1,
        status: "served",
      },
    },
    {
      table: "order_item_modifiers",
      row: {
        id: id(10),
        ...t,
        order_item_id: id(9),
        name_snapshot: label,
        price_delta_snapshot: 5_000,
      },
    },
    {
      table: "bills",
      row: {
        id: id(11),
        ...t,
        table_session_id: id(7),
        status: "open",
        subtotal: 50_000,
        total: 50_000,
        note: label,
      },
    },
    {
      table: "bill_items",
      row: {
        id: id(12),
        ...t,
        bill_id: id(11),
        order_item_id: id(9),
        qty_allocated: 1,
        unit_price_snapshot: 50_000,
        amount: 50_000,
      },
    },
    {
      table: "payments",
      row: { id: id(13), ...t, bill_id: id(11), method: "cash", amount: 50_000, note: label },
    },
    {
      table: "reservations",
      row: {
        id: id(14),
        ...t,
        customer_name: label,
        customer_phone: "0900000000",
        party_size: 2,
        reserved_at: "2030-01-01T10:00:00Z",
        status: "pending",
      },
    },
    {
      table: "staff_calls",
      row: { id: id(15), ...t, table_id: id(6), table_name: label, status: "pending" },
    },
    {
      table: "print_jobs",
      row: {
        id: id(16),
        ...t,
        type: "kitchen_ticket",
        payload: { marker: label },
        status: "pending",
      },
    },
    {
      // user_id null = nhân viên PIN-only (0001 cho phép) → fixture không phải tạo auth user.
      table: "memberships",
      row: { id: id(17), ...t, user_id: null, role: "cashier", display_name: label, active: true },
    },
    {
      table: "ingredients",
      row: { id: id(19), ...t, name: label, base_unit: "g", last_unit_cost: 280 },
    },
    {
      table: "recipe_lines",
      row: { id: id(20), ...t, ingredient_id: id(19), menu_item_id: id(2), qty: 80 },
    },
  ];
}

async function seedTenant(admin: SupabaseClient, key: TenantKey, tenantId: string): Promise<void> {
  for (const step of stepsFor(key, tenantId)) {
    const { error } = await admin
      .from(step.table)
      .upsert(step.row, { onConflict: step.onConflict ?? "id" });
    if (error) throw new Error(`Dựng fixture ${step.table} (${key}) lỗi: ${error.message}`);
  }
}

/**
 * Thứ tự XÓA ngược chiều phụ thuộc. `bill_items` tham chiếu `order_items` bằng ON DELETE RESTRICT
 * nên bill phải chết trước đơn, nếu không Postgres từ chối.
 */
const TEARDOWN: { table: string; column: string; n: number }[] = [
  // recipe_lines → ingredients là ON DELETE RESTRICT: định lượng chết trước nguyên liệu.
  { table: "recipe_lines", column: "id", n: 20 },
  { table: "ingredients", column: "id", n: 19 },
  { table: "payments", column: "id", n: 13 },
  { table: "bill_items", column: "id", n: 12 },
  { table: "bills", column: "id", n: 11 },
  { table: "print_jobs", column: "id", n: 16 },
  { table: "staff_calls", column: "id", n: 15 },
  { table: "reservations", column: "id", n: 14 },
  { table: "order_item_modifiers", column: "id", n: 10 },
  { table: "order_items", column: "id", n: 9 },
  { table: "orders", column: "id", n: 8 },
  { table: "table_sessions", column: "id", n: 7 },
  { table: "tables", column: "id", n: 6 },
  { table: "areas", column: "id", n: 5 },
  { table: "menu_item_modifier_groups", column: "item_id", n: 2 },
  { table: "menu_items", column: "id", n: 2 },
  { table: "menu_categories", column: "id", n: 1 },
  { table: "modifier_options", column: "id", n: 4 },
  { table: "modifier_groups", column: "id", n: 3 },
  { table: "modifier_groups", column: "id", n: ALT_GROUP },
  { table: "memberships", column: "id", n: 17 },
];

export async function seedFixtures(): Promise<{ tenantA: string; tenantB: string }> {
  assertDemoSlug(OWNER_A.slug);
  assertDemoSlug(OWNER_B.slug);

  const admin = adminClient();
  const tenantA = await tenantIdBySlug(OWNER_A.slug);
  const tenantB = await tenantIdBySlug(OWNER_B.slug);
  await seedTenant(admin, "A", tenantA);
  await seedTenant(admin, "B", tenantB);
  return { tenantA, tenantB };
}

export async function cleanupFixtures(): Promise<void> {
  const admin = adminClient();
  for (const step of TEARDOWN) {
    const { error } = await admin
      .from(step.table)
      .delete()
      .in(step.column, [fid("A", step.n), fid("B", step.n)]);
    if (error) throw new Error(`Dọn fixture ${step.table} lỗi: ${error.message}`);
  }
}
