"use client";

import { useOptimistic, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import type { ModifierGroupWithOptions } from "@/lib/menu/types";
import {
  updateGroup,
  deleteGroup,
  addOption,
  updateOption,
  deleteOption,
  setOptionAvailable,
} from "./actions";

const vnd = (n: number) => (n > 0 ? "+" + n.toLocaleString("vi-VN") + "₫" : "+0₫");

/** Panel một nhóm tùy chọn: cấu hình min/max/required + danh sách option. */
export function GroupEditor({
  slug,
  group,
}: {
  slug: string;
  group: ModifierGroupWithOptions;
}) {
  return (
    <Card className="p-md">
      {/* Cấu hình nhóm */}
      <div className="flex flex-wrap items-end gap-sm">
        <form action={updateGroup} className="flex flex-wrap items-end gap-sm">
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="id" value={group.id} />
          <label className="flex flex-col gap-xxs text-sm text-slate">
            Tên nhóm
            <Input name="name" defaultValue={group.name} required className="h-9 w-40" />
          </label>
          <label className="flex flex-col gap-xxs text-sm text-slate">
            Chọn tối thiểu
            <Input
              name="min_select"
              type="number"
              min={0}
              defaultValue={group.min_select}
              className="h-9 w-20"
            />
          </label>
          <label className="flex flex-col gap-xxs text-sm text-slate">
            Chọn tối đa
            <Input
              name="max_select"
              type="number"
              min={0}
              defaultValue={group.max_select}
              className="h-9 w-20"
            />
          </label>
          <label className="flex items-center gap-xs text-sm text-slate">
            <input
              type="checkbox"
              name="required"
              defaultChecked={group.required}
              className="h-4 w-4 rounded border-hairline-strong text-primary"
            />
            Bắt buộc
          </label>
          <Button type="submit" size="sm">Lưu nhóm</Button>
        </form>
        <form
          action={deleteGroup}
          onSubmit={(e) => {
            if (!confirm(`Xóa nhóm "${group.name}"? Gắn kết với món cũng bị gỡ.`))
              e.preventDefault();
          }}
        >
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="id" value={group.id} />
          <Button type="submit" variant="link" size="sm" className="text-status-late">
            Xóa nhóm
          </Button>
        </form>
      </div>

      {/* Option */}
      <div className="mt-md flex flex-col gap-xs border-t border-hairline-soft pt-md">
        {group.options.map((o) => (
          <div key={o.id} className="flex flex-wrap items-center gap-sm">
            <form action={updateOption} className="flex items-center gap-xs">
              <input type="hidden" name="slug" value={slug} />
              <input type="hidden" name="id" value={o.id} />
              <Input name="name" defaultValue={o.name} required className="h-9 w-36" />
              <Input
                name="price_delta"
                inputMode="numeric"
                defaultValue={String(o.price_delta)}
                className="h-9 w-24"
                aria-label="Phụ thu (VND)"
              />
              <Button type="submit" variant="secondary" size="sm">Lưu</Button>
            </form>
            <span className="text-xs text-steel">{vnd(o.price_delta)}</span>
            <OptionToggle slug={slug} optionId={o.id} available={o.is_available} />
            <form action={deleteOption}>
              <input type="hidden" name="slug" value={slug} />
              <input type="hidden" name="id" value={o.id} />
              <Button type="submit" variant="link" size="sm" className="text-status-late">
                Xóa
              </Button>
            </form>
          </div>
        ))}
        {group.options.length === 0 && (
          <p className="text-sm text-steel">Chưa có tùy chọn. Thêm ở dưới.</p>
        )}

        {/* Thêm option */}
        <form action={addOption} className="mt-xs flex flex-wrap items-end gap-xs">
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="group_id" value={group.id} />
          <label className="flex flex-col gap-xxs text-sm text-slate">
            Tùy chọn mới
            <Input name="name" required placeholder="Lớn" className="h-9 w-36" />
          </label>
          <label className="flex flex-col gap-xxs text-sm text-slate">
            Phụ thu (VND)
            <Input name="price_delta" inputMode="numeric" placeholder="10000" className="h-9 w-24" />
          </label>
          <SubmitButton size="sm" pendingLabel="…">Thêm</SubmitButton>
        </form>
      </div>
    </Card>
  );
}

function OptionToggle({
  slug,
  optionId,
  available,
}: {
  slug: string;
  optionId: string;
  available: boolean;
}) {
  const [optimistic, setOptimistic] = useOptimistic(available);
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = !optimistic;
    startTransition(async () => {
      setOptimistic(next);
      try {
        await setOptionAvailable(slug, optionId, next);
      } catch {
        setOptimistic(!next);
      }
    });
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={optimistic}
      onClick={toggle}
      disabled={pending}
      className={`text-xs font-medium ${optimistic ? "text-status-ready" : "text-status-late"} disabled:opacity-60`}
    >
      {optimistic ? "Còn" : "Hết"}
    </button>
  );
}
