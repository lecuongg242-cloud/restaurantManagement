"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { renameCategory, deleteCategory, reorderCategory } from "./actions";
import type { Category } from "@/lib/menu/types";

/**
 * Header điều khiển của MỘT danh mục: sửa tên inline, đổi thứ tự (lên/xuống), xóa.
 * Các thao tác đi qua server action (form). Danh sách món render ở page.
 */
export function CategoryManager({
  slug,
  category,
  isFirst,
  isLast,
  itemCount,
}: {
  slug: string;
  category: Category;
  isFirst: boolean;
  isLast: boolean;
  itemCount: number;
}) {
  const [editing, setEditing] = useState(false);

  return (
    <div className="flex flex-wrap items-center justify-between gap-sm">
      {editing ? (
        <form
          action={renameCategory}
          className="flex items-center gap-xs"
          onSubmit={() => setEditing(false)}
        >
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="id" value={category.id} />
          <Input
            name="name"
            defaultValue={category.name}
            autoFocus
            required
            className="h-9 w-48"
          />
          <Button type="submit" variant="primary" size="sm">
            Lưu
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={() => setEditing(false)}>
            Hủy
          </Button>
        </form>
      ) : (
        <div className="flex items-center gap-sm">
          <h2 className="font-display text-xl text-ink">{category.name}</h2>
          <span className="text-xs text-steel">{itemCount} món</span>
          <Button type="button" variant="link" size="sm" onClick={() => setEditing(true)}>
            Sửa tên
          </Button>
        </div>
      )}

      <div className="flex items-center gap-xxs">
        <form action={reorderCategory}>
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="id" value={category.id} />
          <input type="hidden" name="dir" value="up" />
          <Button
            type="submit"
            variant="secondary"
            size="sm"
            disabled={isFirst}
            aria-label="Lên"
          >
            ↑
          </Button>
        </form>
        <form action={reorderCategory}>
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="id" value={category.id} />
          <input type="hidden" name="dir" value="down" />
          <Button
            type="submit"
            variant="secondary"
            size="sm"
            disabled={isLast}
            aria-label="Xuống"
          >
            ↓
          </Button>
        </form>
        <form
          action={deleteCategory}
          onSubmit={(e) => {
            if (
              !confirm(
                `Xóa danh mục "${category.name}"? ${itemCount} món trong danh mục cũng bị xóa.`
              )
            )
              e.preventDefault();
          }}
        >
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="id" value={category.id} />
          <Button type="submit" variant="link" size="sm" className="text-status-late">
            Xóa
          </Button>
        </form>
      </div>
    </div>
  );
}
