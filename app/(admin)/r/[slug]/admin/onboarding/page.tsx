import Link from "next/link";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/env";
import { SetupNotice } from "@/components/setup-notice";
import { btn, input, alertError, alertOk, eyebrow } from "@/lib/ui";
import {
  saveRestaurantInfo,
  quickMenu,
  addAreaWithTables,
  openPrintPage,
  dismissOnboarding,
} from "./actions";

const STEPS = ["Nhà hàng", "Menu", "Bàn", "In QR"] as const;

/**
 * Wizard onboarding 4 bước — khớp 1-1 câu chữ TENANT-03:
 * "nhà hàng + 10 món + 5 bàn + in QR" trong ≤ 15 phút.
 */
export default async function OnboardingPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ step?: string; err?: string; ok?: string }>;
}) {
  const { slug } = await params;
  const { step: stepRaw, err, ok } = await searchParams;
  if (!hasSupabaseEnv()) return <SetupNotice />;
  const supabase = await createClient();

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, name, address, phone, logo_url")
    .eq("slug", slug)
    .maybeSingle();
  if (!tenant) return null;

  const [{ count: catCount }, { count: itemCount }, { count: tableCount }, areasRes] =
    await Promise.all([
      supabase
        .from("menu_categories")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenant.id),
      supabase
        .from("menu_items")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenant.id),
      supabase
        .from("tables")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenant.id),
      supabase
        .from("areas")
        .select("id, name")
        .eq("tenant_id", tenant.id)
        .order("created_at"),
    ]);
  const areas = areasRes.data ?? [];
  const printed = (await cookies()).get(`onb-printed-${slug}`)?.value === "1";

  const checklist = [
    { label: "Thông tin nhà hàng", done: Boolean(tenant.address || tenant.phone || tenant.logo_url) },
    { label: `Tối thiểu 1 danh mục — hiện có ${catCount ?? 0}`, done: (catCount ?? 0) >= 1 },
    { label: `Tối thiểu 10 món — hiện có ${itemCount ?? 0}`, done: (itemCount ?? 0) >= 10 },
    { label: `Tối thiểu 5 bàn — hiện có ${tableCount ?? 0}`, done: (tableCount ?? 0) >= 5 },
    { label: "Đã mở trang in QR", done: printed },
  ];
  const allDone = checklist.every((c) => c.done);

  const step = Math.min(4, Math.max(1, Number(stepRaw) || 1));

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-6">
      <header>
        <p className={eyebrow}>
          <span className="h-2 w-2 rounded-full bg-id-admin" />
          {tenant.name}
        </p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">
          Thiết lập nhà hàng
        </h1>
        <p className="mt-1 text-sm text-muted">
          4 bước để sẵn sàng phục vụ. Bỏ qua được từng bước, quay lại lúc nào
          cũng được.
        </p>
      </header>

      {/* Thanh tiến trình 4 bước */}
      <nav className="flex gap-2">
        {STEPS.map((label, i) => {
          const n = i + 1;
          const current = step === n;
          return (
            <Link
              key={label}
              href={`/r/${slug}/admin/onboarding?step=${n}`}
              aria-current={current ? "step" : undefined}
              className={`flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-full border px-2 text-[13px] font-semibold transition-colors duration-200 ${
                current
                  ? "border-primary bg-primary text-on-primary"
                  : "border-border text-muted hover:border-foreground hover:text-foreground"
              }`}
            >
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${
                  current ? "bg-white/20" : "bg-surface"
                }`}
              >
                {n}
              </span>
              <span className="hidden sm:inline">{label}</span>
            </Link>
          );
        })}
      </nav>

      {err && (
        <p role="alert" className={alertError}>
          {err}
        </p>
      )}
      {ok && <p className={alertOk}>{ok}</p>}

      {step === 1 && (
        <form
          action={saveRestaurantInfo}
          className="flex flex-col gap-4 rounded-2xl border border-border p-5"
        >
          <input type="hidden" name="slug" value={slug} />
          <div>
            <h2 className="text-lg font-semibold">Thông tin hiển thị trên menu</h2>
            <p className="text-sm text-muted">
              Khách sẽ thấy tên, logo và địa chỉ này khi mở menu.
            </p>
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Tên nhà hàng</span>
            <input name="name" required defaultValue={tenant.name} className={input} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Địa chỉ</span>
            <input
              name="address"
              defaultValue={tenant.address}
              placeholder="Số nhà, đường, quận…"
              className={input}
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Số điện thoại</span>
              <input name="phone" defaultValue={tenant.phone} className={input} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">
                Logo <span className="font-normal text-muted">(≤ 2MB, tùy chọn)</span>
              </span>
              <input
                type="file"
                name="logo"
                accept="image/jpeg,image/png,image/webp"
                className="cursor-pointer pt-2 text-sm file:mr-3 file:cursor-pointer file:rounded-full file:border file:border-border file:bg-background file:px-4 file:py-2 file:text-[13px] file:font-semibold"
              />
            </label>
          </div>
          <div className="flex items-center justify-between">
            <Link
              href={`/r/${slug}/admin/onboarding?step=2`}
              className="text-sm font-medium text-muted underline underline-offset-2 transition-colors duration-200 hover:text-foreground"
            >
              Bỏ qua bước này
            </Link>
            <button className={btn.primary}>Lưu &amp; tiếp tục</button>
          </div>
        </form>
      )}

      {step === 2 && (
        <form
          action={quickMenu}
          className="flex flex-col gap-4 rounded-2xl border border-border p-5"
        >
          <input type="hidden" name="slug" value={slug} />
          <div>
            <h2 className="text-lg font-semibold">
              Menu nhanh
              <span className="ml-2 rounded-full bg-surface px-2.5 py-0.5 text-[13px] font-semibold text-muted">
                đã có {itemCount ?? 0} món
              </span>
            </h2>
            <p className="mt-0.5 text-sm text-muted">
              Nhập mỗi dòng một món theo dạng <b className="text-foreground">Tên món, giá</b>.
              Ảnh và tùy chọn bổ sung sau ở trang Menu.
            </p>
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Danh mục</span>
            <input
              name="category"
              required
              placeholder="Ví dụ: Món chính"
              className={input}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Danh sách món</span>
            <textarea
              name="lines"
              required
              rows={8}
              placeholder={"Phở bò, 45000\nBún chả, 40000\nTrà đá, 5000"}
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 font-mono text-sm outline-none transition-colors duration-200 focus:border-ring focus:ring-2 focus:ring-ring/25"
            />
          </label>
          <div className="flex items-center justify-between">
            <Link
              href={`/r/${slug}/admin/onboarding?step=3`}
              className="text-sm font-medium text-muted underline underline-offset-2 transition-colors duration-200 hover:text-foreground"
            >
              {(itemCount ?? 0) > 0 ? "Xong, sang bước Bàn" : "Bỏ qua bước này"}
            </Link>
            <button className={btn.primary}>Thêm món</button>
          </div>
        </form>
      )}

      {step === 3 && (
        <form
          action={addAreaWithTables}
          className="flex flex-col gap-4 rounded-2xl border border-border p-5"
        >
          <input type="hidden" name="slug" value={slug} />
          <div>
            <h2 className="text-lg font-semibold">
              Khu vực &amp; bàn
              <span className="ml-2 rounded-full bg-surface px-2.5 py-0.5 text-[13px] font-semibold text-muted">
                đã có {tableCount ?? 0} bàn
              </span>
            </h2>
            <p className="mt-0.5 text-sm text-muted">
              Tạo một khu vực kèm số bàn — bàn được đánh số tự động 1, 2, 3…
              {areas.length > 0 && (
                <> Khu vực hiện có: {areas.map((a) => a.name).join(", ")}.</>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2.5">
            <label className="flex min-w-40 flex-1 flex-col gap-1.5">
              <span className="text-sm font-medium">Tên khu vực</span>
              <input name="area" required placeholder="Ví dụ: Tầng 1" className={input} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Số bàn</span>
              <input
                name="count"
                type="number"
                min={1}
                max={100}
                defaultValue={5}
                required
                className={`${input} tabular w-24 font-mono`}
              />
            </label>
            <button className={btn.primary}>Tạo</button>
          </div>
          <div className="flex items-center justify-between">
            <Link
              href={`/r/${slug}/admin/onboarding?step=4`}
              className="text-sm font-medium text-muted underline underline-offset-2 transition-colors duration-200 hover:text-foreground"
            >
              {(tableCount ?? 0) > 0 ? "Xong, sang bước In QR" : "Bỏ qua bước này"}
            </Link>
            <Link
              href={`/r/${slug}/admin/tables`}
              className="text-sm font-medium underline underline-offset-2 transition-opacity duration-200 hover:opacity-70"
            >
              Chỉnh chi tiết →
            </Link>
          </div>
        </form>
      )}

      {step === 4 && (
        <section className="flex flex-col gap-4 rounded-2xl border border-border p-5">
          <div>
            <h2 className="text-lg font-semibold">In QR &amp; hoàn tất</h2>
            <p className="mt-0.5 text-sm text-muted">
              In lưới QR khổ A4, cắt dán từng bàn — khách quét là thấy menu.
            </p>
          </div>
          <form action={openPrintPage}>
            <input type="hidden" name="slug" value={slug} />
            <button className={btn.primary} disabled={(tableCount ?? 0) === 0}>
              Mở trang in QR ({tableCount ?? 0} bàn)
            </button>
            {(tableCount ?? 0) === 0 && (
              <p className="mt-2 text-sm font-medium text-amber-700">
                Chưa có bàn nào — quay lại bước 3 để tạo bàn trước.
              </p>
            )}
          </form>

          <ul className="flex flex-col gap-2.5 rounded-xl bg-surface p-4">
            {checklist.map((c) => (
              <li key={c.label} className="flex items-center gap-2.5 text-sm">
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                    c.done ? "bg-success text-white" : "border border-border bg-background text-muted"
                  }`}
                >
                  {c.done ? "✓" : ""}
                </span>
                <span className={c.done ? "font-medium" : "text-muted"}>
                  {c.label}
                </span>
              </li>
            ))}
          </ul>

          {allDone && (
            <p className={alertOk + " font-semibold"}>
              Nhà hàng đã sẵn sàng phục vụ!
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2.5">
            <a
              href={`/r/${slug}`}
              target="_blank"
              rel="noopener"
              className={btn.secondary}
            >
              Xem menu như khách ↗
            </a>
            <Link href={`/r/${slug}/admin`} className={btn.tertiary}>
              Về trang quản trị
            </Link>
          </div>
        </section>
      )}

      <form action={dismissOnboarding} className="self-center">
        <input type="hidden" name="slug" value={slug} />
        <button className="cursor-pointer text-[13px] font-medium text-muted underline underline-offset-2 transition-colors duration-200 hover:text-foreground">
          Để sau — không tự mở trang này nữa
        </button>
      </form>
    </main>
  );
}
