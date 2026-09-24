/**
 * Hai quyết định server đưa ra khi nhân viên bấm "Phiếu bếp" (09-03). Nhận client từ nơi gọi để
 * chạy bằng ĐÚNG quyền của nhân viên — RLS quyết định, không phải service-role.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { cauInConSong } from "@/lib/print/cau-in";

/**
 * Cầu in của quán còn sống không (PRINT-08). Không → server từ chối xếp phiếu vào hàng đợi, và
 * đường lui sẵn có của POS in bằng trình duyệt.
 *
 * Đọc lỗi → coi như chết. Không xác nhận được cầu in còn sống thì in trình duyệt là phía an toàn:
 * phiếu vẫn ra giấy (ở máy quầy), còn xếp vào hàng đợi có thể không ai lấy — đúng lỗi 24/09.
 */
export async function cauInConSongCua(client: SupabaseClient, tenantId: string): Promise<boolean> {
  const { data, error } = await client
    .from("printer_heartbeats")
    .select("seen_at")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) return false;
  return cauInConSong(data?.seen_at ?? null, Date.now());
}

/**
 * In lại một phiếu bếp → các lượt CÒN `pending` của cùng đơn chuyển `superseded` (PRINT-06), để cầu
 * in sống lại không in thêm tờ cũ. Lượt đã in / hỏng giữ nguyên — không viết lại lịch sử.
 *
 * Còn một khe hẹp: cầu in đã lấy phiếu và đang gửi (~1 giây) đúng lúc này thì vẫn có thể ra hai
 * tờ. Chấp nhận — khe cũ là cả khoảng thời gian cầu in chết.
 */
export async function thayTheLuotDangCho(
  client: SupabaseClient,
  tenantId: string,
  orderId: string
): Promise<void> {
  await client
    .from("print_jobs")
    .update({ status: "superseded" })
    .eq("tenant_id", tenantId)
    .eq("type", "kitchen_ticket")
    .eq("status", "pending")
    .contains("payload", { orderId });
}
