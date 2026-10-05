import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { signInAs, OWNER_A, OWNER_B, tenantIdBySlug } from "./setup";
import { adminClient } from "./fixtures";
import { businessDate } from "@/lib/inventory/day";

/**
 * P20 / 20-01 (0076) trên DB thật, quán demo pho-viet (A) + bun-bo (B): phiếu nhập Lưu tạm / Hoàn thành / Hủy bỏ /
 * Sao chép, phiếu chi tự sinh, mã chứng từ không trùng, dòng sổ kho giống nhập buổi sáng 10-02, hủy không phá chốt sổ.
 */
const TAG = crypto.randomUUID().slice(0, 6);
const db = adminClient();
let tenantA = "";
let tenantB = "";
let ownerA: SupabaseClient;
let ownerB: SupabaseClient;
let cashierA: SupabaseClient;
const users: string[] = [];
const thit = crypto.randomUUID(); // kg → g, hệ số 1000
const trung = crypto.randomUUID(); // vỉ → cái, hệ số 10
const nuocDung = crypto.randomUUID(); // bán thành phẩm — không nhập được
const ngLieuB = crypto.randomUUID();
let nccA = "";
let nccB = "";
const today = businessDate();

type Line = { ingredient_id: string; qty: number; unit_price?: number | null };
const save = (c: SupabaseClient, receipt: Record<string, unknown>, complete: boolean, tenant = tenantA) =>
  c.rpc("save_purchase_receipt", { p_tenant: tenant, p_receipt: receipt, p_complete: complete });

async function entriesOf(receiptId: string) {
  const { data } = await db
    .from("stock_entries")
    .select("ingredient_id, kind, qty, unit_cost, business_date, purchase_receipt_id")
    .eq("purchase_receipt_id", receiptId)
    .order("qty", { ascending: false });
  return (data ?? []).map((r) => ({ ...r, qty: Number(r.qty), unit_cost: r.unit_cost === null ? null : Number(r.unit_cost) }));
}

beforeAll(async () => {
  tenantA = await tenantIdBySlug(OWNER_A.slug);
  tenantB = await tenantIdBySlug(OWNER_B.slug);
  ownerA = await signInAs(OWNER_A.email, OWNER_A.password);
  ownerB = await signInAs(OWNER_B.email, OWNER_B.password);

  const email = `p20-cashier-${TAG}@test.local`;
  const password = crypto.randomBytes(18).toString("base64url");
  const { data } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  users.push(data.user!.id);
  await db.from("memberships").insert({ tenant_id: tenantA, user_id: data.user!.id, role: "cashier", display_name: "P20", active: true });
  cashierA = await signInAs(email, password);

  const rows: Record<string, unknown>[] = [
    { id: thit, tenant_id: tenantA, name: `P20 thịt ${TAG}`, base_unit: "g", purchase_unit: "kg", purchase_factor: 1000 },
    { id: trung, tenant_id: tenantA, name: `P20 trứng ${TAG}`, base_unit: "cai", purchase_unit: "vỉ", purchase_factor: 10 },
    { id: nuocDung, tenant_id: tenantA, name: `P20 nước dùng ${TAG}`, base_unit: "ml", kind: "prepared", batch_output_qty: 1000 },
    { id: ngLieuB, tenant_id: tenantB, name: `P20 B ${TAG}`, base_unit: "g" },
  ];
  for (const row of rows) {
    const { error } = await db.from("ingredients").insert(row);
    if (error) throw new Error(error.message);
  }
  // NCC tạo bằng CHỦ QUÁN (không service role) để đi qua trigger cấp mã.
  const a = await ownerA.from("suppliers").insert({ tenant_id: tenantA, name: `P20 mối thịt ${TAG}` }).select("id, code").single();
  if (a.error) throw new Error(a.error.message);
  nccA = a.data.id as string;
  const b = await ownerB.from("suppliers").insert({ tenant_id: tenantB, name: `P20 B ${TAG}` }).select("id").single();
  nccB = b.data!.id as string;
}, 120_000);

