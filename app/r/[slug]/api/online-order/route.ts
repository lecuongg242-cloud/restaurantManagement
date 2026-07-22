/**
 * POST /r/[slug]/api/online-order — tạo đơn mang về/giao cho khách ẩn danh (D15).
 * Không cookie phiên. Validate + snapshot ở server (online.ts → create-order.ts).
 */
import { NextResponse } from "next/server";
import { createOnlineOrder, type OnlineChannel } from "@/lib/orders/online";
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
    channel?: unknown;
    lines?: unknown;
    note?: unknown;
    customerName?: unknown;
    customerPhone?: unknown;
    address?: unknown;
  };

  const channel: OnlineChannel = b.channel === "delivery" ? "delivery" : "takeaway";
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

  const result = await createOnlineOrder({
    slug,
    channel,
    lines,
    note: typeof b.note === "string" ? b.note : undefined,
    customerName: typeof b.customerName === "string" ? b.customerName : undefined,
    customerPhone: typeof b.customerPhone === "string" ? b.customerPhone : undefined,
    address: typeof b.address === "string" ? b.address : undefined,
  });

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ orderId: result.orderId }, { status: 200 });
}
