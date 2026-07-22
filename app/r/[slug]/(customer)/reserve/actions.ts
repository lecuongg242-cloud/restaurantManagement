"use server";

import { redirect } from "next/navigation";
import { createReservation } from "@/lib/reservations/reservations";

/** Chuẩn hóa giá trị datetime-local (giờ VN, không tz) → ISO có offset +07:00. */
function toVnIso(raw: string): string {
  const s = raw.trim();
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s) ? `${s}:00+07:00` : s;
}

/** Khách gửi yêu cầu đặt bàn (không đăng nhập). Thành công → ?ok=1 (màn cảm ơn). */
export async function submitReservation(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const base = `/r/${slug}/reserve`;

  const result = await createReservation({
    slug,
    customerName: String(formData.get("customer_name") ?? ""),
    customerPhone: String(formData.get("customer_phone") ?? ""),
    partySize: Number(formData.get("party_size") ?? 0),
    reservedAt: toVnIso(String(formData.get("reserved_at") ?? "")),
    note: String(formData.get("note") ?? ""),
    areaId: String(formData.get("area_id") ?? "") || null,
  });

  if ("error" in result) {
    redirect(`${base}?error=${encodeURIComponent(result.error)}`);
  }
  redirect(`${base}?ok=1`);
}
