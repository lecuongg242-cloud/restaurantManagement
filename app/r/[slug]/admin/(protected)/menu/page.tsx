import Image from "next/image";
import Link from "next/link";
import { Eye } from "lucide-react";
import { getSessionMembership } from "@/lib/auth/session";
import { canManage, defaultRouteForRole } from "@/lib/auth/rbac";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AvailabilityToggle } from "@/components/menu/AvailabilityToggle";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { ModifierGroupPicker } from "@/components/menu/ModifierGroupPicker";
import { CategoryManager } from "./CategoryManager";
import { ItemDialog } from "./ItemDialog";
import { deleteItem, followChainPrice, reorderItem } from "./actions";
import { MenuTabs } from "@/components/admin/menu/MenuTabs";
import {
  CategoryFilter,
  DimWhileSearching,
  HideWhileSearching,
  ItemFilter,
  MenuSearchBox,
  MenuSearchProvider,
  NoResult,
} from "@/components/admin/menu/MenuSearch";
import type { Category, Item, ModifierGroup } from "@/lib/menu/types";
import { urlAnh } from "@/lib/storage/public-url";

export const dynamic = "force-dynamic";

const vnd = (n: number) => n.toLocaleString("vi-VN") + "₫";

export default async function MenuPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string; ok?: string; nhom?: string }>;
}) {
  const { slug } = await params;
  const { error, ok, nhom } = await searchParams;

  const session = await getSessionMembership(slug);
  if (!session) redirect(`/r/${slug}/admin/login`);
  if (!canManage(session.role, "menu")) {
    redirect(defaultRouteForRole(slug, session.role));
  }

  const supabase = await createClient();
  const [{ data: categories }, { data: items }, { data: groups }, { data: links }] =
    await Promise.all([
      supabase
        .from("menu_categories")
        .select("*")
        .eq("tenant_id", session.tenant.id)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
      supabase
        .from("menu_items")
        .select("*")
        .eq("tenant_id", session.tenant.id)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
      supabase
        .from("modifier_groups")
        .select("id, name")
        .eq("tenant_id", session.tenant.id)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
      supabase
        .from("menu_item_modifier_groups")
        .select("item_id, group_id")
        .eq("tenant_id", session.tenant.id),
    ]);

  const cats = (categories ?? []) as Category[];
  const allItems = (items ?? []) as Item[];
  const catOptions = cats.map((c) => ({ id: c.id, name: c.name }));
  const allGroups = (groups ?? []) as Pick<ModifierGroup, "id" | "name">[];
  const groupsByItem = new Map<string, string[]>();
  for (const l of (links ?? []) as { item_id: string; group_id: string }[]) {
    const arr = groupsByItem.get(l.item_id) ?? [];
    arr.push(l.group_id);
    groupsByItem.set(l.item_id, arr);
  }
  const itemsByCat = new Map<string, Item[]>();
  for (const it of allItems) {
    const arr = itemsByCat.get(it.category_id) ?? [];
    arr.push(it);
    itemsByCat.set(it.category_id, arr);
  }
  // Tab đang chọn (`?nhom=`); danh mục đã xóa / id lạ → về "Tất cả".
  const activeCat = cats.some((c) => c.id === nhom) ? nhom! : null;

  return (
    <div className="w-full">
      <div className="flex flex-wrap items-end justify-between gap-md">
        <div>
          <h1 className="font-semibold text-2xl text-ink">Thực đơn</h1>
          <p className="mt-xxs text-sm text-steel">
            Tạo danh mục và món (ảnh, giá VND, mô tả). Bật &quot;hết món&quot; để tạm ẩn khỏi bán.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-md">
          {/* Mở đúng trang khách thấy (chế độ chỉ-xem vì không có token QR) — sửa món xong xem
              lại ngay, không phải tự gõ URL hay quét QR. Tab mới để không mất chỗ đang sửa. */}
          <Button asChild variant="secondary" size="sm">
            <Link href={`/r/${slug}/menu`} target="_blank" rel="noopener noreferrer">
              <Eye className="h-4 w-4" aria-hidden />
              Xem thử thực đơn
              <span className="sr-only"> (mở tab mới)</span>
            </Link>
          </Button>
          <Link
            href={`/r/${slug}/admin/menu/modifiers`}
            className="text-sm text-primary underline-offset-4 hover:underline"
          >
            Nhóm tùy chọn (size, topping…) →
          </Link>
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="mt-md rounded-md border border-status-late bg-cream-soft px-md py-sm text-sm text-status-late"
        >
          {error}
        </p>
      )}
      {ok && (
        <p
          role="status"
          className="mt-md rounded-md border border-status-ready bg-status-ready-bg px-md py-sm text-sm text-status-ready"
        >
          {ok}
        </p>
      )}

      <MenuSearchProvider active={activeCat}>
        <div className="mt-lg flex flex-col gap-sm">
          <MenuSearchBox />
          <DimWhileSearching>
            <MenuTabs
              slug={slug}
              tabs={cats.map((c) => ({ id: c.id, name: c.name, count: itemsByCat.get(c.id)?.length ?? 0 }))}
              total={allItems.length}
              active={activeCat}
            />
          </DimWhileSearching>
        </div>

        {cats.length === 0 && (
          <p className="mt-xl rounded-lg border border-dashed border-hairline-strong px-md py-xl text-center text-sm text-steel">
            Chưa có danh mục. Bấm &quot;+ Danh mục&quot; để thêm danh mục đầu tiên.
          </p>
        )}

        {/* Danh mục + món. Dựng đủ mọi danh mục; `CategoryFilter` ẩn theo tab (`?nhom=`) hoặc theo ô tìm (tìm trong mọi
            danh mục). ↑↓ danh mục theo thứ tự trong CẢ thực đơn. */}
        <div className="mt-lg flex flex-col gap-xxl">
          <NoResult names={allItems.map((it) => it.name)} />
          {cats.map((cat, ci) => {
            const list = itemsByCat.get(cat.id) ?? [];
            return (
              <CategoryFilter key={cat.id} id={cat.id} names={list.map((it) => it.name)}>
                <section>
                  <CategoryManager
                    slug={slug}
                    category={cat}
                    isFirst={ci === 0}
                    isLast={ci === cats.length - 1}
                    itemCount={list.length}
                  />

                  <div className="mt-md grid grid-cols-1 gap-md sm:grid-cols-2 xl:grid-cols-3">
                    {list.map((it, ii) => (
                      <ItemFilter key={it.id} name={it.name}>
                        <Card
                          className={`flex flex-col gap-sm p-md ${it.is_available ? "" : "opacity-70"}`}
                        >
                          {/* Ảnh + thông tin */}
                          <div className="flex gap-md">
                            <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md bg-surface">
                              {it.image_url ? (
                                <Image
                                  src={urlAnh(it.image_url)!}
                                  alt={it.name}
                                  fill
                                  /* sizes = 2× bề rộng ô (64px): object-cover trên ảnh NGANG phải
                                     crop theo chiều cao, nên bản đúng 64w (cao ~36px) bị phóng to
                                     → mờ. Xin 128w để chiều cao đủ lấp ô vuông, và DPR2 lấy 256w. */
                                  sizes="128px"
                                  className="object-cover"
                                />
                              ) : (
                                <span className="grid h-full w-full place-items-center text-[10px] text-muted">
                                  Không ảnh
                                </span>
                              )}
                              {!it.is_available && (
                                <span className="absolute left-1 top-1 rounded bg-status-late px-1 text-[10px] font-semibold text-status-late-fg">
                                  Hết
                                </span>
                              )}
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-sm">
                                <span className="line-clamp-2 font-medium leading-snug text-ink">
                                  {it.name}
                                </span>
                                <span className="shrink-0 text-sm font-semibold text-primary">
                                  {vnd(it.base_price)}
                                </span>
                              </div>
                              {it.description && (
                                <p className="mt-xxs line-clamp-2 text-xs text-steel">{it.description}</p>
                              )}
                              {it.source_id && it.price_locked && (
                                <form action={followChainPrice} className="mt-xxs flex flex-wrap items-center gap-xs text-xs">
                                  <input type="hidden" name="slug" value={slug} />
                                  <input type="hidden" name="id" value={it.id} />
                                  <span className="text-steel">Giá riêng chi nhánh ·</span>
                                  <button type="submit" className="text-primary underline-offset-4 hover:underline">
                                    Theo giá chuỗi
                                  </button>
                                </form>
                              )}
                            </div>
                          </div>

                          {/* Footer thao tác — chiếm hết chiều ngang thẻ. `flex-wrap` để switch còn/hết
                              + 4 nút xuống hàng thay vì tràn khỏi thẻ trên màn ~360px. */}
                          <div className="mt-auto flex flex-wrap items-center justify-between gap-xs border-t border-hairline-soft pt-sm">
                            <AvailabilityToggle slug={slug} itemId={it.id} available={it.is_available} />
                            <div className="flex items-center gap-xs">
                              <form action={reorderItem}>
                                <input type="hidden" name="slug" value={slug} />
                                <input type="hidden" name="id" value={it.id} />
                                <input type="hidden" name="category_id" value={it.category_id} />
                                <input type="hidden" name="dir" value="up" />
                                <button
                                  type="submit"
                                  disabled={ii === 0}
                                  aria-label="Chuyển món lên"
                                  className="grid h-9 w-9 place-items-center rounded-md text-steel hover:bg-surface disabled:opacity-40"
                                >
                                  ↑
                                </button>
                              </form>
                              <form action={reorderItem}>
                                <input type="hidden" name="slug" value={slug} />
                                <input type="hidden" name="id" value={it.id} />
                                <input type="hidden" name="category_id" value={it.category_id} />
                                <input type="hidden" name="dir" value="down" />
                                <button
                                  type="submit"
                                  disabled={ii === list.length - 1}
                                  aria-label="Chuyển món xuống"
                                  className="grid h-9 w-9 place-items-center rounded-md text-steel hover:bg-surface disabled:opacity-40"
                                >
                                  ↓
                                </button>
                              </form>
                              <ItemDialog
                                slug={slug}
                                categories={catOptions}
                                item={it}
                                trigger={
                                  <button
                                    type="button"
                                    className="inline-flex h-9 items-center rounded-md px-sm text-sm text-primary hover:bg-surface"
                                  >
                                    Sửa
                                  </button>
                                }
                              >
                                <ModifierGroupPicker
                                  slug={slug}
                                  allGroups={allGroups}
                                  attachedIds={groupsByItem.get(it.id) ?? []}
                                />
                              </ItemDialog>
                              <form action={deleteItem}>
                                <input type="hidden" name="slug" value={slug} />
                                <input type="hidden" name="id" value={it.id} />
                                <ConfirmSubmit
                                  message={`Xóa món "${it.name}"? Thao tác không hoàn tác được.`}
                                  className="inline-flex h-9 items-center rounded-md px-sm text-sm text-status-late hover:bg-surface"
                                >
                                  Xóa
                                </ConfirmSubmit>
                              </form>
                            </div>
                          </div>
                        </Card>
                      </ItemFilter>
                    ))}

                    {/* Thêm món vào danh mục này */}
                    <HideWhileSearching>
                      <div className="grid min-h-[112px] place-items-center rounded-lg border border-dashed border-hairline-strong p-md">
                        <ItemDialog
                          slug={slug}
                          categories={catOptions}
                          defaultCategoryId={cat.id}
                          trigger={
                            <button
                              type="button"
                              className="rounded-md px-md py-sm text-sm font-medium text-steel hover:text-primary"
                            >
                              + Thêm món vào &quot;{cat.name}&quot;
                            </button>
                          }
                        >
                          <ModifierGroupPicker slug={slug} allGroups={allGroups} />
                        </ItemDialog>
                      </div>
                    </HideWhileSearching>
                  </div>
                </section>
              </CategoryFilter>
            );
          })}
        </div>
      </MenuSearchProvider>
    </div>
  );
}
