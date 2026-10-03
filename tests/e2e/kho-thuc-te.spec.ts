import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

/**
 * Luồng kho THỰC TẾ một ngày ở quán demo `pho-viet`, thao tác bằng giao diện như chủ quán: nhập hàng gõ nhầm → Hủy bỏ →
 * Sao chép → sửa → Hoàn thành; phiếu hôm qua (ngày đã chốt) sai giá → Hủy bỏ (dòng âm hôm nay) → Sao chép sửa giá; Lưu tạm
 * rồi sửa → Hoàn thành; sửa ngày chứng từ; nấu mẻ hụt; xuất hủy; kiểm kê gõ nhầm 82 → hỏi lại → sửa số → Hoàn thành.
 *
 * Cần dữ liệu 7 ngày của `node scripts/seed-kho-demo.mjs` (26/09–02/10), chạy ngày 03/10/2026 — bước 2 hủy phiếu gà/giò
 * "Nhập sáng" của hôm qua nên mỗi lượt seed chỉ chạy trọn được một lần (chạy lại: seed lại). Mỗi bước kiểm sổ kho trong DB,
 * không chỉ chữ trên màn hình.
 */
config({ path: ".env.local" });

const SLUG = "pho-viet";
const ANH = "docs/30-KeHoach/P26/anh";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const vnToday = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);

test.describe.configure({ mode: "serial" });
test.setTimeout(300_000);

let tenant = "";
const ing: Record<string, { id: string; purchase_factor: number }> = {};

async function dangNhap(page: Page) {
  await page.goto(`/r/${SLUG}/admin/login`);
  await page.fill('input[name="email"]', process.env.SEED_OWNER_A_EMAIL ?? "ownerA@pho-viet.test");
  await page.fill('input[name="password"]', process.env.SEED_OWNER_A_PASSWORD ?? "DemoPass123!");
  await Promise.all([
    page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 90_000 }),
    page.click('button[type="submit"]'),
  ]);
}

async function onHand(name: string): Promise<number> {
  const { data, error } = await db.rpc("inventory_on_hand", { p_tenant: tenant });
  if (error) throw error;
  const row = (data as { ingredient_id: string; on_hand: number }[]).find((r) => r.ingredient_id === ing[name].id);
  return Number(row?.on_hand ?? 0);
}

async function entries(receiptId: string) {
  const { data } = await db
    .from("stock_entries")
    .select("ingredient_id, qty, unit_cost, business_date")
    .eq("purchase_receipt_id", receiptId);
  return data ?? [];
}

/** Điền một dòng phiếu: chọn nguyên liệu ở dòng thứ `i`, gõ số lượng và giá. */
async function dong(page: Page, i: number, name: string, qty: string, price?: string) {
  const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Hoàn thành" }) });
  await form.getByLabel("Nguyên liệu").nth(i).selectOption({ label: name });
  await form.getByLabel(/^Số lượng/).nth(i).fill(qty);
  if (price) await form.getByLabel("Đơn giá (không bắt buộc)").nth(i).fill(price);
}

/** Chọn NCC theo phần đầu tên (ô chọn hiện kèm số điện thoại). */
async function chonNcc(page: Page, ten: string) {
  const sel = page.getByLabel("Nhà cung cấp");
  const value = await sel.locator("option").filter({ hasText: ten }).first().getAttribute("value");
  await sel.selectOption(value!);
}

/** Chờ thông báo MỚI chứa `re` sau thao tác `act` — thông báo cũ vẫn xếp chồng trên màn nên không tìm chữ trơn được. */
async function thongBao(page: Page, re: RegExp | string, act: () => Promise<unknown>) {
  const before = await page.getByRole("status").allInnerTexts();
  await act();
  // Trừ từng thông báo cũ một lần (hai thông báo cùng chữ — "Đã ghi hủy Tôm sú." hai lần — vẫn nhận ra cái mới).
  const moi = (now: string[]) => {
    const left = [...before];
    return now.filter((t) => {
      const i = left.indexOf(t);
      if (i < 0) return true;
      left.splice(i, 1);
      return false;
    });
  };
  await expect
    .poll(async () => moi(await page.getByRole("status").allInnerTexts()).join(" | "), { timeout: 60_000 })
    .toMatch(re);
}

