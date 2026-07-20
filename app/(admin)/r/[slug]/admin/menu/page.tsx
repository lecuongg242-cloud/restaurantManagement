import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/env";
import { SetupNotice } from "@/components/setup-notice";
import { ConfirmButton } from "@/components/confirm-button";
import { formatVnd } from "@/lib/format";
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
      <header className="flex items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Menu — {tenant.name}</h1>
          <p className="text-sm opacity-70">
            Danh mục, món, giá, ảnh, tùy chọn. Nút &quot;Hết&quot; ẩn món khỏi
            app khách ngay lập tức.
          </p>
        </div>
        <Link href={`/r/${slug}/admin`} className="text-sm underline opacity-70">
          ← Quản trị
        </Link>
      </header>

      {err && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {err}
        </p>
      )}

      <section className="rounded-card border border-border p-4">
        <h2 className="mb-3 font-semibold">Thêm danh mục</h2>
        <form action={createCategory} className="flex gap-3">
          <input type="hidden" name="slug" value={slug} />
          <input
            name="name"
            required
            placeholder="Ví dụ: Món chính, Đồ uống…"
            className="min-h-11 flex-1 rounded-input border border-border bg-transparent px-3 text-base outline-none focus:border-ring"
          />
          <button className="min-h-11 cursor-pointer rounded-full bg-primary px-4 font-medium text-on-primary">
            Thêm
          </button>
        </form>
      </section>

      {(categories ?? []).length === 0 && (
        <p className="rounded-card border border-dashed border-border p-6 text-center opacity-70">
          Chưa có danh mục nào. Tạo danh mục đầu tiên để bắt đầu thêm món.
        </p>
      )}

      {(categories ?? []).map((cat) => {
        const catItems = (items ?? []).filter((i) => i.category_id === cat.id);
        return (
          <section key={cat.id} className="rounded-card border border-border p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <form action={renameCategory} className="flex flex-1 items-center gap-2">
                <input type="hidden" name="slug" value={slug} />
                <input type="hidden" name="id" value={cat.id} />
                <input
                  name="name"
                  defaultValue={cat.name}
                  required
                  className="min-h-9 flex-1 rounded-input border border-transparent bg-transparent px-2 font-semibold outline-none focus:border-ring"
                />
                <button className="min-h-9 cursor-pointer rounded-full border border-border px-3 text-sm">
                  Đổi tên
                </button>
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
                  className="min-h-9 cursor-pointer rounded-full border border-destructive/40 px-3 text-sm text-destructive"
                >
                  Xóa
                </ConfirmButton>
              </form>
            </div>

            <ul className="flex flex-col gap-2">
              {catItems.map((item) => (
                <li
                  key={item.id}
                  className={`flex items-center gap-3 rounded-input border px-3 py-2 ${
                    !item.is_active
                      ? "border-border opacity-50"
                      : item.is_sold_out
                        ? "border-warning/50"
                        : "border-border"
                  }`}
                >
                  {item.image_url ? (
                    <Image
                      src={item.image_url}
                      alt=""
                      width={40}
                      height={40}
                      className="h-10 w-10 rounded-input object-cover"
                    />
                  ) : (
                    <span className="flex h-10 w-10 items-center justify-center rounded-input bg-surface text-xs opacity-40">
                      Ảnh
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/r/${slug}/admin/menu/${item.id}`}
                      className="block truncate font-medium underline-offset-2 hover:underline"
                    >
                      {item.name}
                    </Link>
                    <span className="text-sm opacity-70">
                      {formatVnd(item.price)}
                      {!item.is_active && " · ĐANG ẨN"}
                      {item.is_sold_out && " · HẾT MÓN"}
                    </span>
                  </div>
                  <form action={setSoldOut}>
                    <input type="hidden" name="slug" value={slug} />
                    <input type="hidden" name="item_id" value={item.id} />
                    <input type="hidden" name="sold_out" value={String(!item.is_sold_out)} />
                    <button
                      className={`min-h-11 min-w-16 cursor-pointer rounded-full border px-3 text-sm font-medium ${
                        item.is_sold_out
                          ? "border-success/40 text-success"
                          : "border-warning/60 text-warning"
                      }`}
                    >
                      {item.is_sold_out ? "Còn món" : "Hết"}
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
                className="min-h-11 flex-1 rounded-input border border-border bg-transparent px-3 text-base outline-none focus:border-ring"
              />
              <input
                name="price"
                required
                inputMode="numeric"
                placeholder="Giá (VND)"
                className="min-h-11 w-32 rounded-input border border-border bg-transparent px-3 text-base outline-none focus:border-ring"
              />
              <button className="min-h-11 cursor-pointer rounded-full border border-border px-4 text-sm font-medium">
                Thêm món
              </button>
            </form>
          </section>
        );
      })}
    </main>
  );
}
