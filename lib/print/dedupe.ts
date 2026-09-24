import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Chống ghi trùng một lượt in (BUG "bấm in một lần nhưng ra nhiều tờ").
 *
 * VÌ SAO CẦN: việc in đang gắn với "trang in được mở" chứ không gắn với "người bấm in". Mọi lần
 * remount — tải lại trang, mở lại tab, đổi khổ giấy — đều ghi thêm một lượt VÀ gọi `window.print()`
 * thêm lần nữa. Ở đường cầu in thì tệ hơn: mỗi lượt là một tờ giấy thật ra ở bếp.
 *
 * VÌ SAO 3 GIÂY: dữ liệu thật của qt-food (24/09/2026) cho thấy hai cụm tách bạch —
 *   • double-fire:      0,63 – 2 giây
 *   • in lại CÓ CHỦ Ý:  dồn ở > 10 giây (giấy kẹt, in mờ, khách đòi thêm bản)
 * Ba giây nằm gọn trong khoảng trống giữa hai cụm: chặn được lỗi mà không chặn ý định. Đặt ngưỡng
 * cao hơn (vd 30 giây) sẽ nuốt mất lượt in lại thật của nhân viên — và họ sẽ không hiểu vì sao
 * bấm mà không ra giấy.
 */
export const CUA_SO_TRUNG_MS = 3000;

/**
 * Đã có lượt in y hệt trong `CUA_SO_TRUNG_MS` gần đây chưa?
 *
 * `khoa` là thứ định danh phiếu trong payload — `orderId` với phiếu bếp/phiếu khách, `billId` với
 * hóa đơn. So bằng `payload->>` nên không cần thêm cột.
 */
export async function daInGanDay(
  client: SupabaseClient,
  tenantId: string,
  type: string,
  khoa: "orderId" | "billId",
  giaTri: string
): Promise<boolean> {
  const tu = new Date(Date.now() - CUA_SO_TRUNG_MS).toISOString();
  const { data, error } = await client
    .from("print_jobs")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("type", type)
    .filter(`payload->>${khoa}`, "eq", giaTri)
    .gte("created_at", tu)
    .limit(1);

  // Lỗi hạ tầng → KHÔNG chặn. Thà ghi trùng một lượt còn hơn nuốt mất phiếu bếp của bàn đang chờ:
  // in thừa thì nhân viên bỏ tờ giấy, in thiếu thì bếp không biết mà làm.
  if (error) return false;
  return (data ?? []).length > 0;
}
