"use client";

import Link from "next/link";

/**
 * Chọn nhiều nhóm tùy chọn để gắn vào món (N-N). Dùng trong ItemDialog: checkbox
 * name="group_ids" submit cùng form; server (create/update Item) đồng bộ
 * menu_item_modifier_groups theo danh sách này. Hidden group_picker=1 báo server
 * form CÓ picker (tránh vô tình gỡ hết khi form không kèm picker).
 */
export function ModifierGroupPicker({
  slug,
  allGroups,
  attachedIds = [],
}: {
  slug: string;
  allGroups: { id: string; name: string }[];
  attachedIds?: string[];
}) {
  const attached = new Set(attachedIds);

  return (
    <fieldset className="flex flex-col gap-xs rounded-md border border-hairline-soft p-md">
      <legend className="px-xs text-sm font-medium text-ink">Nhóm tùy chọn</legend>
      <input type="hidden" name="group_picker" value="1" />
      {allGroups.length === 0 ? (
        <p className="text-xs text-steel">
          Chưa có nhóm tùy chọn.{" "}
          <Link
            href={`/r/${slug}/admin/menu/modifiers`}
            className="text-primary underline-offset-4 hover:underline"
          >
            Tạo nhóm
          </Link>{" "}
          (size, topping…) rồi quay lại gắn.
        </p>
      ) : (
        <div className="flex flex-wrap gap-sm">
          {allGroups.map((g) => (
            <label
              key={g.id}
              className="flex items-center gap-xs rounded-md border border-hairline-soft px-sm py-xs text-sm text-slate hover:bg-surface"
            >
              <input
                type="checkbox"
                name="group_ids"
                value={g.id}
                defaultChecked={attached.has(g.id)}
                className="h-4 w-4 rounded border-hairline-strong text-primary"
              />
              {g.name}
            </label>
          ))}
        </div>
      )}
    </fieldset>
  );
}
