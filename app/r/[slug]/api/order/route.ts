/**
 * POST /r/[slug]/api/order — tạo order cho khách ẩn danh (D15).
 * Không dùng cookie phiên. Validate + snapshot ở server (create-order.ts).
 */
import { NextResponse } from "next/server";
import { createQrOrder } from "@/lib/orders/create-order";
import type { OrderLineInput } from "@/lib/orders/types";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Dữ liệu gửi lên không hợp lệ." }, { status: 400 });
  }

  const b = (body ?? {}) as {
    qrToken?: unknown;
    lines?: unknown;
    note?: unknown;
    customerName?: unknown;
    customerPhone?: unknown;
    idempotencyKey?: unknown;
  };
  const qrToken = typeof b.qrToken === "string" ? b.qrToken : "";
  const note = typeof b.note === "string" ? b.note : undefined;
  const customerName = typeof b.customerName === "string" ? b.customerName : undefined;
  const customerPhone = typeof b.customerPhone === "string" ? b.customerPhone : undefined;
  const lines: OrderLineInput[] = Array.isArray(b.lines)
    ? (b.lines as unknown[]).map((l) => {
        const o = (l ?? {}) as Record<string, unknown>;
        return {
          itemId: typeof o.itemId === "string" ? o.itemId : "",
          qty: Number(o.qty),
          note: typeof o.note === "string" ? o.note : undefined,
          optionIds: Array.isArray(o.optionIds)
            ? (o.optionIds as unknown[]).filter((x): x is string => typeof x === "string")
            : [],
        };
      })
    : [];

  // Khóa idempotent do máy khách sinh (0034): khách bấm "Gửi đơn" trên 3G chập chờn, mất phản hồi
  // rồi bấm lại thì bếp không nhận hai lần. `createQrOrder` tự lọc giá trị không phải uuid.
  const idempotencyKey = typeof b.idempotencyKey === "string" ? b.idempotencyKey : undefined;

  const result = await createQrOrder({
    slug,
    qrToken,
    lines,
    note,
    customerName,
    customerPhone,
    idempotencyKey,
  });
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ orderId: result.orderId }, { status: 200 });
}
