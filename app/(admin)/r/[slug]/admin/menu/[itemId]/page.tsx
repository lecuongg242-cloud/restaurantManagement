import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/env";
import { SetupNotice } from "@/components/setup-notice";
import { ConfirmButton } from "@/components/confirm-button";
import { formatVnd } from "@/lib/format";
import {
  updateItem,
  deleteItem,
  addOptionGroup,
  deleteOptionGroup,
  addOption,
  deleteOption,
} from "../actions";

export default async function MenuItemPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; itemId: string }>;
  searchParams: Promise<{ err?: string; ok?: string }>;
}) {
  const { slug, itemId } = await params;
  const { err, ok } = await searchParams;
  if (!hasSupabaseEnv()) return <SetupNotice />;
  const supabase = await createClient();

  const { data: item } = await supabase
    .from("menu_items")
    .select(
      "id, tenant_id, category_id, name, description, price, image_url, is_active, is_sold_out"
    )
    .eq("id", itemId)
    .maybeSingle();
  if (!item) {
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <h1 className="text-xl font-bold">Không tìm thấy món</h1>
        <Link href={`/r/${slug}/admin/menu`} className="underline">
          ← Về trang menu
        </Link>
      </main>
    );
  }

  const [{ data: categories }, { data: groups }, { data: options }] =
    await Promise.all([
      supabase
        .from("menu_categories")
        .select("id, name")
        .eq("tenant_id", item.tenant_id)
        .order("sort")
        .order("created_at"),
      supabase
        .from("menu_option_groups")
        .select("id, name, selection, is_required")
        .eq("item_id", itemId)
        .order("sort"),
      supabase
        .from("menu_options")
        .select("id, group_id, name, price_delta")
        .eq("tenant_id", item.tenant_id)
        .order("sort"),
    ]);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-6">
      <header className="flex items-baseline justify-between gap-3">
        <h1 className="text-2xl font-bold">Sửa món — {item.name}</h1>
        <Link href={`/r/${slug}/admin/menu`} className="text-sm underline opacity-70">
          ← Menu
        </Link>
      </header>

      {err && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {err}
        </p>
      )}
      {ok && (
        <p className="rounded-lg bg-success-bg px-3 py-2 text-sm">Đã lưu.</p>
      )}

      <form
        action={updateItem}
        className="flex flex-col gap-4 rounded-card border border-border p-4"
      >
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="item_id" value={item.id} />

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Tên món</span>
          <input
            name="name"
            required
            defaultValue={item.name}
            className="min-h-11 rounded-input border border-border bg-transparent px-3 text-base outline-none focus:border-ring"
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Giá (VND)</span>
            <input
              name="price"
              required
              inputMode="numeric"
              defaultValue={item.price}
              className="min-h-11 rounded-input border border-border bg-transparent px-3 text-base outline-none focus:border-ring"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Danh mục</span>
            <select
              name="category_id"
              defaultValue={item.category_id}
              className="min-h-11 rounded-input border border-border bg-transparent px-3 text-base outline-none"
            >
              {(categories ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Mô tả</span>
          <textarea
            name="description"
            rows={2}
            defaultValue={item.description}
            className="rounded-input border border-border bg-transparent px-3 py-2 text-base outline-none focus:border-ring"
          />
        </label>

        <div className="flex items-center gap-4">
          {item.image_url ? (
            <Image
              src={item.image_url}
              alt=""
              width={80}
              height={80}
              className="h-20 w-20 rounded-input object-cover"
            />
          ) : (
            <span className="flex h-20 w-20 items-center justify-center rounded-input bg-surface text-xs opacity-40">
              Chưa có ảnh
            </span>
          )}
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-sm font-medium">Ảnh món (JPG/PNG/WEBP, ≤ 2MB)</span>
            <input
              type="file"
              name="image"
              accept="image/jpeg,image/png,image/webp"
              className="text-sm"
            />
          </label>
        </div>

        <label className="flex min-h-11 items-center gap-2">
          <input
            type="checkbox"
            name="is_active"
            defaultChecked={item.is_active}
            className="h-5 w-5"
          />
          <span className="text-sm">
            Hiện trên menu khách (bỏ chọn để ẩn món khỏi menu)
          </span>
        </label>

        <button className="min-h-11 cursor-pointer rounded-full bg-primary px-4 font-medium text-on-primary">
          Lưu thay đổi
        </button>
      </form>

      <section className="rounded-card border border-border p-4">
        <h2 className="mb-1 font-semibold">Tùy chọn (size / topping)</h2>
        <p className="mb-3 text-sm opacity-70">
          Nhóm &quot;chọn 1&quot; cho size; &quot;chọn nhiều&quot; cho topping.
          Phụ thu tính thêm vào giá món.
        </p>

        <ul className="flex flex-col gap-4">
          {(groups ?? []).map((g) => {
            const groupOptions = (options ?? []).filter((o) => o.group_id === g.id);
            return (
              <li key={g.id} className="rounded-input border border-border-soft p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="font-medium">
                    {g.name}
                    <span className="ml-2 text-xs opacity-60">
                      {g.selection === "single" ? "chọn 1" : "chọn nhiều"}
                      {g.is_required && " · bắt buộc"}
                    </span>
                  </span>
                  <form action={deleteOptionGroup}>
                    <input type="hidden" name="slug" value={slug} />
                    <input type="hidden" name="item_id" value={item.id} />
                    <input type="hidden" name="id" value={g.id} />
                    <ConfirmButton
                      message={`Xóa nhóm "${g.name}" và toàn bộ lựa chọn bên trong?`}
                      className="min-h-9 cursor-pointer rounded-full border border-destructive/40 px-3 text-sm text-destructive"
                    >
                      Xóa nhóm
                    </ConfirmButton>
                  </form>
                </div>
                <ul className="mb-2 flex flex-wrap gap-2">
                  {groupOptions.map((o) => (
                    <li
                      key={o.id}
                      className="flex items-center gap-2 rounded-full border border-border px-3 py-1 text-sm"
                    >
                      {o.name}
                      {o.price_delta > 0 && (
                        <span className="opacity-60">+{formatVnd(o.price_delta)}</span>
                      )}
                      <form action={deleteOption} className="flex">
                        <input type="hidden" name="slug" value={slug} />
                        <input type="hidden" name="item_id" value={item.id} />
                        <input type="hidden" name="id" value={o.id} />
                        <button
                          aria-label={`Xóa lựa chọn ${o.name}`}
                          className="cursor-pointer px-1 text-destructive"
                        >
                          ×
                        </button>
                      </form>
                    </li>
                  ))}
                </ul>
                <form action={addOption} className="flex gap-2">
                  <input type="hidden" name="slug" value={slug} />
                  <input type="hidden" name="item_id" value={item.id} />
                  <input type="hidden" name="group_id" value={g.id} />
                  <input
                    name="name"
                    required
                    placeholder="Tên lựa chọn (Size L…)"
                    className="min-h-11 flex-1 rounded-input border border-border bg-transparent px-3 text-sm outline-none focus:border-ring"
                  />
                  <input
                    name="price_delta"
                    inputMode="numeric"
                    placeholder="Phụ thu (VND)"
                    className="min-h-11 w-32 rounded-input border border-border bg-transparent px-3 text-sm outline-none focus:border-ring"
                  />
                  <button className="min-h-11 cursor-pointer rounded-full border border-border px-3 text-sm">
                    Thêm
                  </button>
                </form>
              </li>
            );
          })}
        </ul>

        <form
          action={addOptionGroup}
          className="mt-4 flex flex-wrap items-center gap-2 border-t border-border-soft pt-4"
        >
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="item_id" value={item.id} />
          <input
            name="name"
            required
            placeholder="Tên nhóm mới (Size, Topping…)"
            className="min-h-11 flex-1 rounded-input border border-border bg-transparent px-3 text-sm outline-none focus:border-ring"
          />
          <select
            name="selection"
            className="min-h-11 rounded-input border border-border bg-transparent px-2 text-sm outline-none"
          >
            <option value="single">Chọn 1</option>
            <option value="multiple">Chọn nhiều</option>
          </select>
          <label className="flex min-h-11 items-center gap-1 text-sm">
            <input type="checkbox" name="is_required" className="h-4 w-4" /> Bắt buộc
          </label>
          <button className="min-h-11 cursor-pointer rounded-full bg-primary px-4 text-sm font-medium text-on-primary">
            Thêm nhóm
          </button>
        </form>
      </section>

      <form action={deleteItem} className="self-start">
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="item_id" value={item.id} />
        <ConfirmButton
          message={`Xóa món "${item.name}" khỏi menu? Không khôi phục được.`}
          className="min-h-11 cursor-pointer rounded-full border border-destructive/40 px-4 text-sm text-destructive"
        >
          Xóa món này
        </ConfirmButton>
      </form>
    </main>
  );
}
