/**
 * POST /r/[slug]/api/call — khách QR "Gọi nhân viên" (CALL-01). Khách ẩn danh (D15), không cookie.
 * Body: { qrToken }. Resolve token → bàn → insert staff_calls (service role) với dedupe 45s.
 */
import { NextResponse } from "next/server";
import { createStaffCall } from "@/lib/orders/staff-calls";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Dữ liệu gửi lên không hợp lệ." }, { status: 400 });
  }

  const b = (body ?? {}) as { qrToken?: unknown; note?: unknown };
  const qrToken = typeof b.qrToken === "string" ? b.qrToken : "";
  const note = typeof b.note === "string" ? b.note : "";

  const result = await createStaffCall(slug, qrToken, note);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true, already: result.already ?? false }, { status: 200 });
}
