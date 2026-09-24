/**
 * Hai quyết định server đưa ra khi nhân viên bấm "Phiếu bếp" (09-03). Nhận client từ nơi gọi để
 * chạy bằng ĐÚNG quyền của nhân viên — RLS quyết định, không phải service-role.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { cauInConSong, NGUONG_QUA_HAN_MS } from "@/lib/print/cau-in";

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

export type DemHomNay = {
  daIn: number;
  loi: number;
  /** Đang chờ cầu in, còn trong hạn. */
  dangCho: number;
  /** Chờ quá hạn (PRINT-06) — cầu in không nhận. */
  ket: number;
  inGanNhat: string | null;
  loiGanDay: { luc: string; soDon: number | null }[];
};

/**
 * Khối "Hôm nay" trên màn Máy in (PRINT-09), phiếu bếp tạo từ `tuUtc`.
 *
 * Đếm bằng truy vấn ĐẾM của database (`count: exact, head: true`), không tải danh sách về rồi đếm:
 * PostgREST trả tối đa 1.000 dòng mỗi lần, và ngày đông quá số đó thì màn hình đếm THIẾU mà không
 * báo gì — REPORT-04 từng dính đúng lỗi này. Lượt `superseded` không tính: nó đã được thay bằng
 * lượt in lại.
 */
export async function demPhieuHomNay(
  client: SupabaseClient,
  tenantId: string,
  tuUtc: string
): Promise<DemHomNay> {
  const mocKet = new Date(Date.now() - NGUONG_QUA_HAN_MS).toISOString();
  const dem = () =>
    client
      .from("print_jobs")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("type", "kitchen_ticket")
      .gte("created_at", tuUtc);
  const loc = (cot: string) =>
    client
      .from("print_jobs")
      .select(cot)
      .eq("tenant_id", tenantId)
      .eq("type", "kitchen_ticket")
      .gte("created_at", tuUtc);

  const [daIn, loi, dangCho, ket, ganNhat, cacLoi] = await Promise.all([
    dem().eq("status", "printed"),
    dem().eq("status", "failed"),
    dem().eq("status", "pending").gte("created_at", mocKet),
    dem().eq("status", "pending").lt("created_at", mocKet),
    loc("printed_at, created_at")
      .eq("status", "printed")
      .order("created_at", { ascending: false })
      .limit(1),
    loc("created_at, kitchen_no:payload->kitchenNo")
      .eq("status", "failed")
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const gan = (ganNhat.data?.[0] ?? null) as { printed_at: string | null; created_at: string } | null;
  const loiRows = (cacLoi.data ?? []) as unknown as { created_at: string; kitchen_no: number | null }[];
  return {
    daIn: daIn.count ?? 0,
    loi: loi.count ?? 0,
    dangCho: dangCho.count ?? 0,
    ket: ket.count ?? 0,
    inGanNhat: gan ? gan.printed_at ?? gan.created_at : null,
    loiGanDay: loiRows.map((r) => ({ luc: r.created_at, soDon: r.kitchen_no ?? null })),
  };
}
