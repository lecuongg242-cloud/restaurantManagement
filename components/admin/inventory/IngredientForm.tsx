"use client";

import { useState } from "react";
import { SubmitButton } from "@/components/ui/submit-button";
import { Input } from "@/components/ui/input";
import { MoneyField } from "@/components/ui/money-input";
import type { Ingredient } from "@/lib/inventory/types";
import { purchasePrice } from "@/lib/inventory/units";
import { createIngredient, updateIngredient } from "@/app/r/[slug]/admin/(protected)/inventory/actions";

const SELECT =
  "h-11 w-full min-w-0 rounded-md border border-hairline-strong bg-canvas px-md text-base text-ink sm:text-sm focus-visible:border-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary";

/**
 * Thêm/sửa một nguyên liệu. Giá nhập theo ĐƠN VỊ NHẬP ("280.000 / kg") vì người ở quán nghĩ vậy;
 * server đổi về đồng / đơn vị gốc. Bán thành phẩm không có giá tay — giá suy từ công thức mẻ.
 */
export function IngredientForm({ slug, ingredient }: { slug: string; ingredient?: Ingredient }) {
  const [kind, setKind] = useState(ingredient?.kind ?? "purchased");
  const [baseUnit, setBaseUnit] = useState(ingredient?.base_unit ?? "g");
  const [purchaseUnit, setPurchaseUnit] = useState(ingredient?.purchase_unit ?? "");
  const factor = ingredient?.purchase_factor ?? 1;
  const unitWord = baseUnit === "cai" ? "cái" : baseUnit;
  const price = ingredient ? purchasePrice(ingredient.last_unit_cost, factor) : null;

  return (
    <form
      action={ingredient ? updateIngredient : createIngredient}
      className="grid grid-cols-1 gap-md sm:grid-cols-2"
    >
      <input type="hidden" name="slug" value={slug} />
      {ingredient && <input type="hidden" name="id" value={ingredient.id} />}

      <label className="flex flex-col gap-xxs text-sm text-slate sm:col-span-2">
        Tên
        <Input name="name" required defaultValue={ingredient?.name ?? ""} placeholder="Thịt bò" />
      </label>

      <label className="flex flex-col gap-xxs text-sm text-slate">
        Loại
        <select
          name="kind"
          value={kind}
          onChange={(e) => setKind(e.target.value as typeof kind)}
          className={SELECT}
        >
          <option value="purchased">Mua vào</option>
          <option value="prepared">Bán thành phẩm (quán tự nấu)</option>
        </select>
      </label>

      <label className="flex flex-col gap-xxs text-sm text-slate">
        Đơn vị trừ kho
        <select
          name="base_unit"
          value={baseUnit}
          onChange={(e) => setBaseUnit(e.target.value as typeof baseUnit)}
          className={SELECT}
        >
          <option value="g">gam (g)</option>
          <option value="ml">mililít (ml)</option>
          <option value="cai">cái / quả / lon</option>
        </select>
      </label>

      {kind === "purchased" ? (
        <>
          <label className="flex flex-col gap-xxs text-sm text-slate">
            Đơn vị lúc mua (không bắt buộc)
            <Input
              name="purchase_unit"
              value={purchaseUnit}
              onChange={(e) => setPurchaseUnit(e.target.value)}
              placeholder="kg, vỉ, thùng…"
            />
          </label>
          {purchaseUnit.trim() && (
            <label className="flex flex-col gap-xxs text-sm text-slate">
              1 {purchaseUnit.trim()} = bao nhiêu {unitWord}?
              <Input
                name="purchase_factor"
                required
                inputMode="decimal"
                defaultValue={ingredient?.purchase_unit ? String(factor).replace(".", ",") : ""}
                placeholder="1000"
              />
            </label>
          )}
          <label className="flex flex-col gap-xxs text-sm text-slate">
            Giá gần nhất / {purchaseUnit.trim() || unitWord} (không bắt buộc)
            <MoneyField name="price" defaultValue={price ?? ""} placeholder="280.000" />
          </label>
          <label className="flex flex-col gap-xxs text-sm text-slate">
            % dùng được sau sơ chế
            <Input
              name="yield_pct"
              inputMode="numeric"
              defaultValue={ingredient?.yield_pct ?? 100}
              placeholder="100"
            />
          </label>
        </>
      ) : (
        <label className="flex flex-col gap-xxs text-sm text-slate sm:col-span-2">
          1 mẻ nấu ra bao nhiêu {unitWord}?
          <Input
            name="batch_output_qty"
            required
            inputMode="decimal"
            defaultValue={ingredient?.batch_output_qty ? String(ingredient.batch_output_qty).replace(".", ",") : ""}
            placeholder="40000"
          />
        </label>
      )}

      <label className="flex min-h-11 items-center gap-sm text-sm text-slate sm:col-span-2">
        <input
          type="checkbox"
          name="must_count"
          defaultChecked={ingredient?.must_count ?? false}
          className="h-5 w-5 accent-primary"
        />
        Cần kiểm kê cuối ngày (nguyên liệu đắt: thịt, hải sản, nước dùng)
      </label>

      <div className="flex justify-end sm:col-span-2">
        <SubmitButton size="sm" className="h-11 sm:h-9" pendingLabel="Đang lưu…">
          {ingredient ? "Lưu" : "Thêm nguyên liệu"}
        </SubmitButton>
      </div>
    </form>
  );
}
