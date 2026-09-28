import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { gopCauHinh, type DongCauHinh, type PlatformConfig } from "./merge";

export type { PlatformConfig } from "./merge";

/**
 * Cấu hình thu tiền thuê bao của NỀN TẢNG (SUB-04, QD-021 U3): tài khoản nhận + số hỗ trợ. Giá theo từng gói
 * ở `platform_plans` (lib/platform/plans-db.ts). Nguồn chính: bảng `platform_settings` (0060),
 * super-admin sửa ở /super → Cài đặt nền tảng. Trường nào để trống thì lấy biến môi trường PLATFORM_* làm
 * dự phòng (`gopCauHinh`). Đọc bằng service role — chỉ gọi ở server; trang Gia hạn chỉ hiển thị phần cần
 * để chuyển khoản.
 *
 * Lỗi đọc DB (hoặc DB chưa có 0060) → dùng biến môi trường, không làm sập trang Gia hạn / màn hết hạn.
 */
export async function platformConfig(): Promise<PlatformConfig> {
  let dong: DongCauHinh | null = null;
  try {
    const { data, error } = await createAdminClient()
      .from("platform_settings")
      .select("bank_bin, bank_account_no, bank_account_name, support_phone")
      .maybeSingle();
    if (!error) dong = (data as DongCauHinh | null) ?? null;
  } catch {
    dong = null;
  }
  return gopCauHinh(dong, process.env);
}
