import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createActivationCode, redeemActivationCode } from "@/lib/print/activation";

/**
 * Kích hoạt máy quầy "TechMenu Thu ngân" bằng email + mật khẩu CHỦ QUÁN (DESK-01, QD-026 D6) — như KiotViet
 * Thu ngân đăng nhập tài khoản ngay trong app, không phải vào Admin tạo mã.
 *
 * Máy có máy in: tạo mã kích hoạt rồi đổi NGAY trong cùng lượt (dùng lại nguyên PRINT-11: xoay mật khẩu
 * `printer`, đặt `print_mode = bridge`). Mã không bao giờ rời server. Máy chỉ xem (màn bếp): chỉ trả quán,
 * không đụng tài khoản `printer` — nếu không, PC ở bếp sẽ cướp cầu in của máy quầy.
 *
 * Tách khỏi route để test được bằng DB thật; route chỉ lo giới hạn tần suất + đăng nhập.
 */

export const LOI_DANG_NHAP = "Email hoặc mật khẩu không đúng.";
export const LOI_KHONG_PHAI_CHU = "Chỉ chủ quán kích hoạt được máy quầy.";
export const LOI_TAM_NGUNG = "Nhà hàng đang tạm ngưng — liên hệ TechMenu để mở lại.";
export const LOI_DU_LIEU = "Dữ liệu gửi lên không hợp lệ.";
export const LOI_KHAC = "Không kích hoạt được — thử lại sau ít phút.";

export type DauVaoKichHoat = { email: string; password: string; tenantId: string | null; coMayIn: boolean };

export type KetQuaKichHoat =
  | { loai: "chon-chi-nhanh"; chiNhanh: { id: string; name: string }[] }
  | {
      loai: "xong";
      slug: string;
      tenantName: string;
      /** Chỉ có khi `coMayIn` — tài khoản `printer` của đúng quán. */
      may: { email: string; password: string } | null;
    }
  | { loai: "loi"; status: 400 | 403 | 500; error: string };

/** Đọc thân yêu cầu. Sai kiểu → null (route trả 400, không nói trường nào sai). */
export function docDauVao(body: unknown): DauVaoKichHoat | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
  const password = typeof b.password === "string" ? b.password : "";
  const tenantId = typeof b.tenantId === "string" && b.tenantId ? b.tenantId : null;
  if (!email || email.length > 254 || !email.includes("@")) return null;
  if (!password || password.length > 200) return null;
  if (tenantId && !/^[0-9a-f-]{36}$/i.test(tenantId)) return null;
  if (typeof b.coMayIn !== "boolean") return null;
  return { email, password, tenantId, coMayIn: b.coMayIn };
}

/** Kiểm email + mật khẩu bằng client anon (không cookie), rồi thu hồi ngay phiên vừa tạo. */
export async function dangNhapRoiThuHoi(email: string, password: string): Promise<string | null> {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error || !data.user) return null;
  await sb.auth.signOut({ scope: "local" }).catch(() => {});
  return data.user.id;
}

/**
 * `dangNhap` trả user id khi email + mật khẩu đúng, null khi sai. Sai email hay sai mật khẩu cùng một câu —
 * không cho dò email nào là chủ quán.
 */
export async function kichHoatMayQuay(
  admin: SupabaseClient,
  dangNhap: (email: string, password: string) => Promise<string | null>,
  vao: DauVaoKichHoat
): Promise<KetQuaKichHoat> {
  const userId = await dangNhap(vao.email, vao.password);
  if (!userId) return { loai: "loi", status: 400, error: LOI_DANG_NHAP };

  const { data: ms, error: loiMs } = await admin
    .from("memberships")
    .select("tenant_id")
    .eq("user_id", userId)
    .eq("role", "owner")
    .eq("active", true);
  if (loiMs) return { loai: "loi", status: 500, error: LOI_KHAC };
  const ids = (ms ?? []).map((m) => m.tenant_id as string);
  if (ids.length === 0) return { loai: "loi", status: 403, error: LOI_KHONG_PHAI_CHU };
  // Chọn chi nhánh không thuộc mình → như không phải chủ (không nói quán đó có tồn tại không).
  if (vao.tenantId && !ids.includes(vao.tenantId)) return { loai: "loi", status: 403, error: LOI_KHONG_PHAI_CHU };

  const { data: quans, error: loiQ } = await admin
    .from("tenants")
    .select("id, slug, name, status")
    .in("id", vao.tenantId ? [vao.tenantId] : ids)
    .order("name");
  if (loiQ) return { loai: "loi", status: 500, error: LOI_KHAC };
  const dangMo = (quans ?? []).filter((q) => q.status === "active");
  if (dangMo.length === 0) return { loai: "loi", status: 403, error: LOI_TAM_NGUNG };
  if (dangMo.length > 1) {
    return { loai: "chon-chi-nhanh", chiNhanh: dangMo.map((q) => ({ id: q.id as string, name: q.name as string })) };
  }

  const quan = dangMo[0];
  if (!vao.coMayIn) return { loai: "xong", slug: quan.slug as string, tenantName: quan.name as string, may: null };

  try {
    const { code } = await createActivationCode(admin, { tenantId: quan.id as string, createdBy: userId });
    const r = await redeemActivationCode(admin, code);
    if ("error" in r) return { loai: "loi", status: 500, error: LOI_KHAC };
    return {
      loai: "xong",
      slug: r.slug,
      tenantName: quan.name as string,
      may: { email: r.email, password: r.password },
    };
  } catch (err) {
    console.error(JSON.stringify({ evt: "desktop-kich-hoat-loi", msg: err instanceof Error ? err.message : String(err) }));
    return { loai: "loi", status: 500, error: LOI_KHAC };
  }
}
