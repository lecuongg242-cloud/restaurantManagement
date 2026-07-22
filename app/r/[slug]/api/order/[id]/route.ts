/**
 * GET /r/[slug]/api/order/[id] — trạng thái order cho trang theo dõi (khách ẩn danh).
 * Scope: id (uuid không đoán được) + slug phải khớp tenant của order → không rò dữ liệu
 * tenant khác. KHÔNG trả cột nhạy cảm; chỉ đủ dựng stepper + danh sách món snapshot.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  const { slug, id } = await params;
  const admin = createAdminClient();

  const { data: tenant } = await admin
    .from("tenants")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (!tenant) return NextResponse.json({ error: "Không tìm thấy." }, { status: 404 });

  const { data: order } = await admin
    .from("orders")
    .select("id, tenant_id, status, channel, note, cancel_reason, created_at")
    .eq("id", id)
    .maybeSingle();
  if (!order || order.tenant_id !== tenant.id) {
    return NextResponse.json({ error: "Không tìm thấy đơn." }, { status: 404 });
  }

  const { data: items } = await admin
    .from("order_items")
    .select("id, name_snapshot, unit_price_snapshot, qty, status")
    .eq("order_id", id)
    .order("created_at", { ascending: true });

  const itemIds = (items ?? []).map((i) => i.id);
  const { data: mods } = itemIds.length
    ? await admin
        .from("order_item_modifiers")
        .select("order_item_id, name_snapshot, price_delta_snapshot")
        .in("order_item_id", itemIds)
    : { data: [] };

  const modsByItem = new Map<string, { name_snapshot: string; price_delta_snapshot: number }[]>();
  for (const m of mods ?? []) {
    const arr = modsByItem.get(m.order_item_id) ?? [];
    arr.push({ name_snapshot: m.name_snapshot, price_delta_snapshot: m.price_delta_snapshot });
    modsByItem.set(m.order_item_id, arr);
  }

  return NextResponse.json({
    id: order.id,
    status: order.status,
    channel: order.channel,
    note: order.note,
    cancel_reason: order.cancel_reason,
    created_at: order.created_at,
    items: (items ?? []).map((i) => ({
      id: i.id,
      name: i.name_snapshot,
      unit_price: i.unit_price_snapshot,
      qty: i.qty,
      status: i.status,
      modifiers: modsByItem.get(i.id) ?? [],
    })),
  });
}
