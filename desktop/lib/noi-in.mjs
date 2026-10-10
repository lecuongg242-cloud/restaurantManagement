// desktop/lib/noi-in.mjs — danh sách bếp/bar của quán cho màn Cài đặt máy in (P37, PRINT-21).
//
// Bếp/bar + nhóm món khai trên web (Quản trị › Máy in › Bếp / Bar); máy quầy chỉ chọn máy in cho từng nơi. Đọc bằng
// tài khoản `printer` của máy (RLS chỉ trả bếp/bar của đúng quán). Không import electron: test được bằng vitest.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Dòng DB → [{ id, ten, macDinh }], Bếp chính đầu tiên (quán chưa lưu bếp/bar nào → Bếp chính ngầm, id ""). */
export function chuanHoaDanhSachNoi(rows) {
  const all = (Array.isArray(rows) ? rows : [])
    .filter((r) => r && typeof r.name === "string" && (r.is_default || UUID.test(String(r.id))))
    .map((r) => ({ id: r.is_default ? "" : String(r.id), ten: r.name.slice(0, 30), macDinh: Boolean(r.is_default) }));
  const macDinh = all.find((n) => n.macDinh) ?? { id: "", ten: "Bếp chính", macDinh: true };
  return [macDinh, ...all.filter((n) => !n.macDinh)];
}

/**
 * @param {{ supabaseUrl: string, anonKey: string, email: string, matKhau: string }} tk
 * @param {typeof fetch} [f]
 */
export async function taiDanhSachNoi(tk, f = fetch) {
  const goc = String(tk.supabaseUrl).replace(/\/+$/, "");
  const dauChung = { apikey: tk.anonKey, "Content-Type": "application/json" };
  const dn = await f(`${goc}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: dauChung,
    body: JSON.stringify({ email: tk.email, password: tk.matKhau }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!dn.ok) throw new Error(`đăng nhập HTTP ${dn.status}`);
  const { access_token: token } = await dn.json();
  const res = await f(
    `${goc}/rest/v1/kitchen_stations?select=id,name,is_default&order=sort_order.asc,created_at.asc`,
    { headers: { ...dauChung, Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) }
  );
  if (!res.ok) throw new Error(`đọc bếp/bar HTTP ${res.status}`);
  return chuanHoaDanhSachNoi(await res.json());
}

/** `mayIn.noi` hợp lệ: chỉ khóa uuid, chỉ máy in LAN (máy bếp/bar đặt xa máy quầy). */
export function chuanHoaMayNoi(noi, chuanHoaMayIn) {
  const out = {};
  if (!noi || typeof noi !== "object") return out;
  for (const [id, m] of Object.entries(noi)) {
    if (!UUID.test(id)) continue;
    const may = chuanHoaMayIn(m);
    if (may?.kieu === "lan") out[id] = may;
  }
  return out;
}
