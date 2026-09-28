import { congThang, mocGiaHan } from "@/lib/tenant/subscription";

/**
 * Gói dịch vụ do super-admin tự đặt (0061). Thuần hàm — dùng ở server lẫn client. Đọc DB: `plans-db.ts`.
 * `months` rỗng = VĨNH VIỄN (quán thành không giới hạn).
 */
export type Plan = { id: string; name: string; months: number | null; price: number; visible: boolean };

/** Ngắn → dài, vĩnh viễn cuối; cùng thời hạn thì rẻ trước. */
export function sapXepGoi(plans: Plan[]): Plan[] {
  return [...plans].sort(
    (a, b) => (a.months ?? Number.MAX_SAFE_INTEGER) - (b.months ?? Number.MAX_SAFE_INTEGER) || a.price - b.price
  );
}

/** "3 tháng" / "2 năm" / "18 tháng" / "Vĩnh viễn". */
export function thoiHanChu(months: number | null): string {
  if (months == null) return "Vĩnh viễn";
  return months % 12 === 0 ? `${months / 12} năm` : `${months} tháng`;
}

/**
 * Gói đang chọn trên trang Gia hạn (tham số `goi` = id gói). Id lạ/thiếu → gói đầu tiên. `hanMoi` rỗng với gói
 * vĩnh viễn. `null` khi chưa có gói nào hiện cho quán.
 */
export function chonGoi(
  plans: Plan[],
  goiId: string | undefined,
  paidUntil: string | null,
  today: string
): { plan: Plan; hanMoi: string | null } | null {
  const ds = sapXepGoi(plans.filter((p) => p.visible));
  const plan = ds.find((p) => p.id === goiId) ?? ds[0];
  if (!plan) return null;
  return { plan, hanMoi: plan.months == null ? null : congThang(mocGiaHan(paidUntil, today), plan.months) };
}

/**
 * Giá gợi ý khi super-admin ghi nhận theo số tháng / chọn ngày: có gói ĐÚNG số tháng đó thì lấy giá gói, không
 * thì giá gói 1 tháng × số tháng, không có nữa thì `null` (tự gõ).
 */
export function giaGoiYTheoThang(plans: Plan[], months: number): number | null {
  const dung = sapXepGoi(plans).find((p) => p.months === months);
  if (dung) return dung.price;
  const motThang = sapXepGoi(plans).find((p) => p.months === 1);
  return motThang ? motThang.price * months : null;
}