afterAll(async () => {
  const { data: rs } = await db.from("purchase_receipts").select("id").in("tenant_id", [tenantA, tenantB]).like("note", `%${TAG}%`);
  const ids = (rs ?? []).map((r) => r.id as string);
  if (ids.length) {
    await db.from("stock_entries").delete().in("purchase_receipt_id", ids);
    await db.from("cash_vouchers").delete().in("purchase_receipt_id", ids);
    await db.from("purchase_receipts").update({ copied_from: null }).in("id", ids);
    await db.from("purchase_receipts").delete().in("id", ids);
  }
  await db.from("daily_closes").delete().eq("tenant_id", tenantA).eq("business_date", today).contains("payload", { marker: TAG });
  await db.from("suppliers").delete().in("id", [nccA, nccB].filter(Boolean));
  await db.from("suppliers").delete().eq("tenant_id", tenantA).like("name", `%${TAG}%`);
  await db.from("ingredients").delete().in("id", [thit, trung, nuocDung, ngLieuB]);
  await db.from("memberships").delete().in("user_id", users);
  for (const id of users) await db.auth.admin.deleteUser(id);
}, 120_000);

const note = (s: string) => `${s} ${TAG}`;

describe("nhà cung cấp", () => {
  it("chủ quán tạo không gửi mã → mã NCC tự sinh; SĐT trùng trong quán → lỗi", async () => {
    const { data } = await db.from("suppliers").select("code").eq("id", nccA).single();
    expect(data!.code).toMatch(/^NCC\d{6}$/);
    const phone = `09${Math.floor(Math.random() * 1e8).toString().padStart(8, "0")}`;
    const r1 = await ownerA.from("suppliers").insert({ tenant_id: tenantA, name: `P20 s1 ${TAG}`, phone });
    expect(r1.error).toBeNull();
    const r2 = await ownerA.from("suppliers").insert({ tenant_id: tenantA, name: `P20 s2 ${TAG}`, phone });
    expect(r2.error?.code).toBe("23505");
  });

  it("thu ngân không đọc, không tạo được NCC", async () => {
    expect((await cashierA.from("suppliers").select("id").eq("tenant_id", tenantA)).data ?? []).toHaveLength(0);
    expect((await cashierA.from("suppliers").insert({ tenant_id: tenantA, name: `P20 x ${TAG}` })).error).not.toBeNull();
  });
});

