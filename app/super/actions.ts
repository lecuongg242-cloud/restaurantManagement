"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSuperAdmin } from "@/lib/auth/session";
import { slugify } from "@/lib/utils";
import { provisionPrintBridgeAccount } from "@/lib/print/bridge-account";
import { createActivationCode, revokePrintBridge } from "@/lib/print/activation";
import { gioVn } from "@/lib/time/vn";
import { bankByBin } from "@/lib/payments/banks";
import { khongDauInHoa } from "@/lib/payments/vietqr";
import { provisionOwner } from "@/lib/tenant/provision-owner";

/** Đăng nhập super-admin (email/mật khẩu Supabase). */
export async function superSignIn(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    redirect(`/super/login?error=${encodeURIComponent("Email hoặc mật khẩu sai.")}`);
  }

  // Chỉ super-admin mới được vào /super.
  const su = await isSuperAdmin();
  if (!su) {
    await supabase.auth.signOut();
    redirect(`/super/login?error=${encodeURIComponent("Tài khoản không có quyền super-admin.")}`);
  }

  redirect("/super");
}

export async function superSignOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/super/login");
}

/**
 * Tạo nhà hàng (tenant) + tài khoản owner. Chỉ super-admin.
 * Dùng SERVICE ROLE để tạo auth user + ghi bảng (bỏ qua RLS có chủ đích).
 */
export async function createTenant(formData: FormData) {
  const su = await isSuperAdmin();
  if (!su) redirect("/super/login");

  const name = String(formData.get("name") ?? "").trim();
  const slugRaw = String(formData.get("slug") ?? "").trim();
  const slug = slugRaw ? slugify(slugRaw) : slugify(name);
  const ownerEmail = String(formData.get("ownerEmail") ?? "").trim();
  const ownerPassword = String(formData.get("ownerPassword") ?? "");

  const fail = (msg: string): never =>
    redirect(`/super/new?error=${encodeURIComponent(msg)}`);

  if (!name) fail("Thiếu tên nhà hàng.");
  if (!slug) fail("Slug không hợp lệ.");
  if (!ownerEmail) fail("Thiếu email owner.");
  if (ownerPassword.length < 6) fail("Mật khẩu owner tối thiểu 6 ký tự.");

  const admin = createAdminClient();

  // 1) Tạo tenant trước (bắt trùng slug sớm).
  const { data: tenant, error: tErr } = await admin
    .from("tenants")
    .insert({ name, slug })
    .select("id, slug")
    .single();
  if (tErr || !tenant) {
    fail(
      tErr?.code === "23505"
        ? `Slug "${slug}" đã tồn tại.`
        : `Không tạo được nhà hàng: ${tErr?.message ?? "lỗi không rõ"}`
    );
  }

  const tenantId = tenant!.id;

  // 2) Tài khoản owner: tạo mới, hoặc TÁI DÙNG nếu email đã có. Chủ đang dùng ở quán khác (chủ chuỗi) thì
  //    GIỮ mật khẩu cũ; tài khoản mồ côi thì đặt mật khẩu theo form (lib/tenant/provision-owner.ts).
  const chu = await provisionOwner(admin, ownerEmail, ownerPassword);
  if (!chu.ok) {
    await admin.from("tenants").delete().eq("id", tenantId);
    fail(chu.error);
    return;
  }
  const ownerId = chu.userId;
  const ownerCreated = chu.created;

  // 3) Profile + membership owner.
  await admin.from("profiles").upsert({ id: ownerId, full_name: ownerEmail });
  const { error: mErr } = await admin.from("memberships").insert({
    tenant_id: tenantId,
    user_id: ownerId,
    role: "owner",
    display_name: ownerEmail,
    active: true,
  });
  if (mErr) {
    // Chỉ xoá auth user nếu chính lần này ta tạo nó (đừng xoá tài khoản tái dùng).
    if (ownerCreated) await admin.auth.admin.deleteUser(ownerId);
    await admin.from("tenants").delete().eq("id", tenantId);
    fail(`Không gán được owner: ${mErr.message}`);
  }

  revalidatePath("/super", "layout");
  redirect(
    `/super/nha-hang?created=${encodeURIComponent(tenant!.slug)}${chu.passwordSet ? "" : "&giu_mat_khau=1"}`
  );
}

