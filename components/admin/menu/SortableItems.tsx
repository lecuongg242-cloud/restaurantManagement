"use client";

import type { ReactNode } from "react";
import { SortableList } from "@/components/ui/sortable";
import { reorderItems } from "@/app/r/[slug]/admin/(protected)/menu/actions";

export { DragHandle } from "@/components/ui/sortable";

/**
 * Lưới món kéo thả trong MỘT danh mục (P38). Thẻ món do server dựng (`items[].node`, có `<DragHandle>` bên trong); ở
 * đây chỉ nối `SortableList` với action lưu.
 */
export function SortableItems({
  slug,
  categoryId,
  items,
  tail,
}: {
  slug: string;
  categoryId: string;
  items: { id: string; node: ReactNode }[];
  /** Ô "+ Thêm món" — đứng cuối lưới, không kéo được. */
  tail?: ReactNode;
}) {
  const byId = new Map(items.map((it) => [it.id, it.node]));
  return (
    <SortableList
      ids={items.map((it) => it.id)}
      onSave={(ids) => reorderItems(slug, categoryId, ids)}
      noun="món"
      className="mt-md grid grid-cols-1 gap-md sm:grid-cols-2 xl:grid-cols-3"
      cellClassName="flex flex-col [&>*]:flex-1"
      tail={tail}
    >
      {(id) => byId.get(id)}
    </SortableList>
  );
}
