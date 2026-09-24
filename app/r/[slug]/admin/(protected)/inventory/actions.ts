"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionMembership } from "@/lib/auth/session";
import { canManage } from "@/lib/auth/rbac";
import { setFlash } from "@/lib/flash";
import { parseQty, toBaseQty, unitCostFromPurchase } from "@/lib/inventory/units";
import { businessDate } from "@/lib/inventory/day";
import { planBatch } from "@/lib/inventory/batch";
import { loadInventory, costContext } from "@/lib/inventory/data";
import { checkRecipeChange, MAX_DEPTH } from "@/lib/inventory/recipe-graph";
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

const BASE_UNITS: BaseUnit[] = ["g", "ml", "cai"];

type IngredientFields = {
  name: string;
  kind: IngredientKind;
  base_unit: BaseUnit;
  purchase_unit: string | null;
  purchase_factor: number;
  yield_pct: number;
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
  const purchase_factor = purchase_unit ? parseQty(factorRaw) : 1;
  if (purchase_factor === null) return `1 ${purchase_unit} bằng bao nhiêu ${base_unit}? Hệ số phải lớn hơn 0.`;

  const yieldRaw = String(fd.get("yield_pct") ?? "").trim();
  const yield_pct = kind === "prepared" || !yieldRaw ? 100 : Math.round(Number(yieldRaw));
  if (!(yield_pct >= 1 && yield_pct <= 100)) return "Tỷ lệ dùng được phải từ 1 đến 100%.";

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
    yield_pct,
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

export async function createIngredient(fd: FormData) {
  const slug = String(fd.get("slug") ?? "");
  const session = await requireInventoryManager(slug);
  const fields = readIngredient(fd);
  if (typeof fields === "string") {
    await setFlash("error", fields);
    return;
  }
  const price = fields.kind === "purchased" ? readPrice(fd, fields.purchase_factor) : null;

  const supabase = await createClient();
  const { error } = await supabase.from("ingredients").insert({
    tenant_id: session.tenant.id,
    ...fields,
    ...(price !== null ? { last_unit_cost: price, last_cost_at: new Date().toISOString() } : {}),
  });
  revalidatePath(invPath(slug), "layout");
  await setFlash(
    error ? "error" : "ok",
    error
      ? error.code === "23505"
        ? `Đã có nguyên liệu tên "${fields.name}".`
        : error.message
      : `Đã thêm "${fields.name}".`
  );
}

export async function updateIngredient(fd: FormData) {
  const slug = String(fd.get("slug") ?? "");
  const session = await requireInventoryManager(slug);
  const id = String(fd.get("id") ?? "");
  const fields = readIngredient(fd);
  if (typeof fields === "string") {
    await setFlash("error", fields);
    return;
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
      await setFlash("error", "Nguyên liệu này đang có công thức mẻ — xóa công thức trước khi đổi sang loại mua vào.");
      return;
    }
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
  revalidatePath(invPath(slug), "layout");
  await setFlash(
    error ? "error" : "ok",
    error
      ? error.code === "23505"
        ? `Đã có nguyên liệu tên "${fields.name}".`
        : error.message
      : `Đã lưu "${fields.name}".`
  );
}

/** Ẩn/hiện. Không xóa: dòng định lượng tham chiếu bằng ON DELETE RESTRICT, và sổ kho (10-02) cần tên cũ. */
export async function setIngredientActive(fd: FormData) {
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
      await setFlash("error", `Nguyên liệu đang dùng trong ${count} dòng định lượng — gỡ khỏi các món trước khi ẩn.`);
      return;
    }
  }
  const { error } = await supabase
    .from("ingredients")
    .update({ active, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("tenant_id", session.tenant.id);
  revalidatePath(invPath(slug), "layout");
  await setFlash(error ? "error" : "ok", error ? error.message : active ? "Đã hiện lại." : "Đã ẩn nguyên liệu.");
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
 * Nhập nguyên liệu (INV-04). Mỗi lần gửi = các dòng `receipt` MỚI — nhập lần hai trong ngày là cộng
 * dồn, không sửa dòng cũ. Có giá thì cập nhật giá gần nhất của nguyên liệu.
 */
export async function recordReceipts(fd: FormData) {
  const slug = String(fd.get("slug") ?? "");
  const session = await requireInventoryManager(slug);
  const tenantId = session.tenant.id;

  let parsed: { ingredient_id: string; qty: string; price: string }[];
  try {
    parsed = JSON.parse(String(fd.get("rows") ?? "[]"));
    if (!Array.isArray(parsed)) throw new Error();
  } catch {
    await setFlash("error", "Dữ liệu nhập không hợp lệ.");
    return;
  }

  const supabase = await createClient();
  const { data: ingRows } = await supabase
    .from("ingredients")
    .select("id, name, kind, purchase_factor, purchase_unit")
    .eq("tenant_id", tenantId)
    .eq("active", true);
  const ingById = new Map((ingRows ?? []).map((r) => [r.id as string, r]));

  const day = businessDate();
  const now = new Date().toISOString();
  const entries: Record<string, unknown>[] = [];
  const prices: { id: string; cost: number }[] = [];
  for (const r of parsed) {
    if (!r.ingredient_id || !String(r.qty ?? "").trim()) continue; // dòng để trống = hôm nay không nhập
    const ing = ingById.get(r.ingredient_id);
    if (!ing || ing.kind !== "purchased") {
      await setFlash("error", "Chỉ nhập được nguyên liệu mua vào; bán thành phẩm ghi ở phần Chế biến.");
      return;
    }
    const qty = parseQty(String(r.qty));
    if (qty === null) {
      await setFlash("error", `Số lượng của "${ing.name}" phải là số lớn hơn 0.`);
      return;
    }
    const factor = Number(ing.purchase_factor ?? 1);
    const priceRaw = String(r.price ?? "").replace(/[^\d]/g, "");
    const unit_cost = priceRaw ? unitCostFromPurchase(parseInt(priceRaw, 10), factor) : null;
    entries.push({
      tenant_id: tenantId,
      business_date: day,
      ingredient_id: ing.id,
      kind: "receipt",
      qty: toBaseQty(qty, factor),
      unit_cost,
      created_by: session.membershipId,
    });
    if (unit_cost !== null) prices.push({ id: ing.id as string, cost: unit_cost });
  }

  if (entries.length === 0) {
    await setFlash("error", "Chưa nhập số lượng nào.");
    return;
  }
  const { error } = await supabase.from("stock_entries").insert(entries);
  if (error) {
    await setFlash("error", error.message);
    return;
  }
  for (const p of prices) {
    await supabase
      .from("ingredients")
      .update({ last_unit_cost: p.cost, last_cost_at: now, updated_at: now })
      .eq("id", p.id)
      .eq("tenant_id", tenantId);
  }
  revalidatePath(invPath(slug), "layout");
  await setFlash("ok", `Đã nhập ${entries.length} nguyên liệu.`);
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
 * Kiểm kê (INV-08). Độ lệch = số đếm − tồn lý thuyết TẠI LÚC GỬI, tính lại ở server (không tin số
 * client đưa lên — giữa lúc mở màn và lúc gửi có thể đã bán thêm). Ghi cả độ lệch 0: "đã kiểm, khớp"
 * khác "không kiểm".
 */
export async function recordCounts(fd: FormData) {
  const slug = String(fd.get("slug") ?? "");
  const session = await requireInventoryManager(slug);
  const tenantId = session.tenant.id;

  let parsed: { ingredient_id: string; counted: string }[];
  try {
    parsed = JSON.parse(String(fd.get("rows") ?? "[]"));
    if (!Array.isArray(parsed)) throw new Error();
  } catch {
    await setFlash("error", "Dữ liệu kiểm kê không hợp lệ.");
    return;
  }

  const supabase = await createClient();
  const [{ data: ingRows }, { data: onHand, error: ohErr }] = await Promise.all([
    supabase.from("ingredients").select("id, name, must_count, purchase_factor").eq("tenant_id", tenantId),
    supabase.rpc("inventory_on_hand", { p_tenant: tenantId }),
  ]);
  if (ohErr) {
    await setFlash("error", ohErr.message);
    return;
  }
  const ingById = new Map((ingRows ?? []).map((r) => [r.id as string, r]));
  const theoretical = new Map(
    ((onHand ?? []) as { ingredient_id: string; on_hand: number }[]).map((r) => [r.ingredient_id, Number(r.on_hand)])
  );

  const day = businessDate();
  const entries: Record<string, unknown>[] = [];
  for (const r of parsed) {
    const raw = String(r.counted ?? "").trim();
    if (!raw) continue; // không đếm nguyên liệu này
    const ing = ingById.get(r.ingredient_id);
    if (!ing || !ing.must_count) continue;
    const counted = raw === "0" ? 0 : parseQty(raw);
    if (counted === null) {
      await setFlash("error", `Số đếm của "${ing.name}" không hợp lệ.`);
      return;
    }
    const countedBase = toBaseQty(counted, Number(ing.purchase_factor ?? 1));
    const diff = Math.round((countedBase - (theoretical.get(ing.id as string) ?? 0)) * 1000) / 1000;
    entries.push({
      tenant_id: tenantId,
      business_date: day,
      ingredient_id: ing.id,
      kind: "count_adjust",
      qty: diff,
      note: `đếm ${countedBase}`,
      created_by: session.membershipId,
    });
  }
  if (entries.length === 0) {
    await setFlash("error", "Chưa nhập số đếm nào.");
    return;
  }
  const { error } = await supabase.from("stock_entries").insert(entries);
  revalidatePath(invPath(slug), "layout");
  await setFlash(error ? "error" : "ok", error ? error.message : `Đã ghi kiểm kê ${entries.length} nguyên liệu.`);
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
