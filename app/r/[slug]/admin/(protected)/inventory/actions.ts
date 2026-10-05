"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionMembership } from "@/lib/auth/session";
import { canManage } from "@/lib/auth/rbac";
import { setFlash } from "@/lib/flash";
import { knownFactor, parseQty, toBaseQty, unitCostFromPurchase } from "@/lib/inventory/units";
import { purchaseErrorMessage, qty3, receiptTotals, validateReceipt } from "@/lib/purchasing/receipt";
import { businessDate } from "@/lib/inventory/day";
import { planBatch } from "@/lib/inventory/batch";
import { loadInventory, costContext } from "@/lib/inventory/data";
import { checkRecipeChange, MAX_DEPTH } from "@/lib/inventory/recipe-graph";
import { countToBase, parseCount, type CountUnit } from "@/lib/inventory/count";
import { lockMessage, parseLockDetail, parseVnDateTime, toConflicts, type LockRow } from "@/lib/inventory/lock";
import type { BaseUnit, IngredientKind } from "@/lib/inventory/types";

// Định lượng KHÔNG đổi thực đơn khách → không gọi revalidateMenu (cache PERF-02 giữ nguyên).

/** Guard chung: owner/manager (QD-017 C4). */
async function requireInventoryManager(slug: string) {
  const session = await getSessionMembership(slug);
  if (!session || !canManage(session.role, "inventory")) {
    redirect(`/r/${slug}/admin?error=${encodeURIComponent("Không đủ quyền.")}`);
  }
  return session!;
}

function invPath(slug: string) {
  return `/r/${slug}/admin/inventory`;
}

const BASE_UNITS: BaseUnit[] = ["g", "ml", "cai", "kg", "l"];

type IngredientFields = {
  name: string;
  kind: IngredientKind;
  base_unit: BaseUnit;
  purchase_unit: string | null;
  purchase_factor: number;
  must_count: boolean;
  batch_output_qty: number | null;
};

/** Đọc + kiểm form nguyên liệu. Trả chuỗi lỗi tiếng Việt khi sai. */
function readIngredient(fd: FormData): IngredientFields | string {
  const name = String(fd.get("name") ?? "").trim();
  if (!name) return "Chưa nhập tên nguyên liệu.";
  const kind = fd.get("kind") === "prepared" ? "prepared" : "purchased";
  const base_unit = String(fd.get("base_unit") ?? "") as BaseUnit;
  if (!BASE_UNITS.includes(base_unit)) return "Đơn vị gốc không hợp lệ.";

  const purchase_unit = String(fd.get("purchase_unit") ?? "").trim() || null;
  const factorRaw = String(fd.get("purchase_factor") ?? "").trim();
  // Đơn vị quen (kg, lạng, lít…) → hệ số TỰ TÍNH, bỏ qua số gửi lên — tránh "1 kg = 100.000 kg" (29/09/2026).
  const known = purchase_unit ? knownFactor(purchase_unit, base_unit) : null;
  const purchase_factor = !purchase_unit ? 1 : known ?? parseQty(factorRaw);
  if (purchase_factor === null) return `1 ${purchase_unit} bằng bao nhiêu ${base_unit}? Hệ số phải lớn hơn 0.`;

  // "% dùng được" không còn nhận từ form: tự tính từ kiểm kê (lib/inventory/yield.ts, 0081).

  const batchRaw = String(fd.get("batch_output_qty") ?? "").trim();
  const batch_output_qty = kind === "prepared" ? parseQty(batchRaw) : null;
  if (kind === "prepared" && batch_output_qty === null) {
    return "Bán thành phẩm cần sản lượng 1 mẻ (ví dụ nồi nước dùng ra 40000 ml).";
  }

  return {
    name,
    kind,
    base_unit,
    purchase_unit,
    purchase_factor,
    must_count: fd.get("must_count") === "on",
    batch_output_qty,
  };
}

/** Giá nhập tay theo ĐƠN VỊ NHẬP ("280000" / kg) → đồng / đơn vị gốc. Rỗng = không đổi giá. */
function readPrice(fd: FormData, factor: number): number | null {
  const raw = String(fd.get("price") ?? "").replace(/[^\d]/g, "");
  if (!raw) return null;
  return unitCostFromPurchase(parseInt(raw, 10), factor);
}

/** Ghi chú của dòng sổ tồn đầu kỳ — để màn và báo cáo nhận ra (không phải phiếu nhập NCC). */
const OPENING_NOTE = "Tồn đầu kỳ";

