/**
 * Nguồn cầu in từ cột `printer_heartbeats.agent` (0075, DESK-05): app Windows "TechMenu Thu ngân" báo `app/<phiên
 * bản>`, cầu in cũ (tác vụ `CauInBep` cài bằng CAI-DAT.bat) không báo gì. Thuần hàm để test được.
 */
export function nguonCauIn(agent: string | null | undefined): string {
  const m = typeof agent === "string" ? agent.match(/^(app|android)\/([0-9A-Za-z.+-]{1,30})$/) : null;
  if (!m) return "Cầu in cũ (CAI-DAT.bat)";
  // App Android (P24 24-03) báo `android/<phiên bản>` — tablet / máy POS Android làm trạm in.
  return m[1] === "android" ? `TechMenu Thu ngân Android ${m[2]}` : `TechMenu Thu ngân ${m[2]}`;
}

/**
 * Đọc `agent` theo quán — RIÊNG khỏi truy vấn nhịp tim chính và nuốt lỗi: máy chủ chưa áp 0075 (chưa có cột) thì màn
 * Máy in / bảng /super vẫn chạy, chỉ không hiện dòng nguồn.
 */
export async function docNguonCauIn(
  truyVan: PromiseLike<{ data: { tenant_id: string; agent: string | null }[] | null; error: unknown }>
): Promise<Map<string, string | null> | null> {
  try {
    const { data, error } = await truyVan;
    if (error || !data) return null;
    return new Map(data.map((r) => [r.tenant_id, r.agent]));
  } catch {
    return null;
  }
}
