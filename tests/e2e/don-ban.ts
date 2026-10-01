import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });
config();

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

/**
 * Dựng điều kiện SẠCH cho các bàn spec này dùng: database dùng chung, lượt chạy đỏ trước đó có thể để lại
 * phiên mở / hóa đơn dở / đơn chờ duyệt — và test sau đó đỏ vì dữ liệu chứ không vì code. Chỉ đụng đúng
 * các bàn của quán DEMO. Hủy (không xóa): lịch sử vẫn còn để đối chiếu.
 */
export async function donBan(tenantId: string, tenBan: string[]) {
  // Database này dùng chung với quán đang bán thật — chỉ cho đụng quán demo.
  const { data: quan } = await admin.from("tenants").select("slug").eq("id", tenantId).maybeSingle();
  if (!quan || !["pho-viet", "bun-bo"].includes(quan.slug)) {
    throw new Error(`Từ chối dọn bàn của quán "${quan?.slug ?? tenantId}" — chỉ cho phép quán demo.`);
  }
  const { data: bans } = await admin.from("tables").select("id").eq("tenant_id", tenantId).in("name", tenBan);
  const banIds = (bans ?? []).map((b) => b.id);
  const { data: phien } = await admin.from("table_sessions").select("id").in("table_id", banIds).eq("status", "open");
  const phienIds = (phien ?? []).map((p) => p.id);
  if (phienIds.length) {
    const { data: don } = await admin
      .from("orders")
      .select("id")
      .in("table_session_id", phienIds)
      .not("status", "in", "(served,cancelled)");
    const donIds = (don ?? []).map((d) => d.id);
    if (donIds.length) {
      await admin
        .from("order_items")
        .update({ status: "cancelled", cancel_reason: "e2e dọn bàn" })
        .in("order_id", donIds)
        .not("status", "in", "(served,cancelled)");
      await admin.from("orders").update({ status: "cancelled", cancel_reason: "e2e dọn bàn" }).in("id", donIds);
    }
    await admin.from("bills").update({ status: "void" }).in("table_session_id", phienIds).eq("status", "open");
    // Hóa đơn GỘP nhiều bàn có table_session_id = null — tìm qua bill_items trỏ tới món của các phiên này.
    const { data: tatCaDon } = await admin.from("orders").select("id").in("table_session_id", phienIds);
    const { data: mon } = await admin
      .from("order_items")
      .select("id")
      .in("order_id", (tatCaDon ?? []).map((d) => d.id));
    const { data: dongBill } = await admin
      .from("bill_items")
      .select("bill_id")
      .in("order_item_id", (mon ?? []).map((m) => m.id));
    const billGop = [...new Set((dongBill ?? []).map((b) => b.bill_id))];
    if (billGop.length) await admin.from("bills").update({ status: "void" }).in("id", billGop).eq("status", "open");
    await admin
      .from("table_sessions")
      .update({ status: "closed", closed_at: new Date().toISOString() })
      .in("id", phienIds);
  }
  // Ghép bàn (P23): gỡ trỏ nhóm của chính các bàn này và của bàn phụ đang trỏ vào phiên vừa đóng.
  await admin.from("tables").update({ status: "available", group_session_id: null }).in("id", banIds);
  if (phienIds.length)
    await admin.from("tables").update({ status: "available", group_session_id: null }).in("group_session_id", phienIds);
}