/** Đọc ô "Tồn hiện có" (đơn vị nhập nếu có). Trống / 0 = không khai. */
function readOpening(fd: FormData): number | null | "invalid" {
  const p = parseCount(String(fd.get("opening_qty") ?? ""));
  if (!p) return null;
  if (!p.ok) return "invalid";
  return p.value > 0 ? p.value : null;
}

/**
 * Tồn đầu kỳ (P26, như Sapo "Số lượng ban đầu" / CUKCUK "Nhập số dư ban đầu"): hàng có sẵn lúc bắt đầu dùng kho. Ghi một dòng
 * `receipt` không gắn phiếu nhập, ngày hôm nay — vào tồn như hàng nhập, KHÔNG vào hao hụt hay "% dùng được" (khác kiểm kê:
 * kiểm kê lần đầu từ sổ 0 bị tính là "dư không giải thích"). Chỉ khi nguyên liệu chưa có dòng sổ nào.
 */
async function recordOpening(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
  ingredientId: string,
  qty: number,
  factor: number,
  unitCost: number | null,
  createdBy: string
): Promise<string | null> {
  // Khóa ngoại bỏ qua RLS: kiểm nguyên liệu thuộc quán này trước khi ghi (bài học record_batch).
  const { data: own } = await supabase
    .from("ingredients")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("id", ingredientId)
    .maybeSingle();
  if (!own) return "Không tìm thấy nguyên liệu.";
  const { count } = await supabase
    .from("stock_entries")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("ingredient_id", ingredientId);
  if ((count ?? 0) > 0) return "Nguyên liệu đã có nhập / xuất — tồn hiện có chỉ khai một lần lúc bắt đầu. Tồn lệch thì kiểm kê.";
  const { error } = await supabase.from("stock_entries").insert({
    tenant_id: tenantId,
    business_date: businessDate(),
    ingredient_id: ingredientId,
    kind: "receipt",
    qty: qty3(toBaseQty(qty, factor)),
    unit_cost: unitCost,
    note: OPENING_NOTE,
    created_by: createdBy,
  });
  return error ? error.message : null;
}

/** Kết quả cho hộp thoại thêm / sửa (P29): lỗi thì giữ hộp thoại và hiện câu lỗi; thông báo góc màn vẫn như cũ. */
export type IngredientResult = { ok: boolean; error?: string };

export async function createIngredient(fd: FormData): Promise<IngredientResult> {
  const slug = String(fd.get("slug") ?? "");
  const session = await requireInventoryManager(slug);
  const fields = readIngredient(fd);
  if (typeof fields === "string") {
    await setFlash("error", fields);
    return { ok: false, error: fields };
  }
  const price = fields.kind === "purchased" ? readPrice(fd, fields.purchase_factor) : null;
  const opening = readOpening(fd);
  if (opening === "invalid") {
    await setFlash("error", "Tồn kho ban đầu phải là số không âm.");
    return { ok: false, error: "Tồn kho ban đầu phải là số không âm." };
  }

  const supabase = await createClient();
  const { data: created, error } = await supabase
    .from("ingredients")
    .insert({
      tenant_id: session.tenant.id,
      ...fields,
      ...(price !== null ? { last_unit_cost: price, last_cost_at: new Date().toISOString() } : {}),
    })
    .select("id")
    .single();
  const openErr =
    !error && created && opening !== null
      ? await recordOpening(supabase, session.tenant.id, created.id as string, opening, fields.purchase_factor, price, session.membershipId)
      : null;
  revalidatePath(invPath(slug), "layout");
  const msg = error
    ? error.code === "23505"
      ? `Đã có nguyên liệu tên "${fields.name}".`
      : error.message
    : openErr
      ? `Đã thêm "${fields.name}" nhưng chưa ghi được tồn kho ban đầu: ${openErr}`
      : `Đã thêm "${fields.name}"${opening !== null ? " kèm tồn kho ban đầu" : ""}.`;
  await setFlash(error || openErr ? "error" : "ok", msg);
  // Đã tạo được nguyên liệu mà chỉ hỏng tồn đầu → coi như xong (đóng hộp thoại), thông báo góc màn báo phần hỏng.
  return error ? { ok: false, error: msg } : { ok: true };
}

