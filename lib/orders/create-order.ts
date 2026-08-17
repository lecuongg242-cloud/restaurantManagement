/**
 * Tạo order — dùng chung cho KHÁCH QR (anon, D15) và STAFF (POS thêm món thay khách, 03-02).
 * Toàn bộ chạy SERVER, service role, scope theo tenantId. Validate available + min/max/required
 * Ở SERVER (không tin giá/tên client); snapshot tên/giá vào DB; mở/ghép table_session (D3).
 *  - Khách QR: resolve qrToken → bàn → tenant; áp qr_order_auto_send (D8) — trừ khi bàn đang có
 *    hóa đơn chia đều, lúc đó đơn phải qua duyệt để chốt chặn của POS bắt được.
 *  - Staff:    tenantId + tableId đã biết (từ phiên POS đã guard); luôn vào thẳng confirmed.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseSettings } from "@/lib/tenant/settings";
import { isDuplicateKeyError, normalizeIdempotencyKey } from "@/lib/idempotency";
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
export async function validateAndBuildLines(
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

/**
 * Số thứ tự bếp kế tiếp trong NGÀY (giờ VN, reset 00:00 VN). Gán khi order confirmed để bếp/phiếu
 * hiển thị "Đơn #N" biết xử lý trước. Race hiếm ở V1 (1 nhà hàng) — chấp nhận.
 */
export async function nextKitchenNo(client: SupabaseClient, tenantId: string): Promise<number> {
  const now = new Date();
  const vn = new Date(now.getTime() + 7 * 3600 * 1000);
  const startUtc = new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate()) - 7 * 3600 * 1000);
  const { data } = await client
    .from("orders")
    .select("kitchen_no")
    .eq("tenant_id", tenantId)
    .not("kitchen_no", "is", null)
    .gte("confirmed_at", startUtc.toISOString());
  const max = (data ?? []).reduce((m, r) => Math.max(m, (r.kitchen_no as number) ?? 0), 0);
  return max + 1;
}

/**
 * Đơn đã tạo từ trước với đúng khóa này? Trả `orderId` nếu có — tức lượt gửi lại của MỘT lần bấm đã
 * thành công. Lọc `tenant_id` tường minh, cùng phạm vi với unique index của 0034.
 *
 * ĐÒI HỎI ĐƠN PHẢI CÓ ÍT NHẤT MỘT MÓN mới dám nhận là "đã tạo xong". `insertOrderGraph` ghi đơn rồi
 * mới ghi món bằng các lượt gọi rời, và nó CUỘN LẠI bằng `delete from orders` khi ghi món hỏng. Nên
 * một đơn 0 món đang ở một trong hai trạng thái: (a) người tạo còn đang ghi món dở, (b) người tạo
 * sắp xóa nó. Báo "đã gửi" cho ca (b) là đưa nhân viên một mã đơn sẽ biến mất — tệ hơn hẳn việc bảo
 * họ bấm lại một lần nữa (lượt bấm lại đó an toàn, và lúc đó đơn hoặc đã đủ món hoặc đã biến mất).
 */
async function findOrderByKey(
  admin: SupabaseClient,
  tenantId: string,
  key: string
): Promise<string | null> {
  const { data } = await admin
    .from("orders")
    .select("id, order_items(id)")
    .eq("tenant_id", tenantId)
    .eq("idempotency_key", key)
    .maybeSingle();
  if (!data) return null;
  const items = (data.order_items as { id: string }[] | null) ?? [];
  return items.length > 0 ? (data.id as string) : null;
}

/** `findOrderByKey` cho khóa THÔ từ client (chuẩn hóa hộ; khóa rỗng/rác ⇒ không tra, coi như mới). */
async function findExistingOrder(
  admin: SupabaseClient,
  tenantId: string,
  rawKey: string | null | undefined
): Promise<string | null> {
  const key = normalizeIdempotencyKey(rawKey);
  return key ? findOrderByKey(admin, tenantId, key) : null;
}

