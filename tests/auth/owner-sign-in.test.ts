import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * DESK-13 / ANDR-09 / MGR-01 (QD-033): đăng nhập quản trị với cờ `chiQuanTri` (cửa sổ Quản trị trong app, app Quản lý) —
 * thu ngân/phục vụ KHÔNG bị đẩy sang POS mà nhận câu báo không có quyền, phiên vừa tạo bị thu hồi. Không có cờ → giữ
 * hành vi cũ của web (đăng nhập nhầm cửa admin → về đúng khu).
 */
const vaiTro = vi.hoisted(() => ({ role: "cashier" as string }));
const signOut = vi.hoisted(() => vi.fn(async () => ({})));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { signInWithPassword: async () => ({ error: null }), signOut } }),
}));
vi.mock("@/lib/auth/session", () => ({
  getSessionMembership: async () => ({ role: vaiTro.role, tenant: { id: "t1", slug: "quan" } }),
}));
vi.mock("@/lib/tenant/renewal", () => ({ ownerForRenewal: async () => false }));

const { ownerSignIn } = await import("@/app/r/[slug]/admin/actions");

function form(them: Record<string, string> = {}) {
  const f = new FormData();
  f.set("slug", "quan");
  f.set("email", "a@b.vn");
  f.set("password", "x");
  for (const [k, v] of Object.entries(them)) f.set(k, v);
  return f;
}

describe("ownerSignIn — cờ chiQuanTri", () => {
  beforeEach(() => signOut.mockClear());

  it("thu ngân + chiQuanTri → báo không có quyền, đăng xuất, không chuyển trang", async () => {
    vaiTro.role = "cashier";
    await expect(ownerSignIn({}, form({ chiQuanTri: "1" }))).resolves.toEqual({
      error: "Tài khoản này không có quyền quản trị.",
    });
    expect(signOut).toHaveBeenCalledOnce();
  });

  it("thu ngân không cờ → về POS như cũ (web)", async () => {
    vaiTro.role = "cashier";
    await expect(ownerSignIn({}, form())).rejects.toThrow("REDIRECT /r/quan/pos");
    expect(signOut).not.toHaveBeenCalled();
  });

  it.each(["owner", "manager"])("%s + chiQuanTri → vào admin", async (role) => {
    vaiTro.role = role;
    await expect(ownerSignIn({}, form({ chiQuanTri: "1" }))).rejects.toThrow("REDIRECT /r/quan/admin");
  });
});
