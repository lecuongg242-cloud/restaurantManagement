/**
 * Đường dẫn cùng trang ở chi nhánh khác: `/r/a/admin/menu?x=1` → `/r/b/admin/menu`. Bỏ query (id trong query là
 * của chi nhánh cũ). Trang có id trong đường dẫn không nằm trong admin/POS nên không cần xử lý thêm.
 */
export function duongDanChiNhanh(pathname: string, fromSlug: string, toSlug: string): string {
  const goc = `/r/${fromSlug}`;
  return pathname === goc || pathname.startsWith(goc + "/") ? `/r/${toSlug}${pathname.slice(goc.length)}` : `/r/${toSlug}`;
}
