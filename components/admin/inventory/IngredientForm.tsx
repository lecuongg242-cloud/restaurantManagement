"use client";

import { useState } from "react";
import { SubmitButton } from "@/components/ui/submit-button";
import { Input } from "@/components/ui/input";
import { MoneyField } from "@/components/ui/money-input";
import { BASE_UNIT_LABEL, BASE_UNIT_OPTIONS, type Ingredient } from "@/lib/inventory/types";
import { knownFactor, purchasePrice } from "@/lib/inventory/units";
import { createIngredient, updateIngredient } from "@/app/r/[slug]/admin/(protected)/inventory/actions";

const SELECT =
  "h-11 w-full min-w-0 rounded-md border border-hairline-strong bg-canvas px-md text-base text-ink sm:text-sm focus-visible:border-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary";

/**
 * Thêm/sửa một nguyên liệu. Giá nhập theo ĐƠN VỊ NHẬP ("280.000 / kg") vì người ở quán nghĩ vậy;
 * server đổi về đồng / đơn vị gốc. Bán thành phẩm không có giá tay — giá suy từ công thức mẻ.
 */
export function IngredientForm({
  slug,
  ingredient,
  openingAllowed = !ingredient,
}: {
  slug: string;
  ingredient?: Ingredient;
  /** Nguyên liệu chưa có phát sinh kho nào → khai được "Tồn hiện có" (P26). Thêm mới luôn được. */
  openingAllowed?: boolean;
}) {
  const [kind, setKind] = useState(ingredient?.kind ?? "purchased");
  const [baseUnit, setBaseUnit] = useState(ingredient?.base_unit ?? "g");
  const [purchaseUnit, setPurchaseUnit] = useState(ingredient?.purchase_unit ?? "");
  const factor = ingredient?.purchase_factor ?? 1;
  const known = purchaseUnit.trim() ? knownFactor(purchaseUnit, baseUnit) : null;
  const unitWord = BASE_UNIT_LABEL[baseUnit];
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
          {BASE_UNIT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <span className="text-xs text-steel">
          Đơn vị ghi định lượng và tồn kho. Theo kg / lít thì nhỏ nhất là 0,001 (1 g / 1 ml) — gia vị dùng dưới 1 g nên chọn gam.
        </span>
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
          {purchaseUnit.trim() && known !== null && (
            <div className="flex flex-col gap-xxs text-sm text-slate" data-he-so-tu-tinh>
              Quy đổi
              <input type="hidden" name="purchase_factor" value={String(known)} />
              <p className="flex min-h-11 items-center rounded-md border border-hairline-soft bg-surface px-md text-ink">
                1 {purchaseUnit.trim()} = {known.toLocaleString("vi-VN", { maximumFractionDigits: 3 })} {unitWord} · tự tính
              </p>
            </div>
          )}
          {purchaseUnit.trim() && known === null && (
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
          {/* Không gõ tay (chủ dự án 29/09/2026): tự tính từ kiểm kê — lib/inventory/yield.ts. */}
          <div className="flex flex-col gap-xxs text-sm text-slate" data-dung-duoc>
            % dùng được (tự tính)
            <p className="flex min-h-11 items-center rounded-md border border-hairline-soft bg-surface px-md text-ink">
              {ingredient && ingredient.yield_days > 0
                ? `${ingredient.yield_pct}% · từ ${ingredient.yield_days} lần kiểm kê gần nhất`
                : "100% · chưa đủ dữ liệu"}
            </p>
            <span className="text-xs text-steel">
              = định lượng × số bán ÷ lượng thực dùng (tồn đầu + nhập − tồn cuối đếm được), 14 lần kiểm kê gần nhất. Bật
              &quot;Cần kiểm kê cuối ngày&quot; để hệ thống tự tính.
            </span>
          </div>
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

      {openingAllowed && (
        <label className="flex flex-col gap-xxs text-sm text-slate sm:col-span-2" data-ton-dau>
          Tồn hiện có (không bắt buộc)
          <span className="flex items-center gap-xs">
            <Input name="opening_qty" inputMode="decimal" placeholder="0" className="max-w-40" />
            <span className="text-steel">{kind === "purchased" && purchaseUnit.trim() ? purchaseUnit.trim() : unitWord}</span>
          </span>
          <span className="text-xs text-steel">
            Hàng đang có sẵn trong kho lúc bắt đầu dùng (như &quot;Tồn kho ban đầu&quot;). Chỉ khai một lần, trước khi nhập /
            xuất; không tính vào hao hụt. Sau đó tồn lệch thì kiểm kê.
          </span>
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
