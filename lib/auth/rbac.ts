import type { Role } from "@/lib/auth/session";

/**
 * RBAC — bản đồ vai trò → khu vực (section) & route mặc định.
 * RLS lo cách ly tenant; đây là lớp vai trò (AUTH-04). Dùng ở login redirect + guard layout.
 * Phân quyền CHI TIẾT trong khu admin (AUTH-05) ở `canManage` bên dưới — xem QD-010.
 */

export type Section = "admin" | "pos" | "kds" | "customer";

/** Route mặc định của một vai trò (đường dẫn tương đối trong /r/[slug]). */
export function defaultSectionForRole(role: Role): Section {
  switch (role) {
    case "owner":
    case "manager":
      return "admin";
    case "cashier":
    case "waiter":
      return "pos";
    case "kitchen":
      return "kds";
    case "station":
      // Trạm dùng chung — mặc định POS; thiết bị KDS mở /kds trực tiếp.
      return "pos";
    case "printer":
      // Không bao giờ dùng tới: cầu in không đăng nhập qua giao diện. Khai báo để switch còn đủ
      // nhánh — thêm vai trò mới mà quên khai quyền thì TS báo lỗi ngay thay vì im lặng.
      return "customer";
  }
}

export function defaultRouteForRole(slug: string, role: Role): string {
  return `/r/${slug}/${defaultSectionForRole(role)}`;
}

/**
 * Vai trò `role` có được vào `section` không (chặn chéo: kitchen không vào admin).
 * QD-010 §1: ngưỡng vào khu admin GIỮ NGUYÊN owner|manager — nhân viên trạm cần setup
 * thực đơn thì cấp tài khoản `manager`, không hạ ngưỡng này. Nhờ vậy trang admin thêm
 * sau mà lỡ quên guard cũng chỉ lộ cho owner/manager.
 */
export function canAccess(role: Role, section: Section): boolean {
  // Cầu in chỉ nói chuyện với PostgREST, không có giao diện nào. Khóa lộ ra ngoài cũng không mở
  // được /admin, /pos hay /kds — đó là phần lớn giá trị của việc tách nó khỏi service-role.
  if (role === "printer") return false;

  switch (section) {
    case "admin":
      return role === "owner" || role === "manager";
    case "pos":
      // Trạm + nhân viên phục vụ/thu ngân; owner/manager cũng xem được.
      return (
        role === "station" ||
        role === "cashier" ||
        role === "waiter" ||
        role === "owner" ||
        role === "manager"
      );
    case "kds":
      return role === "station" || role === "kitchen" || role === "owner" || role === "manager";
    case "customer":
      return true;
  }
}

/** Khu vực cấu hình dữ liệu nhà hàng owner/manager quản lý (P2). */
export type ManageSection = "menu" | "tables" | "staff" | "settings" | "onboarding" | "reports";

/**
 * Vai trò `role` có quyền quản lý `section` cấu hình không — ma trận QD-010 §2.
 *
 * - `settings` CHỈ owner: %phí phục vụ / %VAT đi thẳng vào `computeBillTotals` nên đổi một con
 *   số là đổi tiền in trên mọi hóa đơn kể từ lúc đó — quyết định thương mại của chủ, không phải
 *   thao tác vận hành. Nhận diện (logo/tên) và footer hóa đơn cùng lý do.
 * - `reports` CÓ manager: quản lý ca cần đối soát tiền mặt cuối ca (REPORT-03 sinh ra vì việc này).
 *
 * Viết dạng `switch` để mục mới thêm vào `ManageSection` bắt buộc phải khai quyền — TS báo
 * thiếu nhánh thay vì im lặng rơi vào mặc định.
 */
export function canManage(role: Role, section: ManageSection): boolean {
  switch (section) {
    case "settings":
      return role === "owner";
    case "menu":
    case "tables":
    case "staff":
    case "onboarding":
    case "reports":
      return role === "owner" || role === "manager";
  }
}

/** Vai trò cho phép quản lý nhân viên (tạo/sửa/xóa PIN). Giới hạn vai trò gán được: `canAssignRole`. */
export function canManageStaff(role: Role): boolean {
  return canManage(role, "staff");
}

/**
 * Bật/tắt "hết món" (`is_available`) — QD-010 §5. Quyền RIÊNG, không nằm trong `ManageSection`:
 * mở cho mọi vai trò có phiên nội bộ vì báo hết món là việc vận hành hằng ngày ở POS/KDS,
 * không phải sửa thực đơn. Chỉ đúng cột `is_available`; sửa tên/giá/ảnh vẫn cần `canManage(role,"menu")`.
 */
export function canToggleAvailability(role: Role): boolean {
  return (
    role === "owner" ||
    role === "manager" ||
    role === "cashier" ||
    role === "waiter" ||
    role === "kitchen" ||
    role === "station"
  );
}

/**
 * `actorRole` có được tạo/sửa/xóa thành viên mang vai trò `targetRole` không — QD-010 §4.
 *
 * Manager KHÔNG gán được `manager`: không có ràng buộc này thì phân quyền chỉ là hình thức —
 * một manager bị lộ tài khoản tự nhân bản được quyền, và `canManageStaff` vốn cho manager
 * xóa cả membership của owner. `owner` và `station` không gán được qua UI (owner do super-admin
 * tạo khi lập tenant; station là tài khoản thiết bị giữ tương thích — QD-009).
 */
export function canAssignRole(actorRole: Role, targetRole: Role): boolean {
  const STAFF_ROLES: Role[] = ["cashier", "waiter", "kitchen"];
  if (actorRole === "owner") return targetRole === "manager" || STAFF_ROLES.includes(targetRole);
  if (actorRole === "manager") return STAFF_ROLES.includes(targetRole);
  return false;
}
