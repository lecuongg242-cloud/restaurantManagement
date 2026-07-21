"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Input } from "@/components/ui/input";
import { ImageUpload } from "@/components/menu/ImageUpload";
import { createItem, updateItem } from "./actions";
import type { Category, Item } from "@/lib/menu/types";

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
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-lg"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={isEdit ? "Sửa món" : "Thêm món"}
            className="mt-lg w-full max-w-lg rounded-lg border border-hairline-soft bg-canvas p-xl shadow-modal"
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
                className="rounded-md px-xs text-steel hover:bg-surface"
              >
                ✕
              </button>
            </div>

            <form action={action} className="mt-lg flex flex-col gap-md">
              <input type="hidden" name="slug" value={slug} />
              {isEdit && <input type="hidden" name="id" value={item!.id} />}

              <label className="flex flex-col gap-xxs text-sm text-slate">
                Tên món
                <Input name="name" required defaultValue={item?.name ?? ""} placeholder="Phở bò" />
              </label>

              <label className="flex flex-col gap-xxs text-sm text-slate">
                Danh mục
                <select
                  name="category_id"
                  required
                  defaultValue={item?.category_id ?? defaultCategoryId ?? ""}
                  className="h-11 rounded-md border border-hairline-strong bg-canvas px-md text-sm text-ink focus-visible:border-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
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
                <Input
                  name="base_price"
                  inputMode="numeric"
                  required
                  defaultValue={item ? String(item.base_price) : ""}
                  placeholder="45000"
                />
              </label>

              <label className="flex flex-col gap-xxs text-sm text-slate">
                Mô tả
                <textarea
                  name="description"
                  rows={2}
                  defaultValue={item?.description ?? ""}
                  placeholder="Phở bò tái, nước dùng đậm đà"
                  className="rounded-md border border-hairline-strong bg-canvas px-md py-sm text-sm text-ink placeholder:text-muted focus-visible:border-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                />
              </label>

              <ImageUpload currentUrl={item?.image_url ?? null} />

              {children}

              <div className="mt-sm flex items-center justify-end gap-sm">
                <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>
                  Hủy
                </Button>
                <SubmitButton size="sm" pendingLabel="Đang lưu…">
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
