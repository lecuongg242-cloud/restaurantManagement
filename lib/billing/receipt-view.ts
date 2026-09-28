/**
 * Dựng nội dung hóa đơn khách để in (04-04, PRINT-03, §7). Từ SNAPSHOT bill/bill_items — không
 * join lại menu. Con chia đều: không có dòng món, hiển thị mô tả phần chia. Chạy server (RLS NV).
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { parseSettings } from "@/lib/tenant/settings";
import { orderPlaceLabel } from "@/lib/orders/place-label";
import type { OrderChannel, OrderSource } from "@/lib/orders/types";
import { getBillView } from "./bill";
import type { PaymentMethod } from "./types";
import { urlAnh } from "@/lib/storage/public-url";
import { dungTransferQr, type TransferQr } from "./transfer-qr";

export type ReceiptView = {
  tenantName: string;
  logoUrl: string | null;
  billNo: number | null;
  tableLabel: string;
  contactLine: string | null; // đơn online: tên · SĐT · (địa chỉ nếu giao)
  dateTime: string | null;
  isChild: boolean;
  childNote: string | null;
  lines: {
    name: string;
    qty: number;
    unitPrice: number;
    amount: number;
    modifiers: string[];
    note: string | null;
  }[];
  subtotal: number;
  discountAmount: number;
  serviceChargePct: number;
  serviceChargeAmount: number;
  vatPct: number;
  vatAmount: number;
  total: number;
  payment: { method: PaymentMethod; amount: number } | null;
  footer: string;
  /** QR chuyển khoản (PAY-03) — chỉ có khi quán khai tài khoản, bật in QR, bill còn mở, tổng > 0. */
  transferQr?: TransferQr;
};

/** Tên bàn từ table_session_id; gộp nhiều bàn (null) → "Gộp bàn". */
async function tableLabelFor(
  client: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
  tableSessionId: string | null
): Promise<string> {
  if (!tableSessionId) return "Gộp bàn";
  const { data } = await client
    .from("table_sessions")
    .select("tables(name)")
    .eq("id", tableSessionId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const t = data?.tables as { name?: string } | null;
  return t?.name ? `Bàn ${t.name}` : "—";
}

export async function buildReceiptView(billId: string, tenantId: string): Promise<ReceiptView | null> {
  const bill = await getBillView(tenantId, billId);
  if (!bill) return null;

  const client = await createClient();
  const [{ data: tenant }, { data: tenantSettings }] = await Promise.all([
    client.from("tenants").select("name, logo_url, settings").eq("id", tenantId).maybeSingle(),
    client.from("tenants").select("settings").eq("id", tenantId).maybeSingle(),
  ]);
  const settings = parseSettings(tenantSettings?.settings);
  const footer = settings.receipt_footer;

  const isChild = bill.splitParentId != null;

  // Đơn online: nhãn = kênh + dòng liên hệ khách; else nhãn bàn (dine-in / gộp).
  const { data: billMeta } = await client
    .from("bills")
    .select("online_order_id, created_at")
    .eq("id", billId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  let tableLabel: string;
  let contactLine: string | null = null;
  if (billMeta?.online_order_id) {
    const { data: order } = await client
      .from("orders")
      .select("channel, source, customer_contact")
      .eq("id", billMeta.online_order_id as string)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    const ch = order?.channel as string | undefined;
    tableLabel = orderPlaceLabel({
      serviceMode: settings.service_mode,
      channel: (ch as OrderChannel) ?? "takeaway",
      source: order?.source as OrderSource,
    });
    const c = (order?.customer_contact ?? {}) as { name?: string; phone?: string; address?: string };
    const parts = [c.name, c.phone].filter(Boolean) as string[];
    if (ch === "delivery" && c.address) parts.push(c.address);
    contactLine = parts.length > 0 ? parts.join(" · ") : null;
  } else {
    // Con chia đều: nhãn bàn suy từ chính table_session_id của con (giữ của cha).
    tableLabel = await tableLabelFor(client, tenantId, bill.tableSessionId);
  }

  const lastPayment = bill.payments.length > 0 ? bill.payments[bill.payments.length - 1] : null;

  const view: ReceiptView = {
    tenantName: tenant?.name ?? "Nhà hàng",
    logoUrl: urlAnh(tenant?.logo_url as string | null),
    billNo: bill.billNo,
    tableLabel,
    contactLine,
    dateTime: bill.paidAt,
    isChild,
    childNote: isChild ? bill.note : null,
    lines: bill.lines.map((l) => ({
      name: l.name,
      qty: l.qty,
      unitPrice: l.unitPrice,
      amount: l.amount,
      modifiers: l.modifiers,
      note: l.note,
    })),
    subtotal: bill.totals.subtotal,
    discountAmount: bill.totals.discountAmount,
    serviceChargePct: bill.serviceChargePct,
    serviceChargeAmount: bill.totals.serviceChargeAmount,
    vatPct: bill.vatPct,
    vatAmount: bill.totals.vatAmount,
    total: bill.totals.total,
    payment: lastPayment ? { method: lastPayment.method, amount: lastPayment.amount } : null,
    footer,
  };

  // Số tiền trên QR lấy từ `view.total` — đúng con số in trên giấy, không tính lại.
  const transferQr = dungTransferQr({
    settings,
    status: bill.status,
    isSplitContainer: bill.splitCount != null,
    total: view.total,
    billNo: bill.billNo,
    createdAt: (billMeta?.created_at as string | null) ?? null,
  });
  // Không có QR thì không có khóa — view model của quán chưa khai tài khoản giữ nguyên như trước.
  return transferQr ? { ...view, transferQr } : view;
}