export async function updateIngredient(fd: FormData): Promise<IngredientResult> {
  const slug = String(fd.get("slug") ?? "");
  const session = await requireInventoryManager(slug);
  const id = String(fd.get("id") ?? "");
  const fields = readIngredient(fd);
  if (typeof fields === "string") {
    await setFlash("error", fields);
    return { ok: false, error: fields };
  }
  const price = fields.kind === "purchased" ? readPrice(fd, fields.purchase_factor) : null;

  const supabase = await createClient();
  // Đổi loại mua vào ↔ bán thành phẩm khi đang có công thức con / đang là con thì dữ liệu sai nghĩa.
  if (fields.kind === "purchased") {
    const { count } = await supabase
      .from("recipe_lines")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", session.tenant.id)
      .eq("parent_ingredient_id", id);
    if ((count ?? 0) > 0) {
      const msg = "Nguyên liệu này đang có công thức mẻ — xóa công thức trước khi đổi sang loại mua vào.";
      await setFlash("error", msg);
      return { ok: false, error: msg };
    }
  }

  const opening = readOpening(fd);
  if (opening === "invalid") {
    await setFlash("error", "Tồn kho ban đầu phải là số không âm.");
    return { ok: false, error: "Tồn kho ban đầu phải là số không âm." };
  }
  const { error } = await supabase
    .from("ingredients")
    .update({
      ...fields,
      ...(price !== null ? { last_unit_cost: price, last_cost_at: new Date().toISOString() } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("tenant_id", session.tenant.id);
  const openErr =
    !error && opening !== null
      ? await recordOpening(supabase, session.tenant.id, id, opening, fields.purchase_factor, price, session.membershipId)
      : null;
  revalidatePath(invPath(slug), "layout");
  const msg = error
    ? error.code === "23505"
      ? `Đã có nguyên liệu tên "${fields.name}".`
      : error.message
    : openErr ?? `Đã lưu "${fields.name}"${opening !== null ? " kèm tồn kho ban đầu" : ""}.`;
  await setFlash(error || openErr ? "error" : "ok", msg);
  return error || openErr ? { ok: false, error: msg } : { ok: true };
}

/** Ẩn/hiện. Không xóa: dòng định lượng tham chiếu bằng ON DELETE RESTRICT, và sổ kho (10-02) cần tên cũ. */
export async function setIngredientActive(fd: FormData): Promise<IngredientResult> {
  const slug = String(fd.get("slug") ?? "");
  const session = await requireInventoryManager(slug);
  const id = String(fd.get("id") ?? "");
  const active = fd.get("active") === "true";

  const supabase = await createClient();
  if (!active) {
    const { count } = await supabase
      .from("recipe_lines")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", session.tenant.id)
      .eq("ingredient_id", id);
    if ((count ?? 0) > 0) {
      const msg = `Nguyên liệu đang dùng trong ${count} dòng định lượng — gỡ khỏi các món trước khi ẩn.`;
      await setFlash("error", msg);
      return { ok: false, error: msg };
    }
  }
  const { error } = await supabase
    .from("ingredients")
    .update({ active, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("tenant_id", session.tenant.id);
  revalidatePath(invPath(slug), "layout");
  await setFlash(error ? "error" : "ok", error ? error.message : active ? "Đã hiện lại." : "Đã ẩn nguyên liệu.");
  return error ? { ok: false, error: error.message } : { ok: true };
}

type OwnerKind = "item" | "option" | "parent";
const OWNER_COLUMN: Record<OwnerKind, "menu_item_id" | "modifier_option_id" | "parent_ingredient_id"> = {
  item: "menu_item_id",
  option: "modifier_option_id",
  parent: "parent_ingredient_id",
};

/**
 * Lưu trọn định lượng của một chủ (món / option / bán thành phẩm): xóa dòng cũ rồi chèn dòng mới.
 * Chèn lỗi thì chèn lại dòng cũ — không để món mất định lượng vì một lần lưu hỏng.
 */
export async function saveRecipe(fd: FormData) {
  const slug = String(fd.get("slug") ?? "");
  const session = await requireInventoryManager(slug);
  const tenantId = session.tenant.id;
  const kind = String(fd.get("owner_kind") ?? "") as OwnerKind;
  const ownerId = String(fd.get("owner_id") ?? "");
  const column = OWNER_COLUMN[kind];
  if (!column || !ownerId) {
    await setFlash("error", "Thiếu thông tin món cần lưu định lượng.");
    return;
  }

  let parsed: { ingredient_id: string; qty: string }[];
  try {
    parsed = JSON.parse(String(fd.get("lines") ?? "[]"));
    if (!Array.isArray(parsed)) throw new Error();
  } catch {
    await setFlash("error", "Dữ liệu định lượng không hợp lệ.");
    return;
  }

  const supabase = await createClient();
  const { data: ingRows } = await supabase
    .from("ingredients")
    .select("id, name, kind, active")
    .eq("tenant_id", tenantId);
  const ingById = new Map((ingRows ?? []).map((r) => [r.id as string, r]));

  // Chủ phải thuộc quán này (RLS đã chặn đọc chéo; kiểm thêm để báo lỗi rõ thay vì chèn hụt).
  if (kind === "parent") {
    const p = ingById.get(ownerId);
    if (!p || p.kind !== "prepared") {
      await setFlash("error", "Chỉ bán thành phẩm mới có công thức mẻ.");
      return;
    }
  } else {
    const table = kind === "item" ? "menu_items" : "modifier_options";
    const { count } = await supabase
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("id", ownerId);
    if (!count) {
      await setFlash("error", "Không tìm thấy món/tùy chọn.");
      return;
    }
  }

  const lines: { ingredient_id: string; qty: number }[] = [];
  for (const l of parsed) {
    if (!l.ingredient_id) continue; // dòng trống người dùng chưa chọn
    const ing = ingById.get(l.ingredient_id);
    if (!ing) {
      await setFlash("error", "Có nguyên liệu không còn tồn tại.");
      return;
    }
    const qty = parseQty(String(l.qty ?? ""));
    if (qty === null) {
      await setFlash("error", `Lượng của "${ing.name}" phải là số lớn hơn 0.`);
      return;
    }
    if (lines.some((x) => x.ingredient_id === l.ingredient_id)) {
      await setFlash("error", `"${ing.name}" bị khai hai lần — gộp thành một dòng.`);
      return;
    }
    lines.push({ ingredient_id: l.ingredient_id, qty });
  }

  if (kind === "parent") {
    const { data: edgeRows } = await supabase
      .from("recipe_lines")
      .select("parent_ingredient_id, ingredient_id")
      .eq("tenant_id", tenantId)
      .not("parent_ingredient_id", "is", null);
    const edges = new Map<string, string[]>();
    for (const e of edgeRows ?? []) {
      const arr = edges.get(e.parent_ingredient_id as string) ?? [];
      arr.push(e.ingredient_id as string);
      edges.set(e.parent_ingredient_id as string, arr);
    }
    const prepared = new Set(
      (ingRows ?? []).filter((r) => r.kind === "prepared").map((r) => r.id as string)
    );
    const check = checkRecipeChange(edges, ownerId, lines.map((l) => l.ingredient_id), prepared);
    if (!check.ok) {
      const nameOf = (id: string) => (ingById.get(id)?.name as string) ?? "?";
      await setFlash(
        "error",
        check.reason === "cycle"
          ? `Công thức bị vòng: ${check.path.map(nameOf).join(" → ")}. Không lưu.`
          : `Công thức lồng quá ${MAX_DEPTH} cấp. Không lưu.`
      );
      return;
    }
  }

  const { data: oldLines } = await supabase
    .from("recipe_lines")
    .select("ingredient_id, qty")
    .eq("tenant_id", tenantId)
    .eq(column, ownerId);

  const { error: delErr } = await supabase
    .from("recipe_lines")
    .delete()
    .eq("tenant_id", tenantId)
    .eq(column, ownerId);
  if (delErr) {
    await setFlash("error", delErr.message);
    return;
  }

  if (lines.length > 0) {
    const toRow = (l: { ingredient_id: string; qty: number | string }) => ({
      tenant_id: tenantId,
      ingredient_id: l.ingredient_id,
      qty: l.qty,
      [column]: ownerId,
    });
    const { error: insErr } = await supabase.from("recipe_lines").insert(lines.map(toRow));
    if (insErr) {
      if (oldLines && oldLines.length > 0) {
        await supabase.from("recipe_lines").insert(oldLines.map(toRow));
      }
      await setFlash("error", `Lưu định lượng lỗi, đã giữ bản cũ: ${insErr.message}`);
      revalidatePath(invPath(slug), "layout");
      return;
    }
  }

  revalidatePath(invPath(slug), "layout");
  await setFlash("ok", lines.length > 0 ? "Đã lưu định lượng." : "Đã xóa định lượng.");
}

// ── 10-02: nhập buổi sáng + chế biến mẻ ──────────────────────────────────────────────────────

/**
 * Nhập hàng (INV-04 + P20 PURCH-02): mỗi lần gửi là MỘT phiếu nhập qua `save_purchase_receipt` (0076) — "Lưu tạm" chưa
 * cộng kho; "Hoàn thành" ghi dòng `receipt` (ngày VN do DB tính), cập nhật giá gần nhất và sinh phiếu chi nếu trả ngay,
 * trong cùng một giao dịch. Nhập lần hai trong ngày là phiếu mới — cộng dồn như trước.
 *
 * P34: "Thời gian nhập" (giờ hàng về, trống = lúc bấm). Vướng phiếu kiểm kê (QD-034 D2) → Lưu tạm để không mất số đã gõ,
 * mở phiếu tạm — trang chi tiết hiện khung đỏ nêu phiếu kiểm kê cần hủy.
 */
export async function recordReceipts(fd: FormData) {
  const slug = String(fd.get("slug") ?? "");
  const session = await requireInventoryManager(slug);
  const tenantId = session.tenant.id;
  const complete = String(fd.get("intent") ?? "complete") !== "draft";

  type Payload = {
    id?: string | null;
    supplier_id?: string | null;
    discount?: number;
    pay_now?: number;
    pay_fund?: string;
    note?: string;
    received_at?: string | null;
    rows: { ingredient_id: string; qty: string; price: string }[];
  };
  let payload: Payload;
  try {
    payload = JSON.parse(String(fd.get("payload") ?? ""));
    if (!payload || !Array.isArray(payload.rows)) throw new Error();
  } catch {
    await setFlash("error", "Dữ liệu nhập không hợp lệ.");
    return;
  }

  const lines: { ingredient_id: string; qty: number; unit_price: number | null }[] = [];
  for (const r of payload.rows) {
    if (!r.ingredient_id || !String(r.qty ?? "").trim()) continue; // dòng để trống = hôm nay không nhập
    const qty = parseQty(String(r.qty));
    if (qty === null) {
      await setFlash("error", "Số lượng phải là số lớn hơn 0.");
      return;
    }
    const priceRaw = String(r.price ?? "").replace(/[^\d]/g, "");
    lines.push({ ingredient_id: r.ingredient_id, qty: qty3(qty), unit_price: priceRaw ? parseInt(priceRaw, 10) : null });
  }

  const discount = Math.max(0, Math.round(Number(payload.discount) || 0));
  const payNow = Math.max(0, Math.round(Number(payload.pay_now) || 0));
  const supplierId = payload.supplier_id || null;
  const { subtotal } = receiptTotals(lines, 0);
  const invalid = validateReceipt({
    lineCount: lines.length, subtotal, discount, payNow, hasSupplier: !!supplierId, complete,
  });
  if (invalid) {
    await setFlash("error", invalid);
    return;
  }

  const receivedAt = payload.received_at ? parseVnDateTime(payload.received_at) : null;
  if (payload.received_at && !receivedAt) {
    await setFlash("error", "Thời gian nhập không hợp lệ.");
    return;
  }

  const supabase = await createClient();
  const receipt = {
    id: payload.id || null,
    supplier_id: supplierId,
    discount,
    pay_now: payNow,
    pay_fund: payload.pay_fund === "bank" ? "bank" : "cash",
    note: String(payload.note ?? "").slice(0, 500),
    received_at: receivedAt,
    lines,
  };
  const { data, error } = await supabase.rpc("save_purchase_receipt", { p_tenant: tenantId, p_receipt: receipt, p_complete: complete });
  const conflicts = parseLockDetail(error?.message, error?.details);
  if (conflicts && complete) {
    const draft = await supabase.rpc("save_purchase_receipt", { p_tenant: tenantId, p_receipt: receipt, p_complete: false });
    const saved = draft.data?.[0] as { id: string; code: string } | undefined;
    await setFlash("error", lockMessage(conflicts, saved ? `Chưa nhập kho — đã lưu tạm phiếu ${saved.code}` : "Không nhập được"));
    if (saved) redirect(`/r/${slug}/admin/nhap-hang/${saved.id}`);
    return;
  }
  if (error || !data?.[0]) {
    await setFlash("error", purchaseErrorMessage(error?.message));
    return;
  }
  const saved = data[0] as { id: string; code: string };
  revalidatePath(invPath(slug), "layout");
  revalidatePath(`/r/${slug}/admin/nha-cung-cap`, "layout");
  await setFlash("ok", complete ? `Đã nhập hàng — phiếu ${saved.code}.` : `Đã lưu tạm phiếu ${saved.code}.`);
  redirect(`/r/${slug}/admin/nhap-hang/${saved.id}`);
}

/** Phiếu chế biến mẻ (INV-05): tính ở server bằng `planBatch`, ghi qua RPC một giao dịch. */
export async function recordBatch(fd: FormData) {
  const slug = String(fd.get("slug") ?? "");
  const session = await requireInventoryManager(slug);
  const tenantId = session.tenant.id;
  const ingredientId = String(fd.get("ingredient_id") ?? "");
  const batchCount = parseQty(String(fd.get("batch_count") ?? ""));
  const actualRaw = String(fd.get("actual_qty") ?? "").trim();
  const actual = actualRaw === "0" ? 0 : parseQty(actualRaw);
  if (!ingredientId || batchCount === null || actual === null) {
    await setFlash("error", "Chọn bán thành phẩm, nhập số mẻ và sản lượng thực.");
    return;
  }

  const supabase = await createClient();
  const data = await loadInventory(supabase, tenantId);
  const prepared = data.ingredients.find((i) => i.id === ingredientId && i.kind === "prepared");
  const recipe = data.byParent.get(ingredientId) ?? [];
  if (!prepared || recipe.length === 0) {
    await setFlash("error", "Bán thành phẩm này chưa có công thức mẻ — khai ở tab Nguyên liệu trước.");
    return;
  }
  const plan = planBatch(prepared, recipe, batchCount, actual, costContext(data));

  const { error } = await supabase.rpc("record_batch", {
    p_tenant: tenantId,
    p_business_date: businessDate(),
    p_ingredient: ingredientId,
    p_batch_count: batchCount,
    p_expected: plan.expectedQty,
    p_actual: actual,
    p_cost_total: plan.costTotal,
    p_unit_cost: plan.unitCost,
    p_created_by: session.membershipId,
    p_consume: plan.consume,
  });
  revalidatePath(invPath(slug), "layout");
  await setFlash(
    error ? "error" : "ok",
    error ? `Ghi phiếu chế biến lỗi: ${error.message}` : `Đã ghi ${batchCount} mẻ ${prepared.name}.`
  );
}

// ── 10-03: kiểm kê cuối ngày + xuất hủy ────────────────────────────────────────────────────

/**
 * Kiểm kê (INV-08, P34 INV-19): mỗi lần Hoàn thành là MỘT phiếu kiểm kê (mã KK…) qua `complete_stock_count` (0085). Độ lệch
 * = số đếm − tồn sổ TẠI thời gian kiểm kê, tính trong DB (không tin số máy gửi lên — giữa lúc mở màn và lúc gửi có thể đã
 * bán thêm). Ghi cả độ lệch 0: "đã kiểm, khớp" khác "không kiểm". `redo_of` = Hoàn thành lại phiếu đã hủy: giữ giờ kiểm cũ.
 */
export async function recordCounts(fd: FormData) {
  const slug = String(fd.get("slug") ?? "");
  const session = await requireInventoryManager(slug);
  const tenantId = session.tenant.id;
  const redoOf = String(fd.get("redo_of") ?? "") || null;

  let parsed: { ingredient_id: string; counted: string; unit?: CountUnit }[];
  try {
    parsed = JSON.parse(String(fd.get("rows") ?? "[]"));
    if (!Array.isArray(parsed)) throw new Error();
  } catch {
    await setFlash("error", "Dữ liệu kiểm kê không hợp lệ.");
    return;
  }

  const supabase = await createClient();
  const { data: ingRows } = await supabase
    .from("ingredients")
    .select("id, name, must_count, purchase_factor")
    .eq("tenant_id", tenantId);
  const ingById = new Map((ingRows ?? []).map((r) => [r.id as string, r]));

  const lines: { ingredient_id: string; counted_base: number; unit: CountUnit }[] = [];
  for (const r of parsed) {
    const p = parseCount(String(r.counted ?? ""));
    if (!p) continue; // không đếm nguyên liệu này
    const ing = ingById.get(r.ingredient_id);
    if (!ing || !ing.must_count) continue;
    if (!p.ok) {
      await setFlash("error", `Số đếm của "${ing.name}" không hợp lệ.`);
      return;
    }
    // Đếm theo đơn vị nhập (thùng, kg) hoặc đơn vị trừ kho (chai, g) — người đếm chọn trên dòng (P26).
    const unit: CountUnit = r.unit === "base" ? "base" : "purchase";
    lines.push({ ingredient_id: ing.id as string, counted_base: countToBase(p.value, unit, Number(ing.purchase_factor ?? 1)), unit });
  }
  if (lines.length === 0) {
    await setFlash("error", "Chưa nhập số đếm nào.");
    return;
  }
  const { data, error } = await supabase.rpc("complete_stock_count", { p_tenant: tenantId, p_lines: lines, p_redo_of: redoOf });
  revalidatePath(invPath(slug), "layout");
  if (error || !data?.[0]) {
    const conflicts = parseLockDetail(error?.message, error?.details);
    await setFlash("error", conflicts ? lockMessage(conflicts, "Không hoàn thành được kiểm kê") : countErrorMessage(error?.message));
    return;
  }
  await setFlash("ok", `Đã cân bằng kho — phiếu ${(data[0] as { code: string }).code}, ${lines.length} nguyên liệu.`);
  if (redoOf) redirect(`${invPath(slug)}/count`);
}

/** "Hủy" phiếu kiểm kê (P34 INV-21): tồn về số theo sổ, giữ số đếm để Hoàn thành lại. */
export async function cancelCount(fd: FormData) {
  const slug = String(fd.get("slug") ?? "");
  await requireInventoryManager(slug);
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_stock_count", { p_count: String(fd.get("id") ?? "") });
  revalidatePath(invPath(slug), "layout");
  if (error) {
    const conflicts = parseLockDetail(error.message, error.details);
    await setFlash("error", conflicts ? lockMessage(conflicts, "Không hủy được — có phiếu kiểm kê sau nó") : countErrorMessage(error.message));
    return;
  }
  await setFlash("ok", "Đã hủy phiếu kiểm kê — tồn về số theo sổ. Ghi phiếu còn thiếu rồi bấm \"Hoàn thành lại\".");
}

function countErrorMessage(raw: string | undefined | null): string {
  const m = raw ?? "";
  const map: [string, string][] = [
    ["ngay_da_chot", "Ngày này đã chốt sổ — phiếu kiểm kê không đổi được nữa."],
    ["da_hoan_thanh_lai", "Phiếu này đã được hoàn thành lại rồi."],
    ["da_huy", "Phiếu kiểm kê đã hủy trước đó."],
    ["khong_tim_thay", "Không tìm thấy phiếu kiểm kê."],
    ["dong_khong_hop_le", "Có dòng không hợp lệ."],
    ["khong du quyen", "Không đủ quyền."],
  ];
  return map.find(([k]) => m.includes(k))?.[1] ?? `Ghi kiểm kê lỗi: ${m}`;
}

/** Phiếu kiểm kê đã cân bằng có giờ ≥ `at` của các nguyên liệu này (mốc khóa, QD-034 D2). */
async function lockConflicts(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
  ingredientIds: string[],
  at: string
) {
  const { data, error } = await supabase.rpc("inventory_lock_conflicts", {
    p_tenant: tenantId,
    p_ingredients: ingredientIds,
    p_at: at,
  });
  if (error) throw new Error(error.message);
  return toConflicts((data ?? []) as LockRow[]);
}

const WASTE_REASONS = ["hong", "do_bo", "com_nhan_vien", "khac"] as const;

/** Xuất hủy có lý do (INV-08). Lý do bắt buộc; "khác" phải có ghi chú. */
export async function recordWaste(fd: FormData) {
  const slug = String(fd.get("slug") ?? "");
  const session = await requireInventoryManager(slug);
  const tenantId = session.tenant.id;
  const ingredientId = String(fd.get("ingredient_id") ?? "");
  const reason = String(fd.get("reason") ?? "") as (typeof WASTE_REASONS)[number];
  const note = String(fd.get("note") ?? "").trim() || null;
  const qty = parseQty(String(fd.get("qty") ?? ""));
  if (!ingredientId || qty === null) {
    await setFlash("error", "Chọn nguyên liệu và nhập lượng hủy.");
    return;
  }
  if (!WASTE_REASONS.includes(reason)) {
    await setFlash("error", "Chọn lý do hủy.");
    return;
  }
  if (reason === "khac" && !note) {
    await setFlash("error", "Lý do \"Khác\" cần ghi chú.");
    return;
  }

  const supabase = await createClient();
  const { data: ing } = await supabase
    .from("ingredients")
    .select("id, name, purchase_factor")
    .eq("tenant_id", tenantId)
    .eq("id", ingredientId)
    .maybeSingle();
  if (!ing) {
    await setFlash("error", "Không tìm thấy nguyên liệu.");
    return;
  }
  const { error } = await supabase.from("stock_entries").insert({
    tenant_id: tenantId,
    business_date: businessDate(),
    ingredient_id: ingredientId,
    kind: "waste",
    qty: -toBaseQty(qty, Number(ing.purchase_factor ?? 1)),
    reason,
    note,
    created_by: session.membershipId,
  });
  revalidatePath(invPath(slug), "layout");
  await setFlash(error ? "error" : "ok", error ? error.message : `Đã ghi hủy ${ing.name}.`);
}

/**
 * Ngày kho đã có bản chốt → không xóa dòng sổ của ngày đó nữa (bản chốt bất biến, QD-017 D7). Màn chỉ hiện phiếu các ngày
 * CHƯA chốt (P34: 7 ngày); kiểm lại ở server phòng mở trang trước lúc ngày đó tự chốt.
 */
async function dayClosed(supabase: Awaited<ReturnType<typeof createClient>>, tenantId: string, day: string) {
  const { count } = await supabase
    .from("daily_closes")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .gte("business_date", day);
  return (count ?? 0) > 0;
}

/**
 * "Hủy" phiếu xuất hủy ghi nhầm (P26, như KiotViet "Xuất hủy → Hủy": cộng lại tồn kho). Xóa dòng sổ của ngày chưa chốt —
 * cùng cách hủy phiếu nhập khi ngày kho chưa chốt (QD-027 D5). Phiếu nằm trước một lần kiểm kê của cùng nguyên liệu → chặn
 * (P34 mốc khóa): xóa nó làm độ lệch của lần đếm đó sai.
 */
export async function cancelWaste(fd: FormData) {
  const slug = String(fd.get("slug") ?? "");
  const session = await requireInventoryManager(slug);
  const tenantId = session.tenant.id;
  const supabase = await createClient();
  const { data: row } = await supabase
    .from("stock_entries")
    .select("id, business_date, kind, ingredient_id, occurred_at")
    .eq("tenant_id", tenantId)
    .eq("id", String(fd.get("id") ?? ""))
    .maybeSingle();
  if (!row || row.kind !== "waste") {
    await setFlash("error", "Không tìm thấy phiếu hủy.");
    return;
  }
  if (await dayClosed(supabase, tenantId, row.business_date as string)) {
    await setFlash("error", "Ngày này đã chốt sổ — không hủy được phiếu nữa. Sai lệch sẽ hiện ở lần kiểm kê sau.");
    return;
  }
  const conflicts = await lockConflicts(supabase, tenantId, [row.ingredient_id as string], row.occurred_at as string);
  if (conflicts.length > 0) {
    await setFlash("error", lockMessage(conflicts, "Không hủy được phiếu hủy"));
    return;
  }
  const { error } = await supabase.from("stock_entries").delete().eq("tenant_id", tenantId).eq("id", row.id);
  revalidatePath(invPath(slug), "layout");
  await setFlash(error ? "error" : "ok", error ? error.message : "Đã hủy phiếu hủy — tồn kho được cộng lại.");
}

/**
 * "Hủy" mẻ chế biến ghi nhầm (P26, như KiotViet "Sản xuất → Hủy": trả lại nguyên liệu, trừ bán thành phẩm). Xóa mẻ → dòng
 * sổ batch_in / batch_out đi theo (on delete cascade), hụt mẻ cũng mất vì tính từ production_batches.
 */
export async function cancelBatch(fd: FormData) {
  const slug = String(fd.get("slug") ?? "");
  const session = await requireInventoryManager(slug);
  const tenantId = session.tenant.id;
  const supabase = await createClient();
  const { data: batch } = await supabase
    .from("production_batches")
    .select("id, business_date")
    .eq("tenant_id", tenantId)
    .eq("id", String(fd.get("id") ?? ""))
    .maybeSingle();
  if (!batch) {
    await setFlash("error", "Không tìm thấy mẻ chế biến.");
    return;
  }
  if (await dayClosed(supabase, tenantId, batch.business_date as string)) {
    await setFlash("error", "Ngày này đã chốt sổ — không hủy được mẻ nữa.");
    return;
  }
  const { data: lines } = await supabase
    .from("stock_entries")
    .select("ingredient_id, occurred_at")
    .eq("tenant_id", tenantId)
    .eq("batch_id", batch.id);
  if (lines && lines.length > 0) {
    const at = lines.map((l) => l.occurred_at as string).sort()[0];
    const conflicts = await lockConflicts(supabase, tenantId, [...new Set(lines.map((l) => l.ingredient_id as string))], at);
    if (conflicts.length > 0) {
      await setFlash("error", lockMessage(conflicts, "Không hủy được mẻ"));
      return;
    }
  }
  const { error } = await supabase.from("production_batches").delete().eq("tenant_id", tenantId).eq("id", batch.id);
  revalidatePath(invPath(slug), "layout");
  await setFlash(error ? "error" : "ok", error ? error.message : "Đã hủy mẻ — nguyên liệu được trả lại, bán thành phẩm bị trừ.");
}
