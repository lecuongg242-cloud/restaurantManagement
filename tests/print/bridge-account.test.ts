import { describe, it, expect, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import {
  bridgeEmailForSlug,
  provisionPrintBridgeAccount,
} from "@/lib/print/bridge-account";

config({ path: ".env.local" });
config();

/**
 * PRINT-05 — Cấp tài khoản thiết bị cho cầu in (QD-012 §1).
 * Chạy trên DB thật: chỉ đụng tenant demo `bun-bo`, dọn sạch tài khoản ở afterAll.
 */
const SLUG = "bun-bo";
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });

async function tenant() {
  const { data } = await admin.from("tenants").select("id, name").eq("slug", SLUG).maybeSingle();
  if (!data) throw new Error(`Không tìm thấy tenant ${SLUG}`);
  return data as { id: string; name: string };
}

async function canSignIn(email: string, password: string): Promise<boolean> {
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password });
  return !error;
}

afterAll(async () => {
  const email = bridgeEmailForSlug(SLUG);
  await admin.from("memberships").delete().eq("email", email);
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const u = data?.users.find((x) => (x.email ?? "").toLowerCase() === email);
  if (u) await admin.auth.admin.deleteUser(u.id);
}, 60_000);

describe("Cấp tài khoản cầu in", () => {
  it("email suy từ slug, cố định và không đoán nhầm sang quán khác", () => {
    expect(bridgeEmailForSlug("bun-bo")).toBe("print-bun-bo@bridge.local");
    expect(bridgeEmailForSlug("QT-Food")).toBe("print-qt-food@bridge.local");
  });

  it("tạo được tài khoản đăng nhập được, gắn membership vai trò printer", async () => {
    const t = await tenant();
    const { email, password } = await provisionPrintBridgeAccount(admin, {
      tenantId: t.id,
      slug: SLUG,
      name: t.name,
    });

    expect(email).toBe("print-bun-bo@bridge.local");
    expect(password.length).toBeGreaterThanOrEqual(24);
    expect(await canSignIn(email, password), "tài khoản mới phải đăng nhập được").toBe(true);

    const { data: rows } = await admin
      .from("memberships")
      .select("role, tenant_id, active")
      .eq("email", email);
    expect(rows ?? []).toHaveLength(1);
    expect(rows![0]).toMatchObject({ role: "printer", tenant_id: t.id, active: true });
  }, 60_000);

  it("cấp lần hai là XOAY mật khẩu: mật khẩu cũ hết hiệu lực, không đẻ membership thứ hai", async () => {
    const t = await tenant();
    const first = await provisionPrintBridgeAccount(admin, {
      tenantId: t.id,
      slug: SLUG,
      name: t.name,
    });
    const second = await provisionPrintBridgeAccount(admin, {
      tenantId: t.id,
      slug: SLUG,
      name: t.name,
    });

    expect(second.password).not.toBe(first.password);
    expect(await canSignIn(second.email, second.password), "mật khẩu mới phải dùng được").toBe(true);
    expect(await canSignIn(first.email, first.password), "mật khẩu cũ phải hết hiệu lực").toBe(false);

    const { data: rows } = await admin.from("memberships").select("id").eq("email", second.email);
    expect(rows ?? [], "cấp lại không được đẻ thêm membership").toHaveLength(1);
  }, 90_000);
});
