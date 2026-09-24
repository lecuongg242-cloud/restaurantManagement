import { describe, it, expect } from "vitest";
import {
  canAccess,
  canManage,
  canManageStaff,
  canToggleAvailability,
  canAssignRole,
  defaultSectionForRole,
  type ManageSection,
  type Section,
} from "@/lib/auth/rbac";
import type { Role } from "@/lib/auth/session";

/**
 * Ma trận phân quyền (AUTH-04/05/06 — QD-010). Hàm thuần → không cần DB.
 * Bảng dưới là NGUỒN SỰ THẬT của test: sửa quyền mà quên sửa bảng thì test đỏ.
 */

const ROLES: Role[] = ["owner", "manager", "cashier", "waiter", "kitchen", "station"];
const SECTIONS: ManageSection[] = [
  "menu",
  "tables",
  "staff",
  "onboarding",
  "reports",
  "settings",
  "printers",
  "inventory",
];

/** true = được quản lý mục đó. Vai trò không có trong bảng ⇒ false ở MỌI mục. */
const MANAGE: Partial<Record<Role, ManageSection[]>> = {
  owner: ["menu", "tables", "staff", "onboarding", "reports", "settings", "printers", "inventory"],
  // KHÔNG có settings. CÓ printers (PRINT-09): quản lý ca phải biết máy in bếp chết giữa ca.
  // CÓ inventory (QD-017 C4): manager nhập nguyên liệu buổi sáng.
  manager: ["menu", "tables", "staff", "onboarding", "reports", "printers", "inventory"],
};

describe("canManage — ma trận 6 vai trò × 8 mục (QD-010 §2)", () => {
  for (const role of ROLES) {
    for (const section of SECTIONS) {
      const expected = (MANAGE[role] ?? []).includes(section);
      it(`${role} × ${section} → ${expected}`, () => {
        expect(canManage(role, section)).toBe(expected);
      });
    }
  }

  it("settings là mục DUY NHẤT chỉ owner", () => {
    const ownerOnly = SECTIONS.filter((s) => canManage("owner", s) && !canManage("manager", s));
    expect(ownerOnly).toEqual(["settings"]);
  });

  it("không vai trò trạm nào quản lý được bất kỳ mục nào", () => {
    for (const role of ["cashier", "waiter", "kitchen", "station"] as Role[]) {
      expect(SECTIONS.some((s) => canManage(role, s))).toBe(false);
    }
  });

  it("canManageStaff khớp canManage(role,'staff') — một nguồn sự thật", () => {
    for (const role of ROLES) {
      expect(canManageStaff(role)).toBe(canManage(role, "staff"));
    }
  });
});

describe("canAccess — ngưỡng vào bề mặt KHÔNG đổi (QD-010 §1)", () => {
  const ACCESS: Record<Section, Role[]> = {
    admin: ["owner", "manager"],
    pos: ["owner", "manager", "cashier", "waiter", "station"],
    kds: ["owner", "manager", "kitchen", "station"],
    customer: ROLES,
  };

  for (const section of Object.keys(ACCESS) as Section[]) {
    for (const role of ROLES) {
      const expected = ACCESS[section].includes(role);
      it(`${role} × ${section} → ${expected}`, () => {
        expect(canAccess(role, section)).toBe(expected);
      });
    }
  }

  it("nhân viên trạm KHÔNG vào được khu admin (không hạ ngưỡng để setup menu)", () => {
    for (const role of ["cashier", "waiter", "kitchen", "station"] as Role[]) {
      expect(canAccess(role, "admin")).toBe(false);
    }
  });

  it("mọi vai trò đều vào được route mặc định của chính mình", () => {
    for (const role of ROLES) {
      expect(canAccess(role, defaultSectionForRole(role))).toBe(true);
    }
  });
});

describe("canToggleAvailability — 'hết món' ngoài khu admin (QD-010 §5)", () => {
  it("mọi vai trò có phiên nội bộ đều bật/tắt được", () => {
    for (const role of ROLES) {
      expect(canToggleAvailability(role)).toBe(true);
    }
  });

  it("nới quyền ĐÚNG một cột: bật hết món ≠ sửa thực đơn", () => {
    for (const role of ["cashier", "waiter", "kitchen", "station"] as Role[]) {
      expect(canToggleAvailability(role)).toBe(true);
      expect(canManage(role, "menu")).toBe(false);
    }
  });
});

describe("canAssignRole — chặn leo thang quyền (QD-010 §4)", () => {
  it("owner cấp được manager + vai trò trạm", () => {
    expect(canAssignRole("owner", "manager")).toBe(true);
    expect(canAssignRole("owner", "cashier")).toBe(true);
    expect(canAssignRole("owner", "waiter")).toBe(true);
    expect(canAssignRole("owner", "kitchen")).toBe(true);
  });

  it("manager KHÔNG tự nhân bản quyền, KHÔNG đụng owner", () => {
    expect(canAssignRole("manager", "manager")).toBe(false);
    expect(canAssignRole("manager", "owner")).toBe(false);
  });

  it("manager cấp được vai trò trạm", () => {
    for (const target of ["cashier", "waiter", "kitchen"] as Role[]) {
      expect(canAssignRole("manager", target)).toBe(true);
    }
  });

  it("không ai cấp được owner hay station qua UI", () => {
    for (const actor of ROLES) {
      expect(canAssignRole(actor, "owner")).toBe(false);
      expect(canAssignRole(actor, "station")).toBe(false);
    }
  });

  it("vai trò trạm không cấp được vai trò nào", () => {
    for (const actor of ["cashier", "waiter", "kitchen", "station"] as Role[]) {
      for (const target of ROLES) {
        expect(canAssignRole(actor, target)).toBe(false);
      }
    }
  });

  it("ai cấp được vai trò thì cũng phải quản lý được mục Nhân viên", () => {
    for (const actor of ROLES) {
      const canAssignAny = ROLES.some((t) => canAssignRole(actor, t));
      if (canAssignAny) expect(canManage(actor, "staff")).toBe(true);
    }
  });
});

/**
 * Vai trò `printer` — tài khoản THIẾT BỊ của cầu in tại quán (QD-012 §1).
 * Nó thay cho service-role trên máy quán, nên giá trị bảo mật nằm ở chỗ: khóa này lộ ra ngoài
 * cũng KHÔNG mở được bề mặt nào. Vì vậy mọi câu trả lời dưới đây phải là `false`.
 */
describe("Vai trò printer (cầu in)", () => {
  const ALL_SECTIONS: Section[] = ["admin", "pos", "kds", "customer"];

  it.each(ALL_SECTIONS)("printer KHÔNG vào được khu %s", (section) => {
    expect(canAccess("printer", section)).toBe(false);
  });

  it("printer không bật/tắt được hết món", () => {
    expect(canToggleAvailability("printer")).toBe(false);
  });

  it("không vai trò nào gán được `printer` qua UI nhân viên", () => {
    for (const actor of ROLES) {
      expect(canAssignRole(actor, "printer"), `${actor} gán được printer`).toBe(false);
    }
  });

  it("printer không quản lý được mục cấu hình nào", () => {
    for (const s of SECTIONS) {
      expect(canManage("printer", s), `printer quản lý được ${s}`).toBe(false);
    }
  });

  it("printer không quản lý được nhân viên", () => {
    expect(canManageStaff("printer")).toBe(false);
  });
});
