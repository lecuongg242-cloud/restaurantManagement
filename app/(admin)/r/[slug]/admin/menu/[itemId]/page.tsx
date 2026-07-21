import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/env";
import { SetupNotice } from "@/components/setup-notice";
import { ConfirmButton } from "@/components/confirm-button";
import { formatVnd } from "@/lib/format";
import { btn, input, alertError, alertOk, eyebrow } from "@/lib/ui";
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
        <Link href={`/r/${slug}/admin/menu`} className={btn.tertiary}>
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
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className={eyebrow}>
            <span className="h-2 w-2 rounded-full bg-id-admin" />
            Menu · Sửa món
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">{item.name}</h1>
        </div>
        <Link href={`/r/${slug}/admin/menu`} className={btn.tertiary}>
          ← Menu
        </Link>
      </header>

      {err && (
        <p role="alert" className={alertError}>
          {err}
        </p>
      )}
      {ok && <p className={alertOk}>Đã lưu thay đổi.</p>}

      <form
        action={updateItem}
        className="flex flex-col gap-4 rounded-2xl border border-border p-5"
      >
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="item_id" value={item.id} />

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Tên món</span>
          <input name="name" required defaultValue={item.name} className={input} />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Giá (VND)</span>
            <input
              name="price"
              required
              inputMode="numeric"
              defaultValue={item.price}
              className={`${input} tabular font-mono`}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Danh mục</span>
            <select
              name="category_id"
              defaultValue={item.category_id}
              className={`${input} cursor-pointer`}
            >
              {(categories ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Mô tả</span>
          <textarea
            name="description"
            rows={2}
            defaultValue={item.description}
            placeholder="Nguyên liệu chính, khẩu vị, khẩu phần…"
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-base outline-none transition-colors duration-200 focus:border-ring focus:ring-2 focus:ring-ring/25"
          />
        </label>

        <div className="flex items-center gap-4">
          {item.image_url ? (
            <Image
              src={item.image_url}
              alt=""
              width={88}
              height={88}
              className="h-22 w-22 shrink-0 rounded-xl object-cover"
            />
          ) : (
            <span className="flex h-22 w-22 shrink-0 items-center justify-center rounded-xl bg-surface text-xs font-medium text-muted">
              Chưa có ảnh
            </span>
          )}
          <label className="flex flex-1 flex-col gap-1.5">
            <span className="text-sm font-medium">
              Ảnh món <span className="font-normal text-muted">(JPG/PNG/WEBP, ≤ 2MB)</span>
            </span>
            <input
              type="file"
              name="image"
              accept="image/jpeg,image/png,image/webp"
              className="cursor-pointer text-sm file:mr-3 file:cursor-pointer file:rounded-full file:border file:border-border file:bg-background file:px-4 file:py-2 file:text-[13px] file:font-semibold"
            />
          </label>
        </div>

        <label className="flex min-h-11 cursor-pointer items-center gap-2.5">
          <input
            type="checkbox"
            name="is_active"
            defaultChecked={item.is_active}
            className="h-5 w-5 cursor-pointer accent-primary"
          />
          <span className="text-sm">
            Hiện trên menu khách <span className="text-muted">(bỏ chọn để ẩn món)</span>
          </span>
        </label>

        <button className={btn.primary + " self-start"}>Lưu thay đổi</button>
      </form>

      <section className="rounded-2xl border border-border p-5">
        <h2 className="text-lg font-semibold">Tùy chọn (size / topping)</h2>
        <p className="mb-4 mt-0.5 text-sm text-muted">
          Nhóm &quot;chọn 1&quot; cho size; &quot;chọn nhiều&quot; cho topping.
          Phụ thu tính thêm vào giá món.
        </p>

        <ul className="flex flex-col gap-4">
          {(groups ?? []).map((g) => {
            const groupOptions = (options ?? []).filter((o) => o.group_id === g.id);
            return (
              <li key={g.id} className="rounded-xl border border-border-soft p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <span className="font-semibold">
                    {g.name}
                    <span className="ml-2 text-[13px] font-normal text-muted">
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
                      className={btn.smDanger}
                    >
                      Xóa nhóm
                    </ConfirmButton>
                  </form>
                </div>
                {groupOptions.length > 0 && (
                  <ul className="mb-3 flex flex-wrap gap-2">
                    {groupOptions.map((o) => (
                      <li
                        key={o.id}
                        className="flex items-center gap-1.5 rounded-full border border-border py-1.5 pl-3.5 pr-1.5 text-sm"
                      >
                        {o.name}
                        {o.price_delta > 0 && (
                          <span className="tabular font-mono text-[13px] text-muted">
                            +{formatVnd(o.price_delta)}
                          </span>
                        )}
                        <form action={deleteOption} className="flex">
                          <input type="hidden" name="slug" value={slug} />
                          <input type="hidden" name="item_id" value={item.id} />
                          <input type="hidden" name="id" value={o.id} />
                          <button
                            aria-label={`Xóa lựa chọn ${o.name}`}
                            className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-full text-muted transition-colors duration-200 hover:bg-destructive/10 hover:text-destructive"
                          >
                            ×
                          </button>
                        </form>
                      </li>
                    ))}
                  </ul>
                )}
                <form action={addOption} className="flex gap-2">
                  <input type="hidden" name="slug" value={slug} />
                  <input type="hidden" name="item_id" value={item.id} />
                  <input type="hidden" name="group_id" value={g.id} />
                  <input
                    name="name"
                    required
                    placeholder="Tên lựa chọn (Size L…)"
                    className={input}
                  />
                  <input
                    name="price_delta"
                    inputMode="numeric"
                    placeholder="Phụ thu"
                    className={`${input} w-28 shrink-0`}
                  />
                  <button className={btn.smTertiary + " min-h-11 shrink-0"}>
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
            className={`${input} min-w-40 flex-1`}
          />
          <select
            name="selection"
            className="min-h-11 cursor-pointer rounded-lg border border-border bg-background px-2.5 text-sm outline-none transition-colors duration-200 focus:border-ring"
          >
            <option value="single">Chọn 1</option>
            <option value="multiple">Chọn nhiều</option>
          </select>
          <label className="flex min-h-11 cursor-pointer items-center gap-1.5 text-sm">
            <input
              type="checkbox"
              name="is_required"
              className="h-4 w-4 cursor-pointer accent-primary"
            />
            Bắt buộc
          </label>
          <button className={btn.primary}>Thêm nhóm</button>
        </form>
      </section>

      <form action={deleteItem} className="self-start">
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="item_id" value={item.id} />
        <ConfirmButton
          message={`Xóa món "${item.name}" khỏi menu? Không khôi phục được.`}
          className={btn.danger}
        >
          Xóa món này
        </ConfirmButton>
      </form>
    </main>
  );
}
