/**
 * Tạo order — dùng chung cho KHÁCH QR (anon, D15) và STAFF (POS thêm món thay khách, 03-02).
 * Toàn bộ chạy SERVER, service role, scope theo tenantId. Validate available + min/max/required
 * Ở SERVER (không tin giá/tên client); snapshot tên/giá vào DB; mở/ghép table_session (D3).
 *  - Khách QR: resolve qrToken → bàn → tenant; áp qr_order_auto_send (D8).
 *  - Staff:    tenantId + tableId đã biết (từ phiên POS đã guard); luôn vào thẳng confirmed.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseSettings } from "@/lib/tenant/settings";
import type { OrderLineInput } from "./types";

export type CreateOrderResult = { orderId: string } | { error: string };

type BuiltLine = {
  menu_item_id: string;
  name_snapshot: string;
  unit_price_snapshot: number;
  qty: number;
  note: string | null;
  modifiers: { option_id: string; name_snapshot: string; price_delta_snapshot: number }[];
};

/** Validate + snapshot từng dòng theo dữ liệu menu của tenant. Không tin payload client. */
async function validateAndBuildLines(
  admin: SupabaseClient,
  tenantId: string,
  lines: OrderLineInput[]
): Promise<{ built: BuiltLine[] } | { error: string }> {
  if (!Array.isArray(lines) || lines.length === 0) return { error: "Giỏ hàng đang trống." };
  if (lines.length > 50) return { error: "Đơn quá nhiều dòng (tối đa 50). Vui lòng tách đơn." };

  const [{ data: items }, { data: links }, { data: groups }, { data: options }] = await Promise.all([
    admin.from("menu_items").select("id, name, base_price, is_available, active").eq("tenant_id", tenantId),
    admin.from("menu_item_modifier_groups").select("item_id, group_id").eq("tenant_id", tenantId),
    admin.from("modifier_groups").select("id, name, min_select, max_select, required").eq("tenant_id", tenantId),
    admin.from("modifier_options").select("id, group_id, name, price_delta, is_available").eq("tenant_id", tenantId),
  ]);

  const itemById = new Map((items ?? []).map((i) => [i.id, i]));
  const groupById = new Map((groups ?? []).map((g) => [g.id, g]));
  const optionById = new Map((options ?? []).map((o) => [o.id, o]));
  const groupIdsByItem = new Map<string, Set<string>>();
  for (const l of links ?? []) {
    const s = groupIdsByItem.get(l.item_id) ?? new Set<string>();
    s.add(l.group_id);
    groupIdsByItem.set(l.item_id, s);
  }

  const built: BuiltLine[] = [];
  for (const line of lines) {
    const item = itemById.get(line.itemId);
    if (!item || !item.active) return { error: "Có món không còn tồn tại trong thực đơn." };
    if (!item.is_available) return { error: `Món "${item.name}" đã hết, không thể đặt.` };

    const qty = Number(line.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > 99)
      return { error: `Số lượng không hợp lệ cho món "${item.name}".` };

    const attachedGroupIds = groupIdsByItem.get(item.id) ?? new Set<string>();
    const selectedIds = Array.isArray(line.optionIds) ? line.optionIds : [];
    const countByGroup = new Map<string, number>();
    const modifiers: BuiltLine["modifiers"] = [];
    let priceDeltaSum = 0;

    for (const optId of selectedIds) {
      const opt = optionById.get(optId);
      if (!opt) return { error: `Tùy chọn không hợp lệ cho món "${item.name}".` };
      if (!attachedGroupIds.has(opt.group_id)) return { error: `Tùy chọn không thuộc món "${item.name}".` };
      if (!opt.is_available) return { error: `Tùy chọn "${opt.name}" của món "${item.name}" đã hết.` };
      countByGroup.set(opt.group_id, (countByGroup.get(opt.group_id) ?? 0) + 1);
      priceDeltaSum += opt.price_delta;
      modifiers.push({ option_id: opt.id, name_snapshot: opt.name, price_delta_snapshot: opt.price_delta });
    }

    for (const gid of attachedGroupIds) {
      const g = groupById.get(gid);
      if (!g) continue;
      const count = countByGroup.get(gid) ?? 0;
      const min = g.required ? Math.max(1, g.min_select) : g.min_select;
      if (count < min) return { error: `Món "${item.name}" cần chọn tùy chọn "${g.name}".` };
      if (count > g.max_select) return { error: `Món "${item.name}" chọn quá số cho phép ở "${g.name}".` };
    }

    built.push({
      menu_item_id: item.id,
      name_snapshot: item.name,
      unit_price_snapshot: item.base_price + priceDeltaSum,
      qty,
      note: line.note?.trim() ? line.note.trim().slice(0, 200) : null,
      modifiers,
    });
  }

  return { built };
}

