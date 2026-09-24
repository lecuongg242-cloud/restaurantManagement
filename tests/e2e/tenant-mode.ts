import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });
config();

/**
 * Đặt `service_mode` của tenant demo trước khi chạy E2E.
 *
 * VÌ SAO CẦN: `p3.spec` và `order15-mobile.spec` thao tác trên SƠ ĐỒ BÀN ở POS. Sơ đồ đó chỉ render
 * khi quán ở chế độ bàn — `PosBoard` có `{!counter && <aside><TableMap/></aside>}`. Ai đó đã chuyển
 * `pho-viet` sang `service_mode: "counter"` (có lẽ khi làm QD-011) và hai bộ test đỏ từ đó, với
 * triệu chứng khó đoán: "không tìm thấy nút B1".
 *
 * Test phải tự dựng điều kiện của mình thay vì phụ thuộc trạng thái sẵn có của một tenant dùng
 * chung — nếu không thì mỗi lần ai đó đổi cài đặt là test đỏ vì lý do chẳng liên quan gì tới đoạn
 * code đang kiểm.
 */
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

/** Chỉ cho phép đụng tenant demo — DB này dùng chung với nhà hàng đang hoạt động thật. */
const DEMO_SLUGS = new Set(["pho-viet", "bun-bo"]);

export type ServiceMode = "table" | "counter";

function admin() {
  if (!URL || !SERVICE) {
    throw new Error("E2E cần NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY trong .env.local");
  }
  return createClient(URL, SERVICE, { auth: { persistSession: false } });
}

/** Đọc `service_mode` hiện tại để `afterAll` trả lại đúng như cũ. */
export async function getServiceMode(slug: string): Promise<ServiceMode> {
  const { data } = await admin().from("tenants").select("settings").eq("slug", slug).maybeSingle();
  const raw = (data?.settings as { service_mode?: string } | null)?.service_mode;
  return raw === "counter" ? "counter" : "table";
}

export async function setServiceMode(slug: string, mode: ServiceMode): Promise<void> {
  if (!DEMO_SLUGS.has(slug)) {
    throw new Error(`Từ chối đổi cài đặt "${slug}" — chỉ cho phép tenant demo.`);
  }
  const c = admin();
  const { data } = await c.from("tenants").select("id, settings").eq("slug", slug).maybeSingle();
  if (!data) throw new Error(`Không tìm thấy tenant ${slug}`);

  const settings = { ...((data.settings as Record<string, unknown>) ?? {}), service_mode: mode };
  const { error } = await c.from("tenants").update({ settings }).eq("id", data.id);
  if (error) throw error;
}
