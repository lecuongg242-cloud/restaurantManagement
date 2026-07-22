import type { Role } from "@/lib/auth/session";

/**
 * RBAC — bản đồ vai trò → khu vực (section) & route mặc định.
 * RLS lo cách ly tenant; đây là lớp vai trò (AUTH-04). Dùng ở login redirect + guard layout.
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
  }
}

export function defaultRouteForRole(slug: string, role: Role): string {
  return `/r/${slug}/${defaultSectionForRole(role)}`;
}

/** Vai trò `role` có được vào `section` không (chặn chéo: kitchen không vào admin). */
export function canAccess(role: Role, section: Section): boolean {
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

/** Vai trò cho phép quản lý nhân viên (tạo/sửa/xóa PIN). */
export function canManageStaff(role: Role): boolean {
  return role === "owner" || role === "manager";
}

/** Khu vực cấu hình dữ liệu nhà hàng owner/manager quản lý (P2). */
export type ManageSection = "menu" | "tables" | "settings" | "onboarding" | "reports";

/**
 * Vai trò `role` có quyền quản lý `section` cấu hình (menu/bàn/settings/onboarding) không.
 * V1: chỉ owner/manager; nhân viên trạm (cashier/waiter/kitchen/station) không vào.
 * Dùng ở guard các trang admin P2 (menu, tables, settings, onboarding).
 */
export function canManage(role: Role, _section: ManageSection): boolean {
  return role === "owner" || role === "manager";
}