/** Mở/ghép table_session open (1 phiên open/bàn — D3). Bàn sang occupied. */
async function openOrJoinSession(
  admin: SupabaseClient,
  tenantId: string,
  tableId: string,
  openedBy: string | null
): Promise<string | null> {
  const { data: openSession } = await admin
    .from("table_sessions")
    .select("id")
    .eq("table_id", tableId)
    .eq("status", "open")
    .maybeSingle();

  let sessionId: string;
  if (openSession) {
    sessionId = openSession.id;
  } else {
    const { data: created, error } = await admin
      .from("table_sessions")
      .insert({ tenant_id: tenantId, table_id: tableId, status: "open", opened_by: openedBy })
      .select("id")
      .single();
    if (error || !created) {
      const { data: retry } = await admin
        .from("table_sessions")
        .select("id")
        .eq("table_id", tableId)
        .eq("status", "open")
        .maybeSingle();
      if (!retry) return null;
      sessionId = retry.id;
    } else {
      sessionId = created.id;
    }
  }
  await admin.from("tables").update({ status: "occupied" }).eq("id", tableId);
  return sessionId;
}

/** Insert orders + order_items + order_item_modifiers (snapshot). Rollback thủ công nếu lỗi. */
async function insertOrderGraph(
  admin: SupabaseClient,
  args: {
    tenantId: string;
    sessionId: string;
    source: "qr" | "staff";
    status: "pending_confirm" | "confirmed";
    confirmedAt: string | null;
    createdBy: string | null;
    confirmedBy: string | null;
    note: string | null;
    built: BuiltLine[];
  }
): Promise<CreateOrderResult> {
  const { data: order, error: oErr } = await admin
    .from("orders")
    .insert({
      tenant_id: args.tenantId,
      table_session_id: args.sessionId,
      channel: "dine_in",
      source: args.source,
      status: args.status,
      confirmed_at: args.confirmedAt,
      created_by: args.createdBy,
      confirmed_by: args.confirmedBy,
      note: args.note,
    })
    .select("id")
    .single();
  if (oErr || !order) return { error: "Không tạo được đơn. Vui lòng thử lại." };
  const orderId = order.id as string;

  const itemRows = args.built.map((b) => ({
    tenant_id: args.tenantId,
    order_id: orderId,
    menu_item_id: b.menu_item_id,
    name_snapshot: b.name_snapshot,
    unit_price_snapshot: b.unit_price_snapshot,
    qty: b.qty,
    note: b.note,
  }));
  const { data: insertedItems, error: iErr } = await admin
    .from("order_items")
    .insert(itemRows)
    .select("id");
  if (iErr || !insertedItems || insertedItems.length !== args.built.length) {
    await admin.from("orders").delete().eq("id", orderId);
    return { error: "Không lưu được món. Vui lòng thử lại." };
  }

  const modRows: {
    tenant_id: string;
    order_item_id: string;
    option_id: string;
    name_snapshot: string;
    price_delta_snapshot: number;
  }[] = [];
  args.built.forEach((b, idx) => {
    const oiId = insertedItems[idx].id as string;
    for (const m of b.modifiers) {
      modRows.push({
        tenant_id: args.tenantId,
        order_item_id: oiId,
        option_id: m.option_id,
        name_snapshot: m.name_snapshot,
        price_delta_snapshot: m.price_delta_snapshot,
      });
    }
  });
  if (modRows.length > 0) {
    const { error: mErr } = await admin.from("order_item_modifiers").insert(modRows);
    if (mErr) {
      await admin.from("orders").delete().eq("id", orderId);
      return { error: "Không lưu được tùy chọn món. Vui lòng thử lại." };
    }
  }

  return { orderId };
}

