import { revalidateTag } from "next/cache";

/**
 * Cache thực đơn theo tenant (PERF-02).
 *
 * Mỗi sự kiện realtime kích một lần render POS trên **mọi** thiết bị đang mở trong quán, và mỗi
 * lần render lại đọc trọn thực đơn — 575–1.173ms mỗi lần, cho dữ liệu gần như không đổi suốt ca.
 *
 * Gắn theo `tenant_id` chứ không theo `slug`: slug đổi được (quán đổi tên), `tenant_id` thì không.
 * Cache gắn nhầm khóa là loại lỗi chỉ lộ ra sau khi ai đó đổi slug, tức là rất lâu sau.
 */
export function menuTag(tenantId: string): string {
  return `menu:${tenantId}`;
}

/**
 * Xóa cache thực đơn của một quán. **Mọi** lối ghi thực đơn phải gọi hàm này — sót một lối là
 * nhân viên bấm "hết món" mà khách vẫn đặt được (MENU-02, MENU-04). `tests/menu/cache.test.ts`
 * đọc mã nguồn để giữ điều đó đúng về sau.
 *
 * Chỉ có tác dụng trong request scope (server action / route handler); gọi từ script sẽ im lặng
 * không làm gì.
 */
export function revalidateMenu(tenantId: string): void {
  revalidateTag(menuTag(tenantId));
}