async function receiptIdFromUrl(page: Page) {
  await page.waitForURL(/\/nhap-hang\/[0-9a-f-]{36}$/, { timeout: 90_000 });
  return page.url().split("/").pop()!;
}

test.beforeAll(async () => {
  const { data: t } = await db.from("tenants").select("id").eq("slug", SLUG).single();
  tenant = t!.id;
  const { data } = await db.from("ingredients").select("id, name, purchase_factor").eq("tenant_id", tenant);
  for (const r of data ?? []) ing[r.name] = { id: r.id, purchase_factor: Number(r.purchase_factor) };
  expect(ing["Thịt bò thăn"], "Chạy scripts/seed-kho-demo.mjs trước").toBeTruthy();
});

test("1. Nhập sáng gõ 40 kg thay 4 kg → Hủy bỏ (xóa dòng sổ, hủy phiếu chi) → Sao chép → sửa 4 → Hoàn thành", async ({ page }) => {
  await dangNhap(page);
  const truoc = await onHand("Thịt bò thăn");

  await page.goto(`/r/${SLUG}/admin/nhap-hang/moi`, { waitUntil: "networkidle" });
  await chonNcc(page, "Thanh Tuấn");
  await dong(page, 0, "Thịt bò thăn", "40", "285000");
  await page.getByRole("button", { name: "+ Thêm nguyên liệu khác" }).click();
  await dong(page, 1, "Thịt ngựa", "2", "250000");
  await page.getByLabel("Tiền trả NCC").fill("1000000");
  await page.getByRole("radio", { name: "Tiền mặt" }).check();
  await page.screenshot({ path: `${ANH}/01-nhap-go-nham-40kg.png`, fullPage: true });
  await page.getByRole("button", { name: "Hoàn thành" }).click();
  const sai = await receiptIdFromUrl(page);
  await expect(page.getByText(/Đã nhập hàng — phiếu PN\d+/)).toBeVisible();
  expect(await onHand("Thịt bò thăn")).toBeCloseTo(truoc + 40_000, 3);
  const { data: chi } = await db.from("cash_vouchers").select("amount, status").eq("purchase_receipt_id", sai);
  expect(chi).toEqual([{ amount: 1_000_000, status: "active" }]);

  // Hủy bỏ: ngày kho hôm nay chưa chốt → dòng sổ của phiếu bị XÓA, tồn về như trước; phiếu chi đi kèm bị hủy.
  page.once("dialog", (d) => d.accept());
  await thongBao(page, "Đã hủy phiếu nhập.", () => page.getByRole("button", { name: "Hủy bỏ" }).click());
  expect(await entries(sai)).toEqual([]);
  expect(await onHand("Thịt bò thăn")).toBeCloseTo(truoc, 3);
  const { data: chi2 } = await db.from("cash_vouchers").select("status").eq("purchase_receipt_id", sai);
  expect(chi2).toEqual([{ status: "cancelled" }]);
  await page.screenshot({ path: `${ANH}/02-phieu-da-huy.png`, fullPage: true });

  // Sao chép → phiếu tạm cùng dòng → sửa 40 thành 4 → Hoàn thành.
  await thongBao(page, /Đã sao chép thành phiếu tạm PN\d+/, () => page.getByRole("button", { name: "Sao chép" }).click());
  const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Hoàn thành" }) });
  await expect(form.getByLabel(/^Số lượng/).first()).toHaveValue("40");
  await form.getByLabel(/^Số lượng/).first().fill("4");
  // Phiếu sao chép có tiền trả 0 → form tự chọn "Chưa trả (ghi nợ)"; trả lại 1 triệu tiền mặt như phiếu gốc.
  await expect(page.getByRole("radio", { name: "Chưa trả (ghi nợ)" })).toBeChecked();
  await page.getByRole("radio", { name: "Tiền mặt" }).check();
  await page.getByLabel("Tiền trả NCC").fill("1000000");
  await page.screenshot({ path: `${ANH}/03-sao-chep-sua-4kg.png`, fullPage: true });
  await thongBao(page, /Đã nhập hàng — phiếu PN\d+/, () => form.getByRole("button", { name: "Hoàn thành" }).click());
  const dung = page.url().split("/").pop()!;
  const e = await entries(dung);
  expect(e.find((x) => x.ingredient_id === ing["Thịt bò thăn"].id)).toMatchObject({ qty: 4000, business_date: vnToday() });
  expect(Number(e.find((x) => x.ingredient_id === ing["Thịt bò thăn"].id)!.unit_cost)).toBeCloseTo(285, 6);
  expect(await onHand("Thịt bò thăn")).toBeCloseTo(truoc + 4000, 3);
  const { data: r } = await db.from("purchase_receipts").select("total, pay_now, status, copied_from").eq("id", dung).single();
  expect(r).toMatchObject({ total: 4 * 285000 + 2 * 250000, pay_now: 1_000_000, status: "done", copied_from: sai });

  // Sửa thông tin phiếu đã nhập: ngày chứng từ + ghi chú (không đổi số lượng, giá).
  await page.locator('input[name="doc_date"]').fill("2026-10-02");
  await page.locator('input[name="note"]').fill("HĐ Thanh Tuấn số 0015 — hàng giao tối 02/10");
  await thongBao(page, "Đã lưu thông tin phiếu.", () => page.getByRole("button", { name: "Lưu", exact: true }).click());
  const { data: r2 } = await db.from("purchase_receipts").select("doc_date, stock_date, note").eq("id", dung).single();
  expect(r2).toMatchObject({ doc_date: "2026-10-02", stock_date: vnToday() });
  await page.screenshot({ path: `${ANH}/04-phieu-dung-da-sua-ngay-chung-tu.png`, fullPage: true });
});

