"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Input } from "@/components/ui/input";
import { MoneyField } from "@/components/ui/money-input";
import { ImageUpload } from "@/components/menu/ImageUpload";
import { createItem, updateItem } from "./actions";
import type { Category, Item } from "@/lib/menu/types";
import { urlAnh } from "@/lib/storage/public-url";

/**
 * Dialog thêm/sửa món. Form gửi FormData (kèm ảnh) tới createItem/updateItem
 * (server re-validate ảnh). Slot `children` để 02-02 chèn ModifierGroupPicker.
 */
export function ItemDialog({
  slug,
  categories,
  item = null,
  defaultCategoryId,
  trigger,
  children,
}: {
  slug: string;
  categories: Pick<Category, "id" | "name">[];
  item?: Item | null;
  defaultCategoryId?: string;
  trigger?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const isEdit = !!item;
  const action = isEdit ? updateItem : createItem;

  // Escape đóng dialog + khóa scroll nền khi mở (UX: keyboard nav / modal cơ bản).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <span onClick={() => setOpen(true)} className="inline-flex">
        {trigger ?? (
          <Button type="button" variant={isEdit ? "secondary" : "primary"} size="sm">
            {isEdit ? "Sửa" : "Thêm món"}
          </Button>
        )}
      </span>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overscroll-contain bg-ink/40 p-sm sm:p-lg"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={isEdit ? "Sửa món" : "Thêm món"}
            // Trên điện thoại lề/padding phải nhỏ lại, không thì form còn chưa tới 300px bề ngang.
            className="my-sm w-full max-w-lg rounded-lg border border-hairline-soft bg-canvas p-lg shadow-modal sm:mt-lg sm:p-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl text-ink">
                {isEdit ? "Sửa món" : "Thêm món mới"}
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Đóng"
                className="grid h-9 w-9 place-items-center rounded-md text-steel hover:bg-surface"
              >
                ✕
              </button>
            </div>

            <form action={action} className="mt-lg flex flex-col gap-md">
              <input type="hidden" name="slug" value={slug} />
              {isEdit && <input type="hidden" name="id" value={item!.id} />}

              <label className="flex flex-col gap-xxs text-sm text-slate">
                Tên món
                <Input
                  name="name"
                  required
                  autoFocus
                  defaultValue={item?.name ?? ""}
                  placeholder="Phở bò"
                />
              </label>

              <label className="flex flex-col gap-xxs text-sm text-slate">
                Danh mục
                <select
                  name="category_id"
                  required
                  defaultValue={item?.category_id ?? defaultCategoryId ?? ""}
                  // min-w-0: <select> rộng bằng tên danh mục dài nhất — phải cho co trong dialog hẹp.
                  className="h-11 w-full min-w-0 rounded-md border border-hairline-strong bg-canvas px-md text-base text-ink sm:text-sm focus-visible:border-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                >
                  <option value="" disabled>
                    — Chọn danh mục —
                  </option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-xxs text-sm text-slate">
                Giá (VND)
                <MoneyField
                  name="base_price"
                  required
                  defaultValue={item ? item.base_price : ""}
                  placeholder="45.000"
                />
              </label>

              <label className="flex flex-col gap-xxs text-sm text-slate">
                Mô tả
                <textarea
                  name="description"
                  rows={2}
                  defaultValue={item?.description ?? ""}
                  placeholder="Phở bò tái, nước dùng đậm đà"
                  className="rounded-md border border-hairline-strong bg-canvas px-md py-sm text-base text-ink placeholder:text-muted sm:text-sm focus-visible:border-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                />
              </label>

              <ImageUpload currentUrl={urlAnh(item?.image_url)} />

              {children}

              {/* h-11 (44px) trên mobile — vùng chạm AA; desktop về h-9 cho gọn. */}
              <div className="mt-sm flex items-center justify-end gap-sm">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-11 sm:h-9"
                  onClick={() => setOpen(false)}
                >
                  Hủy
                </Button>
                <SubmitButton size="sm" className="h-11 sm:h-9" pendingLabel="Đang lưu…">
                  {isEdit ? "Lưu" : "Thêm món"}
                </SubmitButton>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
