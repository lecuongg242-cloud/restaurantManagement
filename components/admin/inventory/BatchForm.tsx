"use client";

import { useMemo, useState } from "react";
import { SubmitButton } from "@/components/ui/submit-button";
import { Input } from "@/components/ui/input";
import { BASE_UNIT_LABEL, type Ingredient, type RecipeLine } from "@/lib/inventory/types";
import { planBatch } from "@/lib/inventory/batch";
import { parseQty } from "@/lib/inventory/units";
import { recordBatch } from "@/app/r/[slug]/admin/(protected)/inventory/actions";

const fmt = (n: number) => n.toLocaleString("vi-VN", { maximumFractionDigits: 1 });

/**
 * Phiếu chế biến mẻ (INV-05). Xem trước lượng trừ + giá / đơn vị ngay trên máy, bằng đúng hàm
 * server sẽ dùng — số trên màn và số ghi vào sổ không thể khác nhau.
 */
export function BatchForm({
  slug,
  ingredients,
  recipes,
}: {
  slug: string;
  ingredients: Ingredient[];
  recipes: Record<string, RecipeLine[]>;
}) {
  const prepared = ingredients.filter((i) => i.kind === "prepared" && i.active && (recipes[i.id] ?? []).length > 0);
  const [id, setId] = useState(prepared[0]?.id ?? "");
  const [count, setCount] = useState("1");
  const [actual, setActual] = useState("");
  const target = prepared.find((p) => p.id === id);
  const n = parseQty(count) ?? 0;
  const expected = (target?.batch_output_qty ?? 0) * n;

  const plan = useMemo(() => {
    if (!target || n <= 0) return null;
    const ctx = {
      ingredients: new Map(ingredients.map((i) => [i.id, i])),
      children: new Map(Object.entries(recipes)),
    };
    const a = actual.trim() ? parseQty(actual) ?? 0 : expected;
    return planBatch(target, recipes[target.id] ?? [], n, a, ctx);
  }, [target, n, actual, expected, ingredients, recipes]);

  if (prepared.length === 0) {
    return <p className="text-sm text-steel">Chưa có bán thành phẩm nào có công thức mẻ.</p>;
  }
  const unit = target ? BASE_UNIT_LABEL[target.base_unit] : "";
  const nameOf = (x: string) => ingredients.find((i) => i.id === x)?.name ?? "?";

  return (
    <form action={recordBatch} className="flex flex-col gap-sm">
      <input type="hidden" name="slug" value={slug} />
      <div className="grid grid-cols-1 gap-sm sm:grid-cols-3">
        <label className="flex flex-col gap-xxs text-sm text-slate">
          Bán thành phẩm
          <select
            name="ingredient_id"
            value={id}
            onChange={(e) => {
              setId(e.target.value);
              setActual("");
            }}
            className="h-11 min-w-0 rounded-md border border-hairline-strong bg-canvas px-sm text-base text-ink sm:text-sm"
          >
            {prepared.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-xxs text-sm text-slate">
          Số mẻ
          <Input name="batch_count" inputMode="decimal" value={count} onChange={(e) => setCount(e.target.value)} />
        </label>
        <label className="flex flex-col gap-xxs text-sm text-slate">
          Thực ra được ({unit})
          <Input
            name={actual.trim() ? "actual_qty" : undefined}
            inputMode="decimal"
            value={actual}
            onChange={(e) => setActual(e.target.value)}
            placeholder={expected ? String(expected) : ""}
          />
        </label>
      </div>
      {/* Để trống "thực ra được" = đúng công thức. Gửi số công thức để server không phải đoán. */}
      {!actual.trim() && <input type="hidden" name="actual_qty" value={String(expected)} />}

      {plan && (
        <div className="rounded-md bg-surface p-sm text-sm text-slate">
          <p>
            Trừ: {plan.consume.map((c) => `${nameOf(c.ingredient_id)} ${fmt(c.qty)}`).join(" · ")}
          </p>
          <p className="mt-xxs">
            Công thức {fmt(plan.expectedQty)} {unit}
            {plan.shortfall !== 0 && (
              <span className={plan.shortfall > 0 ? "text-status-late" : ""}>
                {" "}· {plan.shortfall > 0 ? "hụt" : "dư"} {fmt(Math.abs(plan.shortfall))} {unit}
              </span>
            )}
            {" · "}
            {plan.unitCost === null
              ? "chưa đủ giá"
              : `giá ${fmt(plan.unitCost * (target!.base_unit === "cai" ? 1 : 1000))}₫ / ${target!.base_unit === "cai" ? "cái" : `1.000 ${unit}`}`}
          </p>
        </div>
      )}

      <div className="flex justify-end">
        <SubmitButton size="sm" className="h-11 sm:h-9" pendingLabel="Đang ghi…">
          Ghi phiếu chế biến
        </SubmitButton>
      </div>
    </form>
  );
}