test("2. Phiếu hôm qua (ngày ĐÃ chốt) sai giá giò → Hủy bỏ: dòng âm hôm nay, bản chốt không đổi → Sao chép sửa giá", async ({ page }) => {
  await dangNhap(page);
  const homQua = new Date(Date.now() + 7 * 3600e3 - 86400e3).toISOString().slice(0, 10);
  const { data: cu } = await db
    .from("purchase_receipts")
    .select("id, code, total")
    .eq("tenant_id", tenant)
    .eq("stock_date", homQua)
    .eq("status", "done")
    .eq("note", "Nhập sáng")
    .order("code");
  const { data: lines } = await db.from("purchase_receipt_lines").select("receipt_id, ingredient_id, qty").in("receipt_id", (cu ?? []).map((x) => x.id));
  const phieu = (cu ?? []).find((x) => (lines ?? []).some((l) => l.receipt_id === x.id && l.ingredient_id === ing["Giò heo"].id))!;
  expect(phieu, "phiếu gà/giò hôm qua").toBeTruthy();
  const { data: close } = await db.from("daily_closes").select("payload").eq("tenant_id", tenant).eq("business_date", homQua).single();
  const truocGio = await onHand("Giò heo");
  const { data: sum0 } = await db.rpc("supplier_summaries", { p_tenant: tenant });

  await page.goto(`/r/${SLUG}/admin/nhap-hang/${phieu.id}`, { waitUntil: "networkidle" });
  page.once("dialog", (d) => d.accept());
  await thongBao(page, "Đã hủy phiếu nhập.", () => page.getByRole("button", { name: "Hủy bỏ" }).click());
  // Ngày kho đã chốt: dòng dương cũ giữ nguyên (bản chốt bất biến), thêm dòng `receipt` ÂM hôm nay, không giá.
  const e = await entries(phieu.id);
  const am = e.filter((x) => Number(x.qty) < 0);
  expect(am.length).toBeGreaterThan(0);
  for (const x of am) expect(x).toMatchObject({ business_date: vnToday(), unit_cost: null });
  expect(await onHand("Giò heo")).toBeCloseTo(truocGio - 3500, 3);
  const { data: close2 } = await db.from("daily_closes").select("payload").eq("tenant_id", tenant).eq("business_date", homQua).single();
  expect(close2!.payload).toEqual(close!.payload);

  await thongBao(page, /Đã sao chép thành phiếu tạm PN\d+/, () => page.getByRole("button", { name: "Sao chép" }).click());
  const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Hoàn thành" }) });
  const n = await form.getByLabel("Nguyên liệu").count();
  for (let i = 0; i < n; i++) {
    if ((await form.getByLabel("Nguyên liệu").nth(i).inputValue()) === ing["Giò heo"].id) {
      await form.getByLabel("Đơn giá (không bắt buộc)").nth(i).fill("90000");
    }
  }
  await page.getByRole("radio", { name: "Chưa trả (ghi nợ)" }).check();
  await page.getByLabel("Ghi chú").fill("Nhập lại phiếu " + phieu.code + " — giò 90.000/kg theo hóa đơn");
  await thongBao(page, /Đã nhập hàng — phiếu PN\d+/, () => form.getByRole("button", { name: "Hoàn thành" }).click());
  expect(await onHand("Giò heo")).toBeCloseTo(truocGio, 3);
  const moi = page.url().split("/").pop()!;
  const { data: r } = await db.from("purchase_receipts").select("total").eq("id", moi).single();
  expect(phieu.total - r!.total).toBe(3.5 * 5000);
  // Công nợ anh Bình giảm đúng 17.500đ.
  const { data: sum1 } = await db.rpc("supplier_summaries", { p_tenant: tenant });
  const binh = (await db.from("suppliers").select("id").eq("tenant_id", tenant).like("name", "Gà ta Sóc Sơn%").single()).data!.id;
  const debt = (arr: unknown) => Number((arr as { supplier_id: string; debt: number }[]).find((x) => x.supplier_id === binh)!.debt);
  expect(debt(sum0) - debt(sum1)).toBe(17_500);
  await page.screenshot({ path: `${ANH}/05-nhap-lai-phieu-hom-qua-sua-gia.png`, fullPage: true });
});