/** Insert orders + order_items + order_item_modifiers (snapshot). Rollback thủ công nếu lỗi. */
export async function insertOrderGraph(
  admin: SupabaseClient,
  args: {
    tenantId: string;
    sessionId: string | null; // null cho đơn online (không gắn bàn)
    channel: "dine_in" | "takeaway" | "delivery";
    source: "qr" | "staff" | "online";
    status: "pending_confirm" | "confirmed";
    confirmedAt: string | null;
    createdBy: string | null;
    confirmedBy: string | null;
    note: string | null;
    customerContact: Record<string, unknown> | null;
    built: BuiltLine[];
    /** Đơn gốc của nhóm "gọi thêm" (QD-011). Chỉ dùng cho đơn không gắn bàn. */
    parentOrderId?: string | null;
    /**
     * Khóa idempotent do CLIENT sinh (0034). Gửi lại cùng khóa ⇒ trả về đúng đơn cũ như một lần
     * THÀNH CÔNG, không đẻ đơn thứ hai. Bỏ trống = giữ nguyên hành vi cũ (luôn tạo đơn mới).
     */
    idempotencyKey?: string | null;
  }
): Promise<CreateOrderResult> {
  const idemKey = normalizeIdempotencyKey(args.idempotencyKey);

  // Order vào thẳng confirmed (staff / qr auto_send) → gán số bếp ngay.
  const kitchenNo = args.status === "confirmed" ? await nextKitchenNo(admin, args.tenantId) : null;
  const { data: order, error: oErr } = await admin
    .from("orders")
    .insert({
      tenant_id: args.tenantId,
      table_session_id: args.sessionId,
      channel: args.channel,
      source: args.source,
      status: args.status,
      confirmed_at: args.confirmedAt,
      confirmed_by: args.confirmedBy,
      created_by: args.createdBy,
      kitchen_no: kitchenNo,
      customer_contact: args.customerContact,
      note: args.note,
      parent_order_id: args.parentOrderId ?? null,
      idempotency_key: idemKey,
    })
    .select("id")
    .single();
  // GHI TRƯỚC RỒI BẮT LỖI, không kiểm trước rồi mới ghi: hai request cùng khóa tới gần như đồng thời
  // sẽ cùng kiểm, cùng không thấy gì, rồi cùng tạo đơn. Để Postgres phân xử thì đúng một lệnh thắng,
  // lệnh kia nhận 23505 và đi tra lại đơn vừa thắng — không còn cửa sổ đua nào.
  // Tra lại vẫn có thể KHÔNG ra đơn (23505 của một ràng buộc khác, hoặc đơn kia vừa bị cuộn lại) —
  // lúc đó rơi về báo lỗi bình thường, tuyệt đối không bịa ra một "thành công".
  if (oErr && idemKey && isDuplicateKeyError(oErr)) {
    const existingId = await findOrderByKey(admin, args.tenantId, idemKey);
    if (existingId) return { orderId: existingId };
  }
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
  customerName?: string;
  customerPhone?: string;
  /** Khóa idempotent của lần bấm "Gửi đơn" ở máy khách (0034) — gửi lại cùng khóa không đẻ đơn hai. */
  idempotencyKey?: string;
};

/**
 * Phiên bàn đang có hóa đơn 'open' mang `split_count` (vỏ chia đều) không? Dùng để quyết định có
 * được phép bỏ bước duyệt hay không.
 *
 * FAIL-CLOSED: đọc hỏng → trả `true` (coi như đang chia đều) ⇒ đơn vào hàng đợi duyệt. Chờ nhân
 * viên bấm một nút là phiền; thu thiếu tiền của nhà hàng thì không sửa được.
 */
async function sessionHasEvenSplitBill(
  admin: SupabaseClient,
  tenantId: string,
  sessionId: string
): Promise<boolean> {
  const { data, error } = await admin
    .from("bills")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("table_session_id", sessionId)
    .eq("status", "open")
    .not("split_count", "is", null)
    .limit(1);
  if (error) return true;
  return (data ?? []).length > 0;
}

export async function createQrOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
  const { slug, qrToken, lines } = input;
  const note = input.note?.trim() ? input.note.trim().slice(0, 500) : null;
  if (!qrToken) return { error: "Thiếu mã bàn (QR). Vui lòng quét lại mã tại bàn." };

  // Tên bắt buộc để phân biệt khách cùng bàn; SĐT tùy chọn.
  const name = input.customerName?.trim();
  if (!name) return { error: "Vui lòng nhập tên để nhân viên phục vụ đúng người." };
  const phone = input.customerPhone?.trim() ? input.customerPhone.trim().slice(0, 20) : null;
  const customerContact = { name: name.slice(0, 50), phone };

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

  // Tra khóa TRƯỚC `openOrJoinSession` — đây là lệnh GHI đầu tiên của cả đường, và nó không vô hại:
  // nếu phiên bàn cũ đã đóng (khách trả tiền xong) thì nó MỞ PHIÊN MỚI và đánh bàn 'occupied' rồi
  // mới phát hiện trùng khóa, để lại một phiên rỗng và một cái bàn báo sai trạng thái.
  // Đây chỉ là đường TẮT tránh tác dụng phụ, KHÔNG phải cơ chế chống trùng: hai request đồng thời
  // vẫn cùng trượt phép tra này, và chốt thật vẫn là 23505 ở `insertOrderGraph`.
  const replayed = await findExistingOrder(admin, tenantId, input.idempotencyKey);
  if (replayed) return { orderId: replayed };

  const sessionId = await openOrJoinSession(admin, tenantId, table.id, null);
  if (!sessionId) return { error: "Không mở được phiên bàn. Vui lòng thử lại." };

  // `qr_order_auto_send` đưa đơn thẳng vào 'confirmed', tức đi VÒNG QUA bước duyệt — mà chốt chặn
  // "bàn đã chia đều" (approveOrder) lại dựng đúng ở bước đó. Đơn lọt qua sẽ thành món mới trên bàn
  // đang có vỏ chia đều: con giữ nguyên số cũ ⇒ Σ con < vỏ ⇒ thu thiếu đúng phần khách vừa gọi.
  // Không từ chối khách (khách không hiểu "gỡ chia" giữa bữa ăn): chỉ ép đơn về 'pending_confirm',
  // tức đẩy vào đúng hàng đợi mà chốt kia đang canh — nhân viên gỡ chia rồi duyệt.
  const autoSend =
    parseSettings(tenant.settings).qr_order_auto_send &&
    !(await sessionHasEvenSplitBill(admin, tenantId, sessionId));
  return insertOrderGraph(admin, {
    tenantId,
    sessionId,
    channel: "dine_in",
    source: "qr",
    status: autoSend ? "confirmed" : "pending_confirm",
    confirmedAt: autoSend ? new Date().toISOString() : null,
    createdBy: null,
    confirmedBy: null,
    note,
    customerContact,
    built: validated.built,
    idempotencyKey: input.idempotencyKey,
  });
}