describe("Lưu tạm / Hoàn thành", () => {
  it("Lưu tạm → mã PN, trạng thái Phiếu tạm, 0 dòng sổ kho", async () => {
    const { data, error } = await save(ownerA, { note: note("tam"), lines: [{ ingredient_id: thit, qty: 2, unit_price: 280_000 }] }, false);
    expect(error).toBeNull();
    const row = data![0] as { id: string; code: string };
    expect(row.code).toMatch(/^PN\d{6}$/);
    const { data: r } = await db.from("purchase_receipts").select("status, subtotal, total, stock_date").eq("id", row.id).single();
    expect(r).toMatchObject({ status: "draft", subtotal: 560_000, total: 560_000, stock_date: null });
    expect(await entriesOf(row.id)).toHaveLength(0);
  });

  it("hồi quy 10-02: không NCC, không giá, không tiền → dòng sổ giống hệt nhập buổi sáng", async () => {
    const lines: Line[] = [{ ingredient_id: thit, qty: 0.35 }, { ingredient_id: trung, qty: 3 }];
    const { data, error } = await save(ownerA, { note: note("hoi-quy"), lines }, true);
    expect(error).toBeNull();
    const id = (data![0] as { id: string }).id;
    const e = await entriesOf(id);
    expect(e).toEqual([
      { ingredient_id: thit, kind: "receipt", qty: 350, unit_cost: null, business_date: today, purchase_receipt_id: id },
      { ingredient_id: trung, kind: "receipt", qty: 30, unit_cost: null, business_date: today, purchase_receipt_id: id },
    ]);
  });

  it("có giá: đơn giá ÷ hệ số như 10-02; giá gần nhất của nguyên liệu cập nhật", async () => {
    const { data } = await save(ownerA, {
      note: note("gia"), supplier_id: nccA, pay_now: 0,
      lines: [{ ingredient_id: thit, qty: 2, unit_price: 280_000 }],
    }, true);
    const id = (data![0] as { id: string }).id;
    const [e] = await entriesOf(id);
    expect(e).toMatchObject({ qty: 2000, unit_cost: 280 });
    const { data: ing } = await db.from("ingredients").select("last_unit_cost").eq("id", thit).single();
    expect(Number(ing!.last_unit_cost)).toBe(280);
  });

  it("giảm giá phiếu kéo giá vốn xuống đúng tỷ lệ; cần trả = tổng − giảm", async () => {
    const { data } = await save(ownerA, {
      note: note("giam"), supplier_id: nccA, discount: 56_000,
      lines: [{ ingredient_id: thit, qty: 2, unit_price: 280_000 }],
    }, true);
    const id = (data![0] as { id: string }).id;
    const { data: r } = await db.from("purchase_receipts").select("subtotal, discount, total").eq("id", id).single();
    expect(r).toEqual({ subtotal: 560_000, discount: 56_000, total: 504_000 });
    expect((await entriesOf(id))[0].unit_cost).toBe(252);
  });

  it("trả một phần → đúng một phiếu chi PC, đúng quỹ, gắn NCC + phiếu; phần còn lại là nợ", async () => {
    const before = await ownerA.rpc("supplier_summaries", { p_tenant: tenantA });
    const debt0 = Number((before.data as { supplier_id: string; debt: number }[]).find((x) => x.supplier_id === nccA)!.debt);
    const { data } = await save(ownerA, {
      note: note("tra-mot-phan"), supplier_id: nccA, pay_now: 300_000, pay_fund: "bank",
      lines: [{ ingredient_id: thit, qty: 2, unit_price: 280_000 }],
    }, true);
    const id = (data![0] as { id: string }).id;
    const { data: v } = await db.from("cash_vouchers").select("code, direction, fund, amount, source, supplier_id").eq("purchase_receipt_id", id);
    expect(v).toHaveLength(1);
    expect(v![0]).toMatchObject({ direction: "out", fund: "bank", amount: 300_000, source: "purchase", supplier_id: nccA });
    expect(v![0].code).toMatch(/^PC\d{6}$/);
    const after = await ownerA.rpc("supplier_summaries", { p_tenant: tenantA });
    const debt1 = Number((after.data as { supplier_id: string; debt: number }[]).find((x) => x.supplier_id === nccA)!.debt);
    expect(debt1 - debt0).toBe(260_000);
  });

  it("không NCC mà trả thiếu → lỗi, không ghi gì", async () => {
    const { count: c0 } = await db.from("purchase_receipts").select("id", { count: "exact", head: true }).eq("tenant_id", tenantA);
    const { error } = await save(ownerA, { note: note("no-vo-chu"), pay_now: 0, lines: [{ ingredient_id: thit, qty: 1, unit_price: 100_000 }] }, true);
    expect(error?.message).toContain("thieu_ncc_con_no");
    const { count: c1 } = await db.from("purchase_receipts").select("id", { count: "exact", head: true }).eq("tenant_id", tenantA);
    expect(c1).toBe(c0);
  });

  it("sửa tiếp phiếu tạm rồi Hoàn thành → giữ mã, thay dòng", async () => {
    const d = await save(ownerA, { note: note("sua-tiep"), lines: [{ ingredient_id: thit, qty: 1 }] }, false);
    const { id, code } = d.data![0] as { id: string; code: string };
    const done = await save(ownerA, { id, note: note("sua-tiep"), lines: [{ ingredient_id: trung, qty: 2 }] }, true);
    expect(done.error).toBeNull();
    expect((done.data![0] as { code: string }).code).toBe(code);
    const e = await entriesOf(id);
    expect(e.map((x) => [x.ingredient_id, x.qty])).toEqual([[trung, 20]]);
    const again = await save(ownerA, { id, note: note("sua-tiep"), lines: [{ ingredient_id: trung, qty: 9 }] }, true);
    expect(again.error?.message).toContain("khong_phai_phieu_tam");
  });

  it("hai lần lưu đồng thời → hai mã khác nhau", async () => {
    const [x, y] = await Promise.all([
      save(ownerA, { note: note("dong-thoi"), lines: [{ ingredient_id: thit, qty: 1 }] }, false),
      save(ownerA, { note: note("dong-thoi"), lines: [{ ingredient_id: thit, qty: 1 }] }, false),
    ]);
    expect(x.error).toBeNull();
    expect(y.error).toBeNull();
    expect((x.data![0] as { code: string }).code).not.toBe((y.data![0] as { code: string }).code);
  });
});

