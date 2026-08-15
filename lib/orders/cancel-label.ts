/**
 * Dựng chuỗi mô tả một lượt hủy để hiện trên POS (ORDER-17). Thuần để test được — vitest không
 * parse .tsx (tsconfig để `jsx: preserve`), nên logic chữ nghĩa phải nằm ngoài component.
 *
 * Phần nào thiếu thì BỎ HẲN thay vì in "—": dòng này nằm ngay dưới tên món, mỗi ký tự thừa là
 * một lần nhân viên phải đọc lướt qua thứ không mang tin.
 *
 * `memberships.display_name` là cột NULLABLE — tra ra membership nhưng không có tên thì RƠI VỀ
 * VAI TRÒ thay vì bỏ hẳn: "Quản lý" vẫn giữ được thông tin quan trọng nhất cho việc giám sát (CÓ
 * người ở cấp đó duyệt), chỉ khi cả tên lẫn vai trò đều không có mới bỏ hẳn phần người duyệt.
 */

const VN_OFFSET = 7 * 3600 * 1000;

const ROLE_LABEL: Record<string, string> = {
  owner: "Chủ quán",
  manager: "Quản lý",
  cashier: "Thu ngân",
  waiter: "Phục vụ",
  kitchen: "Bếp",
  station: "Máy trạm",
};

export type CancelActor = { name: string; role: string };

/** "HH:MM" giờ VN. */
function vnTime(iso: string): string {
  return new Date(new Date(iso).getTime() + VN_OFFSET).toISOString().slice(11, 16);
}

export function formatCancelNote(input: {
  reason: string | null;
  at: string | null;
  actor: CancelActor | null;
}): string {
  const head = input.at ? `Đã hủy ${vnTime(input.at)}` : "Đã hủy";

  const parts: string[] = [head];
  const reason = input.reason?.trim();
  if (reason) parts.push(`"${reason}"`);
  if (input.actor) {
    const name = input.actor.name.trim();
    const role = ROLE_LABEL[input.actor.role];
    const actorPart = name && role ? `${name} (${role})` : name || role || null;
    if (actorPart) parts.push(actorPart);
  }
  return parts.join(" · ");
}
