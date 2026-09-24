"use client";

import { useState } from "react";
import { SubmitButton } from "@/components/ui/submit-button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { BASE_UNIT_LABEL, type BaseUnit } from "@/lib/inventory/types";
import { recordReceipts } from "@/app/r/[slug]/admin/(protected)/inventory/actions";

export type ReceiptIngredient = {
  id: string;
  name: string;
  base_unit: BaseUnit;
  purchase_unit: string | null;
};

type Row = { key: number; ingredient_id: string; qty: string; price: string };

/**
 * Nhập buổi sáng (INV-04). Danh sách ĐIỀN SẴN nguyên liệu của lần nhập gần nhất — sáng nào quán cũng
 * mua gần như cùng một danh sách, chỉ sửa số. Dòng để trống số lượng = hôm nay không nhập, bỏ qua.
 */
export function ReceiptForm({
  slug,
  ingredients,
  prefill,
}: {
  slug: string;
  ingredients: ReceiptIngredient[];
  prefill: string[];
}) {
  const [rows, setRows] = useState<Row[]>(() => {
    const start = prefill.length > 0 ? prefill : [""];
    return start.map((id, i) => ({ key: i, ingredient_id: id, qty: "", price: "" }));
  });
  const [nextKey, setNextKey] = useState(rows.length);
  const unitOf = (id: string) => {
    const i = ingredients.find((x) => x.id === id);
    return i ? i.purchase_unit ?? BASE_UNIT_LABEL[i.base_unit] : "";
  };
  const update = (key: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  return (
    <form action={recordReceipts} className="flex flex-col gap-sm">
      <input type="hidden" name="slug" value={slug} />
      <input
        type="hidden"
        name="rows"
        value={JSON.stringify(rows.map(({ ingredient_id, qty, price }) => ({ ingredient_id, qty, price })))}
      />
      {rows.map((r) => (
        <div key={r.key} className="grid grid-cols-[1fr_auto] gap-xs sm:grid-cols-[1fr_7rem_9rem_auto]">
          <select
            aria-label="Nguyên liệu"
            value={r.ingredient_id}
            onChange={(e) => update(r.key, { ingredient_id: e.target.value })}
            className="col-span-2 h-11 min-w-0 rounded-md border border-hairline-strong bg-canvas px-sm text-base text-ink sm:col-span-1 sm:text-sm focus-visible:border-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
          >
            <option value="">— Chọn —</option>
            {ingredients.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-xs">
            <Input
              aria-label={`Số lượng (${unitOf(r.ingredient_id)})`}
              inputMode="decimal"
              value={r.qty}
              onChange={(e) => update(r.key, { qty: e.target.value })}
              placeholder="0"
              className="w-20 text-right tabular-nums"
            />
            <span className="w-10 shrink-0 text-sm text-steel">{unitOf(r.ingredient_id)}</span>
          </div>
          <MoneyInput
            aria-label="Giá (không bắt buộc)"
            value={Number(r.price) || 0}
            onChange={(v) => update(r.key, { price: v ? String(v) : "" })}
            placeholder={`Giá / ${unitOf(r.ingredient_id) || "đv"}`}
          />
          <button
            type="button"
            aria-label="Bỏ dòng"
            onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
            className="grid h-11 w-9 place-items-center rounded-md text-steel hover:bg-surface"
          >
            ✕
          </button>
        </div>
      ))}
      <div className="flex flex-wrap items-center justify-between gap-sm">
        <button
          type="button"
          onClick={() => {
            setRows((rs) => [...rs, { key: nextKey, ingredient_id: "", qty: "", price: "" }]);
            setNextKey((k) => k + 1);
          }}
          className="inline-flex min-h-11 items-center rounded-md px-sm text-sm text-primary hover:bg-surface"
        >
          + Thêm nguyên liệu khác
        </button>
        <SubmitButton size="sm" className="h-11 sm:h-9" pendingLabel="Đang ghi…">
          Ghi phiếu nhập
        </SubmitButton>
      </div>
    </form>
  );
}