// ---- Staff (POS thêm món thay khách — 03-02) --------------------------------
export type CreateStaffOrderInput = {
  tenantId: string;
  tableId: string;
  lines: OrderLineInput[];
  note?: string;
  actingStaffId: string;
  /** Khóa idempotent của lần bấm "Gửi đơn" ở máy POS (0034). */
  idempotencyKey?: string;
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

  // Cùng lý do như `createQrOrder`: `openOrJoinSession` là lệnh ghi, đừng chạy nó cho một lượt gửi
  // lại. Chốt chống trùng thật vẫn nằm ở 23505 trong `insertOrderGraph`.
  const replayed = await findExistingOrder(admin, tenantId, input.idempotencyKey);
  if (replayed) return { orderId: replayed };

  const sessionId = await openOrJoinSession(admin, tenantId, tableId, actingStaffId);
  if (!sessionId) return { error: "Không mở được phiên bàn. Vui lòng thử lại." };

  return insertOrderGraph(admin, {
    tenantId,
    sessionId,
    channel: "dine_in",
    source: "staff",
    status: "confirmed",
    confirmedAt: new Date().toISOString(),
    createdBy: actingStaffId,
    confirmedBy: actingStaffId,
    note,
    customerContact: null,
    built: validated.built,
    idempotencyKey: input.idempotencyKey,
  });
}

// ---- Staff bán mang về tại quầy (không bàn) ---------------------------------
export type CreateStaffTakeawayInput = {
  tenantId: string;
  lines: OrderLineInput[];
  customerName?: string;
  customerPhone?: string;
  note?: string;
  actingStaffId: string;
  /**
   * Đơn gốc khi đây là lượt GỌI THÊM (QD-011). Người gọi phải chuẩn hóa về gốc bằng
   * `resolveGroupRoot` trước — hàm này không tự leo lên cây.
   */
  parentOrderId?: string | null;
  /** Khóa idempotent của lần bấm "Tạo đơn" ở máy POS (0034). */
  idempotencyKey?: string;
};

/**
 * Nhân viên gõ đơn MANG VỀ tại quầy (walk-in): channel='takeaway', source='staff',
 * table_session_id=null, vào thẳng confirmed (bỏ duyệt như POS thêm món) → xuống bếp + hiện ở
 * /pos/online để làm + thu tiền. Tên/SĐT khách tùy chọn (để gọi khi món xong).
 *
 * Lượt gọi thêm cũng đi đúng đường này: vẫn là ĐƠN THẬT (số bếp riêng, phiếu bếp riêng — QD-011
 * §2), chỉ khác ở `parentOrderId` để thu tiền gom về một bill.
 */
export async function createStaffTakeawayOrder(
  input: CreateStaffTakeawayInput
): Promise<CreateOrderResult> {
  const { tenantId, lines, actingStaffId } = input;
  const note = input.note?.trim() ? input.note.trim().slice(0, 500) : null;

  const admin = createAdminClient();
  const validated = await validateAndBuildLines(admin, tenantId, lines);
  if ("error" in validated) return { error: validated.error };

  const name = input.customerName?.trim();
  const customerContact = name
    ? { name: name.slice(0, 50), phone: input.customerPhone?.trim() ? input.customerPhone.trim().slice(0, 20) : null }
    : null;

  return insertOrderGraph(admin, {
    tenantId,
    sessionId: null,
    channel: "takeaway",
    source: "staff",
    status: "confirmed",
    confirmedAt: new Date().toISOString(),
    createdBy: actingStaffId,
    confirmedBy: actingStaffId,
    note,
    customerContact,
    built: validated.built,
    parentOrderId: input.parentOrderId ?? null,
    idempotencyKey: input.idempotencyKey,
  });
}