/**
 * State trả về cho các action cập nhật TẠI CHỖ (dùng với useActionState ở client):
 * không redirect → URL giữ nguyên /super; phản hồi hiện inline.
 */
export type SuperActionState = { ok?: string; error?: string };

/**
 * Đặt lại mật khẩu owner của một nhà hàng — TRỰC TIẾP, không gửi email.
 * Chỉ super-admin. Dùng SERVICE ROLE (updateUserById) để đổi ngay lập tức.
 * Đây là cơ chế "quên mật khẩu" cấp hệ thống: owner mất mật khẩu → super-admin đặt lại.
 */
export async function resetOwnerPassword(
  _prev: SuperActionState,
  formData: FormData
): Promise<SuperActionState> {
  const su = await isSuperAdmin();
  if (!su) redirect("/super/login");

  const tenantId = String(formData.get("tenant_id") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!tenantId) return { error: "Thiếu nhà hàng." };
  if (password.length < 8) return { error: "Mật khẩu tối thiểu 8 ký tự." };

  const admin = createAdminClient();

  // Tìm tài khoản owner của tenant.
  const { data: owner, error: mErr } = await admin
    .from("memberships")
    .select("user_id, display_name")
    .eq("tenant_id", tenantId)
    .eq("role", "owner")
    .eq("active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (mErr) return { error: `Không tra được owner: ${mErr.message}` };
  if (!owner) return { error: "Nhà hàng này chưa có tài khoản owner." };

  const { error: uErr } = await admin.auth.admin.updateUserById(owner.user_id, {
    password,
    email_confirm: true, // đảm bảo owner đăng nhập được (kể cả khi email trước đó chưa confirm)
  });
  if (uErr) return { error: `Không đổi được mật khẩu: ${uErr.message}` };

  return { ok: `Đã đặt lại mật khẩu cho ${owner.display_name ?? "owner"}.` };
}

/**
 * Tạm ngưng / kích hoạt lại nhà hàng (đổi tenants.status). Chỉ super-admin.
 * "suspended" hồi phục được — KHÔNG xoá dữ liệu. Cập nhật tại chỗ (pill đổi ngay).
 */
export async function setTenantStatus(
  _prev: SuperActionState,
  formData: FormData
): Promise<SuperActionState> {
  const su = await isSuperAdmin();
  if (!su) redirect("/super/login");

  const tenantId = String(formData.get("tenant_id") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();
  if (status !== "active" && status !== "suspended") {
    return { error: "Trạng thái không hợp lệ." };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("tenants")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", tenantId);
  if (error) return { error: error.message };

  revalidatePath("/super", "layout");
  return {};
}

/**
 * Xoá vĩnh viễn nhà hàng. Chỉ super-admin. AN TOÀN:
 *  - Chỉ xoá được nhà hàng đã "suspended" (buộc tạm ngưng trước).
 *  - Phải gõ đúng slug để xác nhận.
 * Xoá dòng tenant → mọi bảng con ON DELETE CASCADE tự xoá theo. KHÔNG hồi phục.
 * Tài khoản auth owner + ảnh storage giữ lại (dọn riêng nếu cần).
 */
export async function deleteTenant(
  _prev: SuperActionState,
  formData: FormData
): Promise<SuperActionState> {
  const su = await isSuperAdmin();
  if (!su) redirect("/super/login");

  const tenantId = String(formData.get("tenant_id") ?? "").trim();
  const confirmSlug = String(formData.get("confirm_slug") ?? "").trim();

  if (!tenantId) return { error: "Thiếu nhà hàng." };

  const admin = createAdminClient();
  const { data: tenant } = await admin
    .from("tenants")
    .select("id, slug, name, status")
    .eq("id", tenantId)
    .maybeSingle();

  if (!tenant) return { error: "Không tìm thấy nhà hàng." };
  if (tenant.status !== "suspended") {
    return { error: "Chỉ xoá được nhà hàng đã tạm ngưng. Hãy tạm ngưng trước." };
  }
  if (confirmSlug !== tenant.slug) {
    return { error: "Slug xác nhận không khớp — nhập đúng slug để xoá." };
  }

  const { error } = await admin.from("tenants").delete().eq("id", tenantId);
  if (error) return { error: `Không xoá được: ${error.message}` };

  revalidatePath("/super", "layout");
  return {};
}

/**
 * Cấp (hoặc xoay) tài khoản THIẾT BỊ cho cầu in của một nhà hàng — QD-012 §1, PRINT-05.
 * Chỉ super-admin. Lớp mỏng: kiểm quyền + tra tenant, phần việc thật nằm ở
 * `lib/print/bridge-account.ts` (tách ra để test được bằng DB thật).
 *
 * Đặt ở /super chứ không phải /admin: cầu in do chúng ta lắp khi mở quán. Đưa vào khu admin sẽ
 * phải mở `canAssignRole` cho vai trò `printer` và biến khóa thiết bị thành thứ chủ quán tự phát.
 */
export async function createPrintBridgeAccount(
  _prev: SuperActionState,
  formData: FormData
): Promise<SuperActionState> {
  const su = await isSuperAdmin();
  if (!su) redirect("/super/login");

  const tenantId = String(formData.get("tenant_id") ?? "").trim();
  if (!tenantId) return { error: "Thiếu nhà hàng." };

  const admin = createAdminClient();
  const { data: tenant, error: tErr } = await admin
    .from("tenants")
    .select("id, slug, name")
    .eq("id", tenantId)
    .maybeSingle();
  if (tErr) return { error: `Không tra được nhà hàng: ${tErr.message}` };
  if (!tenant) return { error: "Không tìm thấy nhà hàng." };

  try {
    const { email, password } = await provisionPrintBridgeAccount(admin, {
      tenantId: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
    });
    revalidatePath("/super", "layout");
    return {
      ok:
        `PRINT_BRIDGE_EMAIL=${email}\nPRINT_BRIDGE_PASSWORD=${password}\n\n` +
        `Chép hai dòng trên vào .env.local của máy cầu in. Mật khẩu KHÔNG hiện lại lần nữa.`,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Không cấp được tài khoản cầu in." };
  }
}

/**
 * Tạo mã kích hoạt cầu in cho một quán (PRINT-11, QD-019 D6). Người lắp gõ mã này vào bộ cài chung —
 * không còn gói cài riêng từng quán mang sẵn mật khẩu. Từ PRINT-17 chủ quán cũng tự tạo được ở
 * Admin → Máy in (`taoMaKichHoat`); lối này giữ cho quản trị hệ thống lắp hộ.
 */
export async function createBridgeActivationCode(
  _prev: SuperActionState,
  formData: FormData
): Promise<SuperActionState> {
  const su = await isSuperAdmin();
  if (!su) redirect("/super/login");

  const tenantId = String(formData.get("tenant_id") ?? "").trim();
  if (!tenantId) return { error: "Thiếu nhà hàng." };

  const admin = createAdminClient();
  const { data: tenant } = await admin.from("tenants").select("id, status").eq("id", tenantId).maybeSingle();
  if (!tenant) return { error: "Không tìm thấy nhà hàng." };
  if (tenant.status !== "active") return { error: "Nhà hàng đang tạm ngưng — không cấp cầu in." };

  try {
    const { code, expiresAt } = await createActivationCode(admin, { tenantId, createdBy: null });
    const het = gioVn(expiresAt);
    return {
      ok: `${code.slice(0, 4)}-${code.slice(4)}

Đọc mã này cho người lắp. Dùng một lần, hết hạn lúc ${het}.`,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Không tạo được mã kích hoạt." };
  }
}

/** Thu hồi cầu in của một quán (máy mất, quán ngừng dùng) — cầu in mất quyền ngay. */
export async function revokeBridge(_prev: SuperActionState, formData: FormData): Promise<SuperActionState> {
  const su = await isSuperAdmin();
  if (!su) redirect("/super/login");

  const tenantId = String(formData.get("tenant_id") ?? "").trim();
  if (!tenantId) return { error: "Thiếu nhà hàng." };

  try {
    const n = await revokePrintBridge(createAdminClient(), tenantId);
    revalidatePath("/super", "layout");
    return { ok: n > 0 ? "Đã thu hồi. Cầu in của quán không in được nữa." : "Quán chưa có cầu in nào." };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Không thu hồi được." };
  }
}

/**
 * Sửa `paid_until` TAY (13-03) — dự phòng và cách sửa khi ghi nhận nhầm (nhật ký gia hạn chỉ thêm, không
 * xóa). Để trống = KHÔNG GIỚI HẠN. Service role vì authenticated không có quyền cột này (0020).
 */
export async function setPaidUntil(
  _prev: SuperActionState,
  formData: FormData
): Promise<SuperActionState> {
  const su = await isSuperAdmin();
  if (!su) redirect("/super/login");

  const tenantId = String(formData.get("tenant_id") ?? "").trim();
  const raw = String(formData.get("paid_until") ?? "").trim();
  if (raw && !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return { error: "Ngày không hợp lệ." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tenants")
    .update({ paid_until: raw || null, updated_at: new Date().toISOString() })
    .eq("id", tenantId)
    .select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "Không tìm thấy nhà hàng." };

  revalidatePath("/super", "layout");
  return { ok: raw ? "Đã đặt hạn dùng." : "Đã chuyển sang không giới hạn." };
}

/**
 * Ghi nhận một lần gia hạn (13-04, SUB-04; 0059). Ba kiểu:
 *  - `thang`: cộng N tháng từ max(hôm nay, hạn cũ) — `record_subscription_payment`.
 *  - `ngay`: đặt hạn tới đúng ngày chọn trên lịch — `record_subscription_until`.
 *  - `vv`: vĩnh viễn, quán thành không giới hạn — `record_subscription_lifetime`.
 * Gọi RPC bằng PHIÊN super-admin (không phải service role): RPC tự kiểm is_super_admin(), đổi hạn và ghi
 * nhật ký trong một giao dịch, lưu người ghi = auth.uid().
 */
export async function recordRenewal(
  _prev: SuperActionState,
  formData: FormData
): Promise<SuperActionState> {
  const su = await isSuperAdmin();
  if (!su) redirect("/super/login");

  const tenantId = String(formData.get("tenant_id") ?? "").trim();
  const kieu = String(formData.get("kieu") ?? "thang");
  const amount = Number(String(formData.get("amount") ?? "").replace(/[^\d]/g, ""));
  const note = String(formData.get("note") ?? "").trim().slice(0, 500) || null;
  const startLimited = formData.get("start_limited") === "on";
  if (!Number.isInteger(amount) || amount < 0) return { error: "Số tiền không hợp lệ." };

  const supabase = await createClient();
  let res;
  if (kieu === "vv") {
    res = await supabase.rpc("record_subscription_lifetime", { p_tenant: tenantId, p_amount: amount, p_note: note });
  } else if (kieu === "ngay") {
    const until = String(formData.get("until") ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(until)) return { error: "Chưa chọn ngày hết hạn." };
    res = await supabase.rpc("record_subscription_until", {
      p_tenant: tenantId,
      p_until: until,
      p_amount: amount,
      p_note: note,
      p_start_limited: startLimited,
    });
  } else {
    const months = Number(formData.get("months"));
    if (!(Number.isInteger(months) && months >= 1 && months <= 120)) return { error: "Số tháng phải từ 1 đến 120." };
    res = await supabase.rpc("record_subscription_payment", {
      p_tenant: tenantId,
      p_months: months,
      p_amount: amount,
      p_note: note,
      p_start_limited: startLimited,
    });
  }

  const { data, error } = res;
  if (error) {
    const m = error.message;
    return {
      error: /KHONG GIOI HAN/.test(m)
        ? "Quán đang KHÔNG GIỚI HẠN — tích “Chuyển quán sang có hạn” nếu thật sự muốn."
        : /sau han hien tai/.test(m)
          ? "Ngày chọn phải sau hạn hiện tại. Muốn rút ngắn hạn thì dùng “Sửa hạn tay”."
          : /sau hom nay/.test(m)
            ? "Ngày hết hạn phải sau hôm nay."
            : m,
    };
  }

  revalidatePath("/super", "layout");
  if (kieu === "vv") return { ok: "Đã chuyển quán sang VĨNH VIỄN (không giới hạn)." };
  const after = (data as { paid_until_after?: string } | null)?.paid_until_after;
  return { ok: after ? `Đã gia hạn tới ${after.split("-").reverse().join("/")}.` : "Đã ghi nhận." };
}

/**
 * Lưu cấu hình nền tảng (0060) — tài khoản nhận tiền gia hạn, số hỗ trợ (giá theo gói: `savePlan`). Ghi bằng PHIÊN super-admin
 * (RLS `platform_settings_super` kiểm lần nữa). Kiểm từng trường và báo lỗi cụ thể: số tài khoản sai là tiền
 * của quán chuyển đi lạc. Để trống số tài khoản = gỡ tài khoản (trang Gia hạn thôi hiện QR, trừ khi có env).
 */
export async function savePlatformSettings(
  _prev: SuperActionState,
  formData: FormData
): Promise<SuperActionState> {
  const su = await isSuperAdmin();
  if (!su) redirect("/super/login");

  const bin = String(formData.get("bank_bin") ?? "").trim();
  const accountNo = String(formData.get("bank_account_no") ?? "").replace(/[\s.-]/g, "");
  const accountName = khongDauInHoa(String(formData.get("bank_account_name") ?? "")).slice(0, 50);
  const supportPhone = String(formData.get("support_phone") ?? "").trim().slice(0, 30);

  if (accountNo) {
    if (!bankByBin(bin)) return { error: "Chưa chọn ngân hàng." };
    if (!/^\d{6,19}$/.test(accountNo)) return { error: "Số tài khoản chỉ gồm chữ số, 6–19 số." };
    if (!accountName) return { error: "Thiếu tên chủ tài khoản." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("platform_settings")
    .upsert({
      id: true,
      bank_bin: accountNo ? bin : null,
      bank_account_no: accountNo || null,
      bank_account_name: accountNo ? accountName : null,
      support_phone: supportPhone || null,
      updated_at: new Date().toISOString(),
      updated_by: su.userId,
    })
    .select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "Không lưu được (thiếu quyền super-admin?)." };

  revalidatePath("/super", "layout");
  return { ok: "Đã lưu cài đặt nền tảng." };
}

/**
 * Thêm / sửa một gói dịch vụ (0061). Có `plan_id` = sửa. Thời hạn: số tháng 1–120, hoặc tích "vĩnh viễn".
 * Ghi bằng phiên super-admin (RLS `platform_plans_super`).
 */
export async function savePlan(_prev: SuperActionState, formData: FormData): Promise<SuperActionState> {
  const su = await isSuperAdmin();
  if (!su) redirect("/super/login");

  const id = String(formData.get("plan_id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim().slice(0, 60);
  const vinhVien = formData.get("lifetime") === "on";
  const months = Number(formData.get("months"));
  const price = Number(String(formData.get("price") ?? "").replace(/[^\d]/g, ""));
  const visible = formData.get("visible") === "on";

  if (!name) return { error: "Thiếu tên gói." };
  if (!vinhVien && !(Number.isInteger(months) && months >= 1 && months <= 120)) {
    return { error: "Thời hạn phải từ 1 đến 120 tháng (hoặc tích Vĩnh viễn)." };
  }
  if (!Number.isInteger(price) || price <= 0 || price > 2_000_000_000) return { error: "Giá phải là số tiền dương (đồng)." };

  const row = { name, months: vinhVien ? null : months, price, visible };
  const supabase = await createClient();
  const { data, error } = id
    ? await supabase.from("platform_plans").update(row).eq("id", id).select("id")
    : await supabase.from("platform_plans").insert(row).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "Không lưu được (thiếu quyền super-admin?)." };

  revalidatePath("/super", "layout");
  return { ok: id ? "Đã lưu gói." : `Đã thêm gói “${name}”.` };
}

/** Xóa một gói (0061). Lịch sử gia hạn giữ nguyên — nhật ký lưu số tháng + số tiền, không trỏ tới gói. */
export async function deletePlan(_prev: SuperActionState, formData: FormData): Promise<SuperActionState> {
  const su = await isSuperAdmin();
  if (!su) redirect("/super/login");
  const id = String(formData.get("plan_id") ?? "").trim();
  const supabase = await createClient();
  const { data, error } = await supabase.from("platform_plans").delete().eq("id", id).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "Không xóa được." };
  revalidatePath("/super", "layout");
  return { ok: "Đã xóa gói." };
}