describe("chặn dữ liệu và quyền", () => {
  it("nguyên liệu quán khác, bán thành phẩm, NCC quán khác → lỗi", async () => {
    expect((await save(ownerA, { note: note("x"), lines: [{ ingredient_id: ngLieuB, qty: 1 }] }, false)).error).not.toBeNull();
    expect((await save(ownerA, { note: note("x"), lines: [{ ingredient_id: nuocDung, qty: 1 }] }, false)).error).not.toBeNull();
    expect((await save(ownerA, { note: note("x"), supplier_id: nccB, lines: [{ ingredient_id: thit, qty: 1 }] }, false)).error).not.toBeNull();
    expect((await save(ownerA, { note: note("x"), lines: [] }, false)).error).not.toBeNull();
  });

  it("chủ quán B gọi hàm với quán A, thu ngân A → 42501", async () => {
    expect((await save(ownerB, { note: note("x"), lines: [{ ingredient_id: thit, qty: 1 }] }, false)).error?.code).toBe("42501");
    expect((await save(cashierA, { note: note("x"), lines: [{ ingredient_id: thit, qty: 1 }] }, false)).error?.code).toBe("42501");
  });

  it("thu ngân đọc phiếu nhập / phiếu chi → 0 dòng; chủ quán ghi thẳng bảng → bị từ chối", async () => {
    expect((await cashierA.from("purchase_receipts").select("id").eq("tenant_id", tenantA)).data ?? []).toHaveLength(0);
    expect((await cashierA.from("cash_vouchers").select("id").eq("tenant_id", tenantA)).data ?? []).toHaveLength(0);
    const { data: r } = await db.from("purchase_receipts").select("id, total").eq("tenant_id", tenantA).eq("status", "done").like("note", `%${TAG}%`).limit(1).single();
    await ownerA.from("purchase_receipts").update({ total: 1 }).eq("id", r!.id);
    const { data: after } = await db.from("purchase_receipts").select("total").eq("id", r!.id).single();
    expect(after!.total).toBe(r!.total);
    expect((await ownerA.from("cash_vouchers").insert({
      tenant_id: tenantA, code: `X${TAG}`, direction: "out", fund: "cash", amount: 1, source: "manual",
    })).error).not.toBeNull();
  });

  it("dòng receipt âm không gắn phiếu nhập → CHECK chặn", async () => {
    const { error } = await db.from("stock_entries").insert({
      tenant_id: tenantA, business_date: today, ingredient_id: thit, kind: "receipt", qty: -1, note: note("am"),
    });
    expect(error?.code).toBe("23514");
  });
});

