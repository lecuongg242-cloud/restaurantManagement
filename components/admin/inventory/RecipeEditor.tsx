"use client";

import { useState } from "react";
import { SubmitButton } from "@/components/ui/submit-button";
import { Input } from "@/components/ui/input";
import { BASE_UNIT_LABEL, type BaseUnit } from "@/lib/inventory/types";
import { saveRecipe } from "@/app/r/[slug]/admin/(protected)/inventory/actions";

export type IngredientOption = { id: string; name: string; base_unit: BaseUnit; kind: "purchased" | "prepared" };

type Row = { key: number; ingredient_id: string; qty: string };

/**
 * Sửa định lượng của MỘT chủ (món / tùy chọn / bán thành phẩm). Lưu trọn danh sách một lần —
 * server kiểm vòng/cấp và giữ bản cũ nếu lưu hỏng.
 */
export function RecipeEditor({
  slug,
  ownerKind,
  ownerId,
  lines,
  options,
  excludeId,
  label,
}: {
  slug: string;
  ownerKind: "item" | "option" | "parent";
  ownerId: string;
  lines: { ingredient_id: string; qty: number }[];
  options: IngredientOption[];
  /** Bán thành phẩm không được chứa chính nó. */
  excludeId?: string;
  label: string;
}) {
  const [rows, setRows] = useState<Row[]>(() =>
    lines.length > 0
      ? lines.map((l, i) => ({ key: i, ingredient_id: l.ingredient_id, qty: String(l.qty).replace(".", ",") }))
      : [{ key: 0, ingredient_id: "", qty: "" }]
  );
  const [nextKey, setNextKey] = useState(rows.length);
  const unitOf = (id: string) => {
    const o = options.find((x) => x.id === id);
    return o ? BASE_UNIT_LABEL[o.base_unit] : "";
  };
  const choices = options.filter((o) => o.id !== excludeId);

  const update = (key: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  return (
    <form action={saveRecipe} className="flex flex-col gap-sm">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="owner_kind" value={ownerKind} />
      <input type="hidden" name="owner_id" value={ownerId} />
      <input
        type="hidden"
        name="lines"
        value={JSON.stringify(rows.map(({ ingredient_id, qty }) => ({ ingredient_id, qty })))}
      />

      {choices.length === 0 && (
        <p className="text-sm text-steel">Chưa có nguyên liệu nào. Thêm ở tab &quot;Nguyên liệu&quot; trước.</p>
      )}

      {rows.map((r) => (
        <div key={r.key} className="flex items-center gap-xs">
          <select
            aria-label={`Nguyên liệu — ${label}`}
            value={r.ingredient_id}
            onChange={(e) => update(r.key, { ingredient_id: e.target.value })}
            className="h-11 min-w-0 flex-1 rounded-md border border-hairline-strong bg-canvas px-sm text-base text-ink sm:text-sm focus-visible:border-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
          >
            <option value="">— Chọn —</option>
            {choices.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
                {o.kind === "prepared" ? " (bán thành phẩm)" : ""}
              </option>
            ))}
          </select>
          <Input
            aria-label={`Lượng — ${label}`}
            inputMode="decimal"
            value={r.qty}
            onChange={(e) => update(r.key, { qty: e.target.value })}
            placeholder="80"
            className="w-20 shrink-0 text-right tabular-nums sm:w-24"
          />
          <span className="w-8 shrink-0 text-sm text-steel">{unitOf(r.ingredient_id)}</span>
          <button
            type="button"
            aria-label="Bỏ dòng"
            onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
            className="grid h-11 w-9 shrink-0 place-items-center rounded-md text-steel hover:bg-surface"
          >
            ✕
          </button>
        </div>
      ))}

      <div className="flex flex-wrap items-center justify-between gap-sm">
        <button
          type="button"
          onClick={() => {
            setRows((rs) => [...rs, { key: nextKey, ingredient_id: "", qty: "" }]);
            setNextKey((k) => k + 1);
          }}
          className="inline-flex min-h-11 items-center rounded-md px-sm text-sm text-primary hover:bg-surface"
        >
          + Thêm nguyên liệu
        </button>
        <SubmitButton size="sm" className="h-11 sm:h-9" pendingLabel="Đang lưu…">
          Lưu định lượng
        </SubmitButton>
      </div>
    </form>
  );
}
