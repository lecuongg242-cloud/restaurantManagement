"use client";

import { useState } from "react";
import { SubmitButton } from "@/components/ui/submit-button";
import { Input } from "@/components/ui/input";
import { recordCounts } from "@/app/r/[slug]/admin/(protected)/inventory/actions";

export type CountRow = { id: string; name: string; unit: string; theoretical: string };

/**
 * Kiểm kê cuối ngày (INV-08): chỉ nguyên liệu "cần kiểm". Hiện tồn lý thuyết bên cạnh để người đếm
 * thấy ngay chỗ lệch lớn; ô để trống = không đếm nguyên liệu đó.
 */
export function CountForm({ slug, rows }: { slug: string; rows: CountRow[] }) {
  const [counted, setCounted] = useState<Record<string, string>>({});
  return (
    <form action={recordCounts} className="flex flex-col gap-sm">
      <input type="hidden" name="slug" value={slug} />
      <input
        type="hidden"
        name="rows"
        value={JSON.stringify(rows.map((r) => ({ ingredient_id: r.id, counted: counted[r.id] ?? "" })))}
      />
      <ul className="divide-y divide-hairline-soft rounded-lg border border-hairline-soft">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-sm px-md py-sm">
            <span className="min-w-0 text-sm text-ink">
              {r.name}
              <span className="block text-xs text-steel">Sổ: {r.theoretical}</span>
            </span>
            <span className="flex items-center gap-xs">
              <Input
                aria-label={`Số đếm ${r.name} (${r.unit})`}
                inputMode="decimal"
                value={counted[r.id] ?? ""}
                onChange={(e) => setCounted((c) => ({ ...c, [r.id]: e.target.value }))}
                placeholder="Đếm được"
                className="w-28 text-right tabular-nums"
              />
              <span className="w-10 text-sm text-steel">{r.unit}</span>
            </span>
          </li>
        ))}
      </ul>
      <div className="flex justify-end">
        <SubmitButton size="sm" className="h-11 sm:h-9" pendingLabel="Đang ghi…">
          Ghi kiểm kê
        </SubmitButton>
      </div>
    </form>
  );
}