test("3. Lưu tạm phiếu bia 1 thùng → mở lại sửa 2 thùng → Hoàn thành (chuyển khoản)", async ({ page }) => {
  await dangNhap(page);
  const truoc = await onHand("Bia Hà Nội");
  await page.goto(`/r/${SLUG}/admin/nhap-hang/moi`, { waitUntil: "networkidle" });
  await chonNcc(page, "Đại lý bia Hà Nội");
  await dong(page, 0, "Bia Hà Nội", "1", "360000");
  await page.getByRole("radio", { name: "Chuyển khoản" }).check();
  await thongBao(page, /Đã lưu tạm phiếu PN\d+/, () => page.getByRole("button", { name: "Lưu tạm" }).click());
  const id = page.url().split("/").pop()!;
  expect(await entries(id)).toEqual([]);
  expect(await onHand("Bia Hà Nội")).toBeCloseTo(truoc, 3);

  await page.goto(`/r/${SLUG}/admin/nhap-hang/${id}`, { waitUntil: "networkidle" });
  const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Hoàn thành" }) });
  await expect(form.getByLabel(/^Số lượng/).first()).toHaveValue("1");
  await form.getByLabel(/^Số lượng/).first().fill("2");
  await page.screenshot({ path: `${ANH}/06-phieu-tam-sua-2-thung.png`, fullPage: true });
  await thongBao(page, /Đã nhập hàng — phiếu PN\d+/, () => form.getByRole("button", { name: "Hoàn thành" }).click());
  expect(await onHand("Bia Hà Nội")).toBeCloseTo(truoc + 48, 3);
  const { data: chi } = await db.from("cash_vouchers").select("amount, fund").eq("purchase_receipt_id", id);
  expect(chi).toEqual([{ amount: 720000, fund: "bank" }]);
});

