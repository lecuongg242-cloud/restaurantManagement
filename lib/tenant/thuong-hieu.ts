import "server-only";
import { cache } from "react";
import { activeTenantBySlug } from "@/lib/tenant/active";
import { urlAnh } from "@/lib/storage/public-url";

export type ThuongHieuQuan = { ten: string; logoUrl: string | null };

/**
 * Tên + logo quán cho TAB TRÌNH DUYỆT (tiêu đề, favicon). `cache` gộp các lần gọi trong cùng một request.
 * Quán không có / tạm ngưng → `null` (tab giữ tiêu đề mặc định).
 */
export const thuongHieuQuan = cache(async (slug: string): Promise<ThuongHieuQuan | null> => {
  const t = await activeTenantBySlug<{ name: string; logo_url: string | null }>("name, logo_url", slug);
  if (!t) return null;
  return { ten: t.name, logoUrl: urlAnh(t.logo_url) };
});
