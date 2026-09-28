import { parseBank, type BankAccount } from "@/lib/tenant/settings";

/**
 * Gộp cấu hình nền tảng: dòng `platform_settings` (0060) là nguồn chính, biến môi trường PLATFORM_* là
 * dự phòng CHO TỪNG TRƯỜNG. Thuần hàm (không I/O) để test được.
 *
 * Tài khoản nhận lấy NGUYÊN KHỐI từ một nguồn: DB có đủ 3 trường hợp lệ thì dùng DB, không thì env — không
 * ghép BIN của nguồn này với số tài khoản của nguồn kia (tiền đi lạc).
 *
 *   PLATFORM_BANK_BIN, PLATFORM_BANK_ACCOUNT_NO, PLATFORM_BANK_ACCOUNT_NAME — tài khoản nhận
 *   PLATFORM_SUPPORT_PHONE — số hỗ trợ
 *
 * Giá không còn ở đây: mỗi gói có giá riêng trong `platform_plans` (0061, lib/platform/plans.ts).
 */
export type PlatformConfig = {
  bank: BankAccount | null;
  supportPhone: string | null;
  /** Nguồn của tài khoản nhận — trang Cài đặt nền tảng hiện cho super-admin biết. */
  bankSource: "db" | "env" | null;
};

export type DongCauHinh = {
  bank_bin: string | null;
  bank_account_no: string | null;
  bank_account_name: string | null;
  support_phone: string | null;
};

export function gopCauHinh(dong: DongCauHinh | null, env: Record<string, string | undefined>): PlatformConfig {
  const bankDb = dong
    ? parseBank({ bin: dong.bank_bin, account_no: dong.bank_account_no, account_name: dong.bank_account_name })
    : undefined;
  const bankEnv = parseBank({
    bin: env.PLATFORM_BANK_BIN?.trim(),
    account_no: env.PLATFORM_BANK_ACCOUNT_NO?.trim(),
    account_name: env.PLATFORM_BANK_ACCOUNT_NAME?.trim(),
  });
  return {
    bank: bankDb ?? bankEnv ?? null,
    bankSource: bankDb ? "db" : bankEnv ? "env" : null,
    supportPhone: dong?.support_phone?.trim() || env.PLATFORM_SUPPORT_PHONE?.trim() || null,
  };
}