test("4. Nhập phần còn lại buổi sáng bằng 'Lấy hàng lần trước' (chợ, không chọn NCC = trả đủ)", async ({ page }) => {
  await dangNhap(page);
  await page.goto(`/r/${SLUG}/admin/nhap-hang/moi`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Lấy hàng lần trước" }).click();
  const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Hoàn thành" }) });
  const muc: Record<string, [string, string]> = {
    "Bánh phở": ["12", "18000"], "Bún tươi": ["4", "15000"], "Rau thơm": ["3", "40000"], "Gà ta": ["4", "130000"],
    "Xương ống bò": ["8", "45000"], "Tôm sú": ["0,5", "230000"],
  };
  const n = await form.getByLabel("Nguyên liệu").count();
  let daGo = 0;
  for (let i = 0; i < n; i++) {
    const id = await form.getByLabel("Nguyên liệu").nth(i).inputValue();
    const name = Object.keys(ing).find((k) => ing[k].id === id)!;
    if (muc[name]) {
      daGo++;
      await form.getByLabel(/^Số lượng/).nth(i).fill(muc[name][0]);
      await form.getByLabel("Đơn giá (không bắt buộc)").nth(i).fill(muc[name][1]);
    }
  }
  await page.screenshot({ path: `${ANH}/07-lay-hang-lan-truoc.png`, fullPage: true });
  await thongBao(page, /Đã nhập hàng — phiếu PN\d+/, () => form.getByRole("button", { name: "Hoàn thành" }).click());
  const e = await entries(page.url().split("/").pop()!);
  // Dòng để trống số lượng = không nhập → chỉ có đúng các nguyên liệu đã gõ.
  // (hàng lần trước chỉ gồm nguyên liệu đã nhập ngày gần nhất — hôm qua không nhập tôm thì không có dòng tôm)
  expect(e.length).toBe(daGo);
  expect(n).toBeGreaterThan(daGo);
});

test("5. Nấu 1 mẻ nước dùng thực 28,5 lít (hụt 1,5); ghi nhầm thêm 2 mẻ → Hủy mẻ: nguyên liệu trả lại, nước dùng trừ đi", async ({ page }) => {
  await dangNhap(page);
  const truoc = await onHand("Nước dùng phở");
  const xuong = await onHand("Xương ống bò");
  await page.goto(`/r/${SLUG}/admin/inventory/stock`, { waitUntil: "networkidle" });
  const ghiMe = async (me: string, thuc: string) => {
    await page.locator('select[name="ingredient_id"]').selectOption({ label: "Nước dùng phở" });
    await page.locator('input[name="batch_count"]').fill(me);
    await page.getByLabel(/^Thực ra được/).fill(thuc);
    await thongBao(page, `Đã ghi ${me} mẻ Nước dùng phở.`, () => page.getByRole("button", { name: "Ghi phiếu chế biến" }).click());
  };
  await ghiMe("1", "28,5");
  expect(await onHand("Nước dùng phở")).toBeCloseTo(truoc + 28.5, 3);
  expect(await onHand("Xương ống bò")).toBeCloseTo(xuong - 8, 3);

  // Ghi nhầm: bấm thêm 2 mẻ 60 lít (thật ra chỉ nấu 1 mẻ) → Hủy ở danh sách "Mẻ hôm nay".
  await ghiMe("2", "60");
  expect(await onHand("Nước dùng phở")).toBeCloseTo(truoc + 88.5, 3);
  expect(await onHand("Xương ống bò")).toBeCloseTo(xuong - 24, 3);
  const me = page.locator("[data-me-hom-nay] li").filter({ hasText: "thực 60 lít" });
  await page.screenshot({ path: `${ANH}/08a-me-hom-nay-ghi-nham.png`, fullPage: true });
  let hoi = "";
  page.once("dialog", (d) => {
    hoi = d.message();
    void d.accept();
  });
  await thongBao(page, "Đã hủy mẻ", () => me.getByRole("button", { name: "Hủy" }).click());
  expect(hoi).toContain("Nguyên liệu được trả lại");
  expect(await onHand("Nước dùng phở")).toBeCloseTo(truoc + 28.5, 3);
  expect(await onHand("Xương ống bò")).toBeCloseTo(xuong - 8, 3);
  const { data: b } = await db.from("production_batches").select("expected_qty, actual_qty").eq("tenant_id", tenant).eq("business_date", vnToday());
  expect(b).toEqual([{ expected_qty: 30, actual_qty: 28.5 }]);
});

test("6. Xuất hủy: rau 0,3 kg, cơm nhân viên gà 0,5 kg; gõ nhầm tôm 3 kg → Hủy phiếu (cộng lại tồn) → ghi lại 0,3 kg", async ({ page }) => {
  await dangNhap(page);
  await page.goto(`/r/${SLUG}/admin/inventory/count`, { waitUntil: "networkidle" });
  const huy = async (name: string, qty: string, reason: string, note: string) => {
    const f = page.locator("form").filter({ has: page.getByRole("button", { name: "Ghi phiếu hủy" }) });
    await f.locator('select[name="ingredient_id"]').selectOption({ label: name });
    await f.locator('input[name="qty"]').fill(qty);
    await f.locator('select[name="reason"]').selectOption({ label: reason });
    await f.locator('input[name="note"]').fill(note);
    await thongBao(page, `Đã ghi hủy ${name.replace(/ \(.*/, "")}.`, () => f.getByRole("button", { name: "Ghi phiếu hủy" }).click());
  };
  await huy("Rau thơm (kg)", "0,3", "Hỏng / hết hạn", "Rau héo");
  await huy("Gà ta (kg)", "0,5", "Cơm nhân viên", "Cơm trưa nhân viên");
  const tom = await onHand("Tôm sú");
  await huy("Tôm sú (kg)", "3", "Hỏng / hết hạn", "Tôm ươn (gõ nhầm)");
  expect(await onHand("Tôm sú")).toBeCloseTo(tom - 3000, 3);
  await page.screenshot({ path: `${ANH}/08-xuat-huy-go-nham.png`, fullPage: true });

  let hoi = "";
  page.once("dialog", (d) => {
    hoi = d.message();
    void d.accept();
  });
  const dong = page.locator("[data-phieu-huy] li").filter({ hasText: "Tôm ươn (gõ nhầm)" });
  await thongBao(page, "Đã hủy phiếu hủy", () => dong.getByRole("button", { name: "Hủy" }).click());
  expect(hoi).toContain("Tồn kho được cộng lại");
  expect(await onHand("Tôm sú")).toBeCloseTo(tom, 3);
  await expect(page.locator("[data-phieu-huy] li").filter({ hasText: "Tôm ươn (gõ nhầm)" })).toHaveCount(0);
  await huy("Tôm sú (kg)", "0,3", "Hỏng / hết hạn", "Tôm ươn");
  expect(await onHand("Tôm sú")).toBeCloseTo(tom - 300, 3);
  const { data: w } = await db
    .from("stock_entries")
    .select("qty")
    .eq("tenant_id", tenant)
    .eq("kind", "waste")
    .eq("ingredient_id", ing["Tôm sú"].id)
    .eq("business_date", vnToday());
  expect(w).toEqual([{ qty: -300 }]);
  await page.screenshot({ path: `${ANH}/08b-xuat-huy-da-sua.png`, fullPage: true });
});

test("7. Kiểm kê: số âm bị chặn; gõ 16 thay 1,6 → 'Lệch lớn' hỏi lại → sửa; bia đếm theo CHAI → sổ đúng số chai", async ({ page }) => {
  await dangNhap(page);
  await page.goto(`/r/${SLUG}/admin/inventory/count`, { waitUntil: "networkidle" });
  const so = { bo: await onHand("Thịt bò thăn"), bia: await onHand("Bia Hà Nội"), tom: await onHand("Tôm sú") };
  // Kho thật: bò hụt ~250 g so với sổ, bia mất 1 chai, tôm khớp sổ (trưa bán quá số còn thì đếm được 0).
  const boThat = Math.round((so.bo - 250) / 50) * 50;
  const biaThat = Math.round(so.bia) - 1;
  const tomThat = Math.max(0, Math.round(so.tom / 50) * 50);
  const box = (name: string) => page.getByRole("textbox", { name: `Thực tế ${name}`, exact: true });
  const soDongKiemKe = async () =>
    (
      await db
        .from("stock_entries")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenant)
        .eq("kind", "count_adjust")
        .eq("business_date", vnToday())
    ).count;

  // Số âm: dòng báo "Số không hợp lệ", Hoàn thành không gửi gì.
  await box("Tôm sú").fill("-0,3");
  await expect(page.getByLabel("SL lệch Tôm sú")).toHaveText("Số không hợp lệ");
  await expect(page.getByText(/Số đếm không hợp lệ: Tôm sú/)).toBeVisible();
  await page.screenshot({ path: `${ANH}/09a-kiem-ke-so-am.png`, fullPage: true });
  await page.getByRole("button", { name: "Hoàn thành" }).click();
  await page.waitForTimeout(1500);
  expect(await soDongKiemKe()).toBe(0);
  await box("Tôm sú").fill((tomThat / 1000).toLocaleString("vi-VN"));

  await box("Thịt bò thăn").fill((boThat / 100).toLocaleString("vi-VN")); // gõ nhầm: 1,6 → 16
  // (tôm sổ âm mà đếm 0 cũng là lệch lớn — đúng luật; ở đây kiểm dòng bò)
  await expect(page.locator("[data-lech-lon]").filter({ hasText: "Thịt bò thăn" })).toHaveCount(1);
  await page.screenshot({ path: `${ANH}/09-kiem-ke-lech-lon.png`, fullPage: true });
  let msg = "";
  page.once("dialog", (d) => {
    msg = d.message();
    void d.dismiss();
  });
  await page.getByRole("button", { name: "Hoàn thành" }).click();
  await expect.poll(() => msg).toContain("Lệch lớn — kiểm tra lại số đếm");
  expect(await soDongKiemKe()).toBe(0);
  await box("Thịt bò thăn").fill((boThat / 1000).toLocaleString("vi-VN"));

  // Bia: chọn đơn vị "cái" (chai) ngay trên dòng như KiotViet → gõ đúng số chai đếm được, không phải chia 24.
  await page.getByLabel("Đơn vị đếm Bia Hà Nội").selectOption({ label: "cái" });
  await box("Bia Hà Nội").fill(String(biaThat));
  const lech = Math.round((biaThat - so.bia) * 1000) / 1000;
  await expect(page.getByLabel("SL lệch Bia Hà Nội")).toContainText(`${lech.toLocaleString("vi-VN", { maximumFractionDigits: 3 })} cái`);
  await page.screenshot({ path: `${ANH}/10-kiem-ke-sua-so-bia-theo-chai.png`, fullPage: true });
  page.once("dialog", (d) => d.accept());
  await thongBao(page, /Đã ghi kiểm kê \d+ nguyên liệu\./, () => page.getByRole("button", { name: "Hoàn thành" }).click());
  expect(await onHand("Thịt bò thăn")).toBeCloseTo(boThat, 3);
  expect(await onHand("Tôm sú")).toBeCloseTo(tomThat, 3);
  expect(await onHand("Bia Hà Nội")).toBe(biaThat);
});

