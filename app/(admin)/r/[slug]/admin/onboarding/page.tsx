import Link from "next/link";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/env";
import { SetupNotice } from "@/components/setup-notice";
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
    { label: `≥ 1 danh mục (hiện có ${catCount ?? 0})`, done: (catCount ?? 0) >= 1 },
    { label: `≥ 10 món (hiện có ${itemCount ?? 0})`, done: (itemCount ?? 0) >= 10 },
    { label: `≥ 5 bàn (hiện có ${tableCount ?? 0})`, done: (tableCount ?? 0) >= 5 },
    { label: "Đã mở trang in QR", done: printed },
  ];
  const allDone = checklist.every((c) => c.done);

  const step = Math.min(4, Math.max(1, Number(stepRaw) || 1));

  const input =
    "min-h-11 rounded-input border border-border bg-transparent px-3 text-base outline-none focus:border-ring";
  const primaryBtn =
    "min-h-11 cursor-pointer rounded-full bg-primary px-5 font-medium text-on-primary";

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-bold">Thiết lập nhà hàng — {tenant.name}</h1>
        <p className="text-sm opacity-70">
          4 bước để sẵn sàng phục vụ. Bỏ qua được từng bước, quay lại lúc nào
          cũng được.
        </p>
      </header>

      {/* Thanh tiến trình 4 bước */}
      <nav className="flex gap-2">
        {STEPS.map((label, i) => (
          <Link
            key={label}
            href={`/r/${slug}/admin/onboarding?step=${i + 1}`}
            className={`flex min-h-11 flex-1 items-center justify-center rounded-full border px-2 text-sm font-medium ${
              step === i + 1
                ? "border-primary bg-primary text-on-primary"
                : "border-border"
            }`}
          >
            {i + 1}. {label}
          </Link>
        ))}
      </nav>

      {err && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {err}
        </p>
      )}
      {ok && <p className="rounded-lg bg-success-bg px-3 py-2 text-sm">{ok}</p>}

      {step === 1 && (
        <form
          action={saveRestaurantInfo}
          className="flex flex-col gap-4 rounded-card border border-border p-4"
        >
          <input type="hidden" name="slug" value={slug} />
          <h2 className="font-semibold">Bước 1 — Thông tin hiển thị trên menu</h2>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Tên nhà hàng</span>
            <input name="name" required defaultValue={tenant.name} className={input} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Địa chỉ</span>
            <input
              name="address"
              defaultValue={tenant.address}
              placeholder="Số nhà, đường, quận…"
              className={input}
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">Số điện thoại</span>
              <input name="phone" defaultValue={tenant.phone} className={input} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">Logo (≤ 2MB, tùy chọn)</span>
              <input
                type="file"
                name="logo"
                accept="image/jpeg,image/png,image/webp"
                className="pt-2 text-sm"
              />
            </label>
          </div>
          <div className="flex items-center justify-between">
            <Link href={`/r/${slug}/admin/onboarding?step=2`} className="text-sm underline opacity-70">
              Bỏ qua bước này
            </Link>
            <button className={primaryBtn}>Lưu &amp; tiếp tục</button>
          </div>
        </form>
      )}

      {step === 2 && (
        <form
          action={quickMenu}
          className="flex flex-col gap-4 rounded-card border border-border p-4"
        >
          <input type="hidden" name="slug" value={slug} />
          <h2 className="font-semibold">
            Bước 2 — Menu nhanh
            <span className="ml-2 text-sm font-normal opacity-60">
              đã có {itemCount ?? 0} món
            </span>
          </h2>
          <p className="text-sm opacity-70">
            Nhập mỗi dòng một món theo dạng <b>Tên món, giá</b>. Ảnh và tùy chọn
            bổ sung sau ở trang Menu.
          </p>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Danh mục</span>
            <input
              name="category"
              required
              placeholder="Ví dụ: Món chính"
              className={input}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Danh sách món</span>
            <textarea
              name="lines"
              required
              rows={8}
              placeholder={"Phở bò, 45000\nBún chả, 40000\nTrà đá, 5000"}
              className="rounded-input border border-border bg-transparent px-3 py-2 font-mono text-sm outline-none focus:border-ring"
            />
          </label>
          <div className="flex items-center justify-between">
            <Link href={`/r/${slug}/admin/onboarding?step=3`} className="text-sm underline opacity-70">
              {(itemCount ?? 0) > 0 ? "Xong, sang bước Bàn" : "Bỏ qua bước này"}
            </Link>
            <button className={primaryBtn}>Thêm món</button>
          </div>
        </form>
      )}

      {step === 3 && (
        <form
          action={addAreaWithTables}
          className="flex flex-col gap-4 rounded-card border border-border p-4"
        >
          <input type="hidden" name="slug" value={slug} />
          <h2 className="font-semibold">
            Bước 3 — Khu vực &amp; bàn
            <span className="ml-2 text-sm font-normal opacity-60">
              đã có {tableCount ?? 0} bàn
              {areas.length > 0 && ` (${areas.map((a) => a.name).join(", ")})`}
            </span>
          </h2>
          <p className="text-sm opacity-70">
            Tạo một khu vực kèm số bàn — bàn được đánh số tự động 1, 2, 3…
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-1 flex-col gap-1">
              <span className="text-sm font-medium">Tên khu vực</span>
              <input name="area" required placeholder="Ví dụ: Tầng 1" className={input} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">Số bàn</span>
              <input
                name="count"
                type="number"
                min={1}
                max={100}
                defaultValue={5}
                required
                className={`${input} w-24`}
              />
            </label>
            <button className={primaryBtn}>Tạo</button>
          </div>
          <div className="flex items-center justify-between">
            <Link href={`/r/${slug}/admin/onboarding?step=4`} className="text-sm underline opacity-70">
              {(tableCount ?? 0) > 0 ? "Xong, sang bước In QR" : "Bỏ qua bước này"}
            </Link>
            <Link href={`/r/${slug}/admin/tables`} className="text-sm underline opacity-70">
              Chỉnh chi tiết ở trang Khu vực &amp; bàn →
            </Link>
          </div>
        </form>
      )}

      {step === 4 && (
        <section className="flex flex-col gap-4 rounded-card border border-border p-4">
          <h2 className="font-semibold">Bước 4 — In QR &amp; hoàn tất</h2>
          <form action={openPrintPage}>
            <input type="hidden" name="slug" value={slug} />
            <button className={primaryBtn} disabled={(tableCount ?? 0) === 0}>
              Mở trang in QR ({tableCount ?? 0} bàn)
            </button>
            {(tableCount ?? 0) === 0 && (
              <p className="mt-2 text-sm text-warning">
                Chưa có bàn nào — quay lại bước 3 để tạo bàn trước.
              </p>
            )}
          </form>

          <ul className="flex flex-col gap-2 rounded-input bg-surface p-3">
            {checklist.map((c) => (
              <li key={c.label} className="flex items-center gap-2 text-sm">
                <span className={c.done ? "text-success" : "opacity-40"}>
                  {c.done ? "✓" : "○"}
                </span>
                <span className={c.done ? "" : "opacity-70"}>{c.label}</span>
              </li>
            ))}
          </ul>

          {allDone && (
            <p className="rounded-input bg-success-bg px-3 py-2 text-sm font-medium">
              🎉 Nhà hàng đã sẵn sàng phục vụ!
            </p>
          )}

          <div className="flex flex-wrap items-center gap-4">
            <a
              href={`/r/${slug}`}
              target="_blank"
              rel="noopener"
              className="text-sm underline"
            >
              Xem menu như khách ↗
            </a>
            <Link href={`/r/${slug}/admin`} className="text-sm underline">
              Về trang quản trị
            </Link>
          </div>
        </section>
      )}

      <form action={dismissOnboarding} className="self-center">
        <input type="hidden" name="slug" value={slug} />
        <button className="cursor-pointer text-sm underline opacity-60">
          Để sau — không tự mở trang này nữa
        </button>
      </form>
    </main>
  );
}