// ---- Khách QR (anon) --------------------------------------------------------
export type CreateOrderInput = {
  slug: string;
  qrToken: string;
  lines: OrderLineInput[];
  note?: string;
};

export async function createQrOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
  const { slug, qrToken, lines } = input;
  const note = input.note?.trim() ? input.note.trim().slice(0, 500) : null;
  if (!qrToken) return { error: "Thiếu mã bàn (QR). Vui lòng quét lại mã tại bàn." };

  const admin = createAdminClient();

  const { data: tenant } = await admin
    .from("tenants")
    .select("id, settings")
    .eq("slug", slug)
    .maybeSingle();
  if (!tenant) return { error: "Không tìm thấy nhà hàng." };
  const tenantId = tenant.id as string;

  const { data: table } = await admin
    .from("tables")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("qr_token", qrToken)
    .maybeSingle();
  if (!table) return { error: "Mã bàn không hợp lệ. Vui lòng quét lại mã QR tại bàn." };

  const validated = await validateAndBuildLines(admin, tenantId, lines);
  if ("error" in validated) return { error: validated.error };

  const sessionId = await openOrJoinSession(admin, tenantId, table.id, null);
  if (!sessionId) return { error: "Không mở được phiên bàn. Vui lòng thử lại." };

  const autoSend = parseSettings(tenant.settings).qr_order_auto_send;
  return insertOrderGraph(admin, {
    tenantId,
    sessionId,
    source: "qr",
    status: autoSend ? "confirmed" : "pending_confirm",
    confirmedAt: autoSend ? new Date().toISOString() : null,
    createdBy: null,
    confirmedBy: null,
    note,
    built: validated.built,
  });
}

// ---- Staff (POS thêm món thay khách — 03-02) --------------------------------
export type CreateStaffOrderInput = {
  tenantId: string;
  tableId: string;
  lines: OrderLineInput[];
  note?: string;
  actingStaffId: string;
};

/**
 * POS thêm món thay khách: source=staff, vào thẳng confirmed (bỏ duyệt — ORDER-03).
 * tenantId + tableId từ phiên POS đã guard role; actingStaffId = membership thao tác.
 */
export async function createStaffOrder(input: CreateStaffOrderInput): Promise<CreateOrderResult> {
  const { tenantId, tableId, lines, actingStaffId } = input;
  const note = input.note?.trim() ? input.note.trim().slice(0, 500) : null;

  const admin = createAdminClient();

  // Bàn phải thuộc tenant (chống chéo tenant).
  const { data: table } = await admin
    .from("tables")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("id", tableId)
    .maybeSingle();
  if (!table) return { error: "Bàn không hợp lệ." };

  const validated = await validateAndBuildLines(admin, tenantId, lines);
  if ("error" in validated) return { error: validated.error };

  const sessionId = await openOrJoinSession(admin, tenantId, tableId, actingStaffId);
  if (!sessionId) return { error: "Không mở được phiên bàn. Vui lòng thử lại." };

  return insertOrderGraph(admin, {
    tenantId,
    sessionId,
    source: "staff",
    status: "confirmed",
    confirmedAt: new Date().toISOString(),
    createdBy: actingStaffId,
    confirmedBy: actingStaffId,
    note,
    built: validated.built,
  });
}
