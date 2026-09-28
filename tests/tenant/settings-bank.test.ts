import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseSettings, serializeSettings } from "@/lib/tenant/settings";
import { khongDauInHoa } from "@/lib/payments/vietqr";

/** PAY-02 — tài khoản nhận chuyển khoản trong tenants.settings. */
const BANK = { bin: "970436", account_no: "0123456789", account_name: "NGUYEN VAN A" };

describe("parseSettings — khối bank", () => {
  it("hợp lệ → giữ nguyên; cờ in QR mặc định bật", () => {
    const s = parseSettings({ bank: BANK });
    expect(s.bank).toEqual(BANK);
    expect(s.print_qr_on_receipt).toBe(true);
  });

  it("không có bank → undefined (quán chưa khai)", () => {
    expect(parseSettings({}).bank).toBeUndefined();
    expect("bank" in parseSettings({})).toBe(false);
  });

  it.each([
    ["thiếu số TK", { bin: BANK.bin, account_name: BANK.account_name }],
    ["BIN 5 số", { ...BANK, bin: "97043" }],
    ["số TK có chữ", { ...BANK, account_no: "01234ABC89" }],
    ["số TK 5 số", { ...BANK, account_no: "12345" }],
    ["số TK 20 số", { ...BANK, account_no: "1".repeat(20) }],
    ["tên có dấu", { ...BANK, account_name: "Nguyễn Văn A" }],
    ["không phải object", "970436"],
  ])("%s → bỏ cả khối bank", (_ten, bank) => {
    expect(parseSettings({ bank }).bank).toBeUndefined();
  });

  it("bank hỏng KHÔNG làm mất các khóa cài đặt khác", () => {
    const s = parseSettings({ bank: { bin: "x" }, vat_pct: 8, receipt_footer: "Cảm ơn", print_mode: "bridge" });
    expect(s.bank).toBeUndefined();
    expect(s.vat_pct).toBe(8);
    expect(s.receipt_footer).toBe("Cảm ơn");
    expect(s.print_mode).toBe("bridge");
  });

  it("tắt cờ in QR được lưu lại", () => {
    expect(parseSettings({ bank: BANK, print_qr_on_receipt: false }).print_qr_on_receipt).toBe(false);
  });

  it("serializeSettings với bank: undefined → gỡ tài khoản", () => {
    const s = serializeSettings({ ...parseSettings({ bank: BANK }), bank: undefined });
    expect(JSON.parse(JSON.stringify(s)).bank).toBeUndefined();
  });

  it("khongDauInHoa: tên có dấu → IN HOA không dấu", () => {
    expect(khongDauInHoa("  Nguyễn Văn Đức ")).toBe("NGUYEN VAN DUC");
    expect(khongDauInHoa("Trần thị-Ánh")).toBe("TRAN THI ANH");
  });
});

// ---- Quyền: chỉ owner lưu được tài khoản ----------------------------------------------------------

const session = vi.hoisted(() => ({ role: "owner" as string }));
const createClientSpy = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  getSessionMembership: vi.fn(async () => ({
    userId: "u",
    tenant: { id: "t", slug: "demo", name: "Demo", logo_url: null },
    role: session.role,
    membershipId: "m",
    displayName: null,
  })),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`REDIRECT ${to}`);
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/flash", () => ({ setFlash: vi.fn() }));
vi.mock("@/lib/storage/images", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: createClientSpy }));

describe("updateBank — quyền", () => {
  beforeEach(() => createClientSpy.mockReset());

  function form() {
    const f = new FormData();
    f.set("slug", "demo");
    f.set("bank_bin", BANK.bin);
    f.set("bank_account_no", BANK.account_no);
    f.set("bank_account_name", "Nguyen Van A");
    return f;
  }

  it.each(["manager", "cashier", "waiter", "kitchen"])("%s → bị từ chối, không chạm DB", async (role) => {
    session.role = role;
    const { updateBank } = await import("@/app/r/[slug]/admin/(protected)/settings/actions");
    await expect(updateBank(form())).rejects.toThrow(/REDIRECT .*Kh%C3%B4ng%20%C4%91%E1%BB%A7%20quy%E1%BB%81n/);
    expect(createClientSpy).not.toHaveBeenCalled();
  });

  it("owner → ghi settings.bank đã chuẩn hóa", async () => {
    session.role = "owner";
    let written: Record<string, unknown> | null = null;
    const chain = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: async () => ({ data: { settings: { vat_pct: 8 } } }),
      update: (patch: Record<string, unknown>) => {
        written = patch;
        return { eq: () => ({ select: async () => ({ data: [{ id: "t" }], error: null }) }) };
      },
    };
    createClientSpy.mockResolvedValue({ from: () => chain });
    const { updateBank } = await import("@/app/r/[slug]/admin/(protected)/settings/actions");
    await updateBank(form());
    const settings = (written as { settings: Record<string, unknown> } | null)?.settings;
    expect(settings?.bank).toEqual(BANK);
    expect(settings?.vat_pct).toBe(8);
  });
});
