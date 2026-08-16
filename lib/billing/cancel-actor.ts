/**
 * Tên hiển thị của người duyệt hủy trong báo cáo (REPORT-10). Thuần, không JSX — vitest không
 * parse .tsx (tsconfig để `jsx: preserve`), nên logic chữ nghĩa phải nằm ngoài component.
 *
 * MỘT chỗ duy nhất cho MỌI khối của báo cáo. Trước đây danh sách "Theo người duyệt" rơi về vai
 * trò → "Không rõ", còn bảng "Chi tiết" in thẳng `actor_name` của RPC, tức `coalesce(display_name,
 * '—')` → "—": cùng một lượt hủy đọc ra hai chữ khác nhau ở hai nửa của cùng một khối.
 *
 * Thứ tự rơi giống `lib/orders/cancel-label.ts` (quyết định đã chốt ở lịch sử POS): có tên thì
 * lấy tên, không thì lấy VAI TRÒ (vẫn giữ được thông tin giám sát quan trọng nhất: CÓ người ở
 * cấp đó duyệt), thiếu cả hai mới tới "Không rõ". `report_cancel_list` không trả `role` nên bảng
 * "Chi tiết" chỉ đi được hai bậc đầu và cuối — vẫn đúng chữ với nửa còn lại.
 */

export const ROLE_LABEL: Record<string, string> = {
  owner: "Chủ quán",
  manager: "Quản lý",
  cashier: "Thu ngân",
  waiter: "Phục vụ",
  kitchen: "Bếp",
  station: "Máy trạm",
};

/** Chữ thay cho người duyệt không tra ra được. KHÔNG dùng "—": đây là một dòng chữ, không phải ô trống. */
export const UNKNOWN_ACTOR = "Không rõ";

/** RPC coalesce tên rỗng thành "—" — với tầng hiển thị thì đó là KHÔNG có tên. */
export function hasActorName(name: string | null | undefined): boolean {
  const n = name?.trim() ?? "";
  return n !== "" && n !== "—";
}

export function cancelActorLabel(actor: { name: string | null; role?: string | null }): string {
  if (hasActorName(actor.name)) return actor.name!.trim();
  return ROLE_LABEL[actor.role ?? ""] || UNKNOWN_ACTOR;
}