describe("Hủy bỏ / Sao chép / sửa thông tin", () => {
  it("hủy khi ngày kho chưa chốt → dòng sổ bị xóa, phiếu chi đi kèm Đã hủy", async () => {
    const { data } = await save(ownerA, {
      note: note("huy-chua-chot"), supplier_id: nccA, pay_now: 100_000,
      lines: [{ ingredient_id: thit, qty: 1, unit_price: 100_000 }],
    }, true);
    const id = (data![0] as { id: string }).id;
    expect(await entriesOf(id)).toHaveLength(1);
    expect((await ownerA.rpc("cancel_purchase_receipt", { p_receipt: id, p_cancel_vouchers: true })).error).toBeNull();
    expect(await entriesOf(id)).toHaveLength(0);
    const { data: v } = await db.from("cash_vouchers").select("status").eq("purchase_receipt_id", id);
    expect(v!.map((x) => x.status)).toEqual(["cancelled"]);
    expect((await ownerA.rpc("cancel_purchase_receipt", { p_receipt: id, p_cancel_vouchers: true })).error?.message).toContain("da_huy");
  });

  it("hủy sau khi ngày kho đã chốt → dòng âm hôm nay không giá, bản chốt không đổi", async () => {
    const { data } = await save(ownerA, {
      note: note("huy-da-chot"), supplier_id: nccA, lines: [{ ingredient_id: thit, qty: 1.5, unit_price: 200_000 }],
    }, true);
    const id = (data![0] as { id: string }).id;
    const close = await db
      .from("daily_closes")
      .insert({ tenant_id: tenantA, business_date: today, payload: { marker: TAG } })
      .select("id, payload")
      .single();
    expect(close.error).toBeNull();
    try {
      expect((await ownerA.rpc("cancel_purchase_receipt", { p_receipt: id, p_cancel_vouchers: false })).error).toBeNull();
      const e = await entriesOf(id);
      expect(e.map((x) => [x.qty, x.unit_cost, x.business_date])).toEqual([[1500, 200, today], [-1500, null, today]]);
      const { data: c } = await db.from("daily_closes").select("payload").eq("id", close.data!.id).single();
      expect(c!.payload).toEqual(close.data!.payload);
    } finally {
      await db.from("daily_closes").delete().eq("id", close.data!.id);
    }
  });

  it("sao chép → phiếu tạm mới, cùng dòng, không tiền trả, nhớ phiếu gốc", async () => {
    const { data } = await save(ownerA, {
      note: note("goc"), supplier_id: nccA, pay_now: 50_000, lines: [{ ingredient_id: trung, qty: 2, unit_price: 30_000 }],
    }, true);
    const goc = (data![0] as { id: string }).id;
    const cp = await ownerA.rpc("copy_purchase_receipt", { p_receipt: goc });
    expect(cp.error).toBeNull();
    const moi = (cp.data![0] as { id: string }).id;
    const { data: r } = await db.from("purchase_receipts").select("status, pay_now, copied_from, supplier_id, total").eq("id", moi).single();
    expect(r).toEqual({ status: "draft", pay_now: 0, copied_from: goc, supplier_id: nccA, total: 60_000 });
    const { data: l } = await db.from("purchase_receipt_lines").select("ingredient_id, qty, unit_price, amount").eq("receipt_id", moi);
    expect(l!.map((x) => [x.ingredient_id, Number(x.qty), x.unit_price, x.amount])).toEqual([[trung, 2, 30_000, 60_000]]);
  });

  it("phiếu đã nhập: sửa ghi chú; ngày không đổi (P34: thời gian nhập không sửa); gắn NCC chỉ khi đang trống", async () => {
    const { data } = await save(ownerA, { note: note("meta"), lines: [{ ingredient_id: thit, qty: 1 }] }, true);
    const id = (data![0] as { id: string }).id;
    const ok = await ownerA.rpc("update_purchase_receipt_meta", {
      p_receipt: id, p_note: note("meta-moi"), p_doc_date: "2026-09-01", p_supplier: nccA,
    });
    expect(ok.error).toBeNull();
    const { data: r } = await db.from("purchase_receipts").select("note, doc_date, supplier_id, stock_date").eq("id", id).single();
    expect(r).toEqual({ note: note("meta-moi"), doc_date: today, supplier_id: nccA, stock_date: today });
    const s2 = await ownerA.from("suppliers").insert({ tenant_id: tenantA, name: `P20 khac ${TAG}` }).select("id").single();
    const doi = await ownerA.rpc("update_purchase_receipt_meta", {
      p_receipt: id, p_note: note("meta-moi"), p_doc_date: null, p_supplier: s2.data!.id,
    });
    expect(doi.error?.message).toContain("da_co_ncc");
  });
});
