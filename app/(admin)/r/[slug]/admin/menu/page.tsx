import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/env";
import { SetupNotice } from "@/components/setup-notice";
import { ConfirmButton } from "@/components/confirm-button";
import { formatVnd } from "@/lib/format";
import { btn, input, alertError, eyebrow } from "@/lib/ui";
import {
  createCategory,
  renameCategory,
  deleteCategory,
  quickAddItem,
  setSoldOut,
} from "./actions";

export default async function MenuAdminPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ err?: string }>;
}) {
  const { slug } = await params;
  const { err } = await searchParams;
  if (!hasSupabaseEnv()) return <SetupNotice />;
  const supabase = await createClient();

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, name")
    .eq("slug", slug)
    .maybeSingle();
  if (!tenant) return null; // proxy đã chặn; phòng hờ

  const [{ data: categories }, { data: items }] = await Promise.all([
    supabase
      .from("menu_categories")
      .select("id, name, sort")
      .eq("tenant_id", tenant.id)
      .order("sort")
      .order("created_at"),
    supabase
      .from("menu_items")
      .select("id, category_id, name, price, image_url, is_active, is_sold_out")
      .eq("tenant_id", tenant.id)
      .order("sort")
      .order("created_at"),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-6">
      <header>
        <p className={eyebrow}>
          <span className="h-2 w-2 rounded-full bg-id-customer" />
          Quản trị
        </p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">Menu</h1>
        <p className="mt-1 text-sm text-muted">
          Danh mục, món, giá, ảnh, tùy chọn. Nút &quot;Hết món&quot; ẩn món
          khỏi app khách ngay lập tức.
        </p>
      </header>

      {err && (
        <p role="alert" className={alertError}>
          {err}
        </p>
      )}

      <section className="rounded-2xl border border-border p-5">
        <h2 className="mb-3 text-lg font-semibold">Thêm danh mục</h2>
        <form action={createCategory} className="flex gap-2.5">
          <input type="hidden" name="slug" value={slug} />
          <input
            name="name"
            required
            placeholder="Ví dụ: Món chính, Đồ uống…"
            className={input}
          />
          <button className={btn.primary}>Thêm</button>
        </form>
      </section>

      {(categories ?? []).length === 0 && (
        <div className="flex flex-col items-center gap-1 rounded-2xl border border-dashed border-border px-6 py-12 text-center">
          <p className="font-semibold">Chưa có danh mục nào</p>
          <p className="text-sm text-muted">
            Tạo danh mục đầu tiên để bắt đầu thêm món.
          </p>
        </div>
      )}

      {(categories ?? []).map((cat) => {
        const catItems = (items ?? []).filter((i) => i.category_id === cat.id);
        return (
          <section key={cat.id} className="rounded-2xl border border-border p-5">
            <div className="mb-4 flex items-center justify-between gap-2">
              <form action={renameCategory} className="flex flex-1 items-center gap-2">
                <input type="hidden" name="slug" value={slug} />
                <input type="hidden" name="id" value={cat.id} />
                <input
                  name="name"
                  defaultValue={cat.name}
                  required
                  aria-label="Tên danh mục"
                  className="min-h-10 w-full max-w-72 rounded-lg border border-transparent bg-transparent px-2 text-lg font-semibold outline-none transition-colors duration-200 hover:border-border focus:border-ring focus:ring-2 focus:ring-ring/25"
                />
                <button className={btn.smTertiary}>Đổi tên</button>
              </form>
              <form action={deleteCategory}>
                <input type="hidden" name="slug" value={slug} />
                <input type="hidden" name="id" value={cat.id} />
                <ConfirmButton
                  message={
                    catItems.length > 0
                      ? `Xóa danh mục "${cat.name}" sẽ xóa cả ${catItems.length} món bên trong. Chắc chắn?`
                      : `Xóa danh mục "${cat.name}"?`
                  }
                  className={btn.smDanger}
                >
                  Xóa
                </ConfirmButton>
              </form>
            </div>

            {catItems.length === 0 && (
              <p className="mb-3 rounded-lg bg-surface px-3.5 py-2.5 text-sm text-muted">
                Danh mục trống — thêm món đầu tiên bên dưới.
              </p>
            )}

            <ul className="flex flex-col gap-2">
              {catItems.map((item) => (
                <li
                  key={item.id}
                  className={`flex items-center gap-3 rounded-xl border border-border px-3 py-2.5 transition-colors duration-200 hover:border-foreground ${
                    !item.is_active ? "opacity-55" : ""
                  }`}
                >
                  {item.image_url ? (
                    <Image
                      src={item.image_url}
                      alt=""
                      width={48}
                      height={48}
                      className="h-12 w-12 shrink-0 rounded-lg object-cover"
                    />
                  ) : (
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-surface text-[11px] font-medium text-muted">
                      Ảnh
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/r/${slug}/admin/menu/${item.id}`}
                        className="truncate font-semibold underline-offset-2 hover:underline"
                      >
                        {item.name}
                      </Link>
                      {!item.is_active && (
                        <span className="rounded-full bg-surface px-2.5 py-0.5 text-[11px] font-semibold text-muted">
                          ĐANG ẨN
                        </span>
                      )}
                      {item.is_sold_out && (
                        <span className="rounded-full bg-warning/15 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700">
                          HẾT MÓN
                        </span>
                      )}
                    </div>
                    <span className="tabular font-mono text-sm text-muted">
                      {formatVnd(item.price)}
                    </span>
                  </div>
                  <form action={setSoldOut}>
                    <input type="hidden" name="slug" value={slug} />
                    <input type="hidden" name="item_id" value={item.id} />
                    <input type="hidden" name="sold_out" value={String(!item.is_sold_out)} />
                    <button
                      className={`inline-flex min-h-10 min-w-24 cursor-pointer items-center justify-center rounded-full border px-4 text-[13px] font-semibold transition-colors duration-200 ${
                        item.is_sold_out
                          ? "border-success/40 text-success hover:bg-success-bg"
                          : "border-border text-foreground hover:border-amber-600 hover:text-amber-700"
                      }`}
                    >
                      {item.is_sold_out ? "Còn món" : "Hết món"}
                    </button>
                  </form>
                </li>
              ))}
            </ul>

            <form action={quickAddItem} className="mt-3 flex gap-2">
              <input type="hidden" name="slug" value={slug} />
              <input type="hidden" name="category_id" value={cat.id} />
              <input
                name="name"
                required
                placeholder="Tên món mới"
                className={input}
              />
              <input
                name="price"
                required
                inputMode="numeric"
                placeholder="Giá (VND)"
                className={`${input} w-32 shrink-0`}
              />
              <button className={btn.tertiary + " shrink-0"}>Thêm món</button>
            </form>
          </section>
        );
      })}
    </main>
  );
}