test("8. Tồn đầu kỳ: thêm nguyên liệu kèm 'Tồn hiện có' → dòng nhập 'Tồn đầu kỳ' có giá; khai sau được 1 lần; đã có phát sinh thì không còn ô", async ({ page }) => {
  await dangNhap(page);
  const duoi = Date.now().toString(36).slice(-4);
  const ten = `Nước mắm Phú Quốc ${duoi}`;
  const ten2 = `Ớt tươi ${duoi}`;
  await page.goto(`/r/${SLUG}/admin/inventory`, { waitUntil: "networkidle" });
  const them = page.locator("form").filter({ has: page.getByRole("button", { name: "Thêm nguyên liệu" }) });
  await them.locator('input[name="name"]').fill(ten);
  await them.locator('select[name="base_unit"]').selectOption("ml");
  await them.locator('input[name="purchase_unit"]').fill("chai");
  await them.locator('input[name="purchase_factor"]').fill("500");
  await them.locator("label", { hasText: "Giá gần nhất" }).locator("input:visible").fill("60000");
  await them.locator('input[name="opening_qty"]').fill("6");
  await expect(them.locator("[data-ton-dau]")).toContainText("chai");
  await page.screenshot({ path: `${ANH}/11a-them-nguyen-lieu-ton-hien-co.png`, fullPage: true });
  await thongBao(page, `Đã thêm "${ten}" kèm tồn hiện có.`, () => them.getByRole("button", { name: "Thêm nguyên liệu" }).click());
  const { data: nm } = await db.from("ingredients").select("id").eq("tenant_id", tenant).eq("name", ten).single();
  try {
    const { data: e } = await db
      .from("stock_entries")
      .select("kind, qty, unit_cost, note, purchase_receipt_id, business_date")
      .eq("ingredient_id", nm!.id);
    expect(e).toEqual([{ kind: "receipt", qty: 3000, unit_cost: 120, note: "Tồn đầu kỳ", purchase_receipt_id: null, business_date: vnToday() }]);

    // Tồn đầu vào tồn như hàng nhập: tab Tồn kho có nước mắm 6 chai.
    await page.goto(`/r/${SLUG}/admin/inventory/stock`, { waitUntil: "networkidle" });
    await expect(page.locator("[data-ton-kho] li").filter({ hasText: ten })).toContainText("6 chai (3.000 ml)");

    // Thẻ nguyên liệu theo TÊN CHÍNH (ô chọn công thức của nước dùng cũng chứa tên mọi nguyên liệu).
    const the = (t: string) => page.locator("ul > li").filter({ has: page.locator("span.font-medium").getByText(t, { exact: true }) });
    // Thêm không kèm tồn → form Sửa vẫn có ô "Tồn hiện có" → khai sau → lần sau không còn ô.
    await page.goto(`/r/${SLUG}/admin/inventory`, { waitUntil: "networkidle" });
    await them.locator('input[name="name"]').fill(ten2);
    await them.locator('select[name="base_unit"]').selectOption("g");
    await them.locator('input[name="purchase_unit"]').fill("kg");
    await thongBao(page, `Đã thêm "${ten2}".`, () => them.getByRole("button", { name: "Thêm nguyên liệu" }).click());
    const card = the(ten2);
    await card.getByText("Sửa", { exact: true }).click();
    await card.locator('input[name="opening_qty"]').fill("0,5");
    await thongBao(page, `Đã lưu "${ten2}" kèm tồn hiện có.`, () => card.getByRole("button", { name: "Lưu" }).click());
    const { data: ot } = await db.from("ingredients").select("id").eq("tenant_id", tenant).eq("name", ten2).single();
    const { data: e2 } = await db.from("stock_entries").select("qty, note").eq("ingredient_id", ot!.id);
    expect(e2).toEqual([{ qty: 500, note: "Tồn đầu kỳ" }]);
    await page.goto(`/r/${SLUG}/admin/inventory`, { waitUntil: "networkidle" });
    const card2 = the(ten2);
    await card2.getByText("Sửa", { exact: true }).click();
    await expect(card2.locator('input[name="opening_qty"]')).toHaveCount(0);
    const bo = the("Thịt bò thăn");
    await bo.getByText("Sửa", { exact: true }).click();
    await expect(bo.locator('input[name="opening_qty"]')).toHaveCount(0);
  } finally {
    // Dọn: hai nguyên liệu thử không thuộc kịch bản quán.
    const { data: ids } = await db.from("ingredients").select("id").eq("tenant_id", tenant).in("name", [ten, ten2]);
    const list = (ids ?? []).map((x) => x.id);
    await db.from("stock_entries").delete().in("ingredient_id", list);
    await db.from("ingredients").delete().in("id", list);
  }
});
