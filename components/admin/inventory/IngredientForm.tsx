"use client";

import { useEffect, useRef, useState } from "react";
import { SubmitButton } from "@/components/ui/submit-button";
import { Input } from "@/components/ui/input";
import { MoneyField } from "@/components/ui/money-input";
import { BASE_UNIT_LABEL, BASE_UNIT_OPTIONS, type Ingredient } from "@/lib/inventory/types";
import { knownFactor, purchasePrice } from "@/lib/inventory/units";
import {
  createIngredient,
  setIngredientActive,
  updateIngredient,
} from "@/app/r/[slug]/admin/(protected)/inventory/actions";

const SELECT =
  "h-11 w-full min-w-0 rounded-md border border-hairline-strong bg-canvas px-md text-base text-ink sm:text-sm focus-visible:border-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary";
const LABEL = "flex flex-col gap-xxs text-sm text-slate";
const HINT = "text-xs text-steel";

/**
 * Hộp thoại "Thêm nguyên liệu" / "Sửa nguyên liệu" (P29, chủ dự án chốt 04/10/2026 — như Sapo "Tạo nguyên liệu", KiotViet
 * "+ Thêm mới → Nguyên vật liệu"). Một đơn vị tính + một dòng quy đổi "1 thùng = 24 cái" như Sapo "Quy đổi đơn vị". Giá vốn
 * gõ theo ĐƠN VỊ NHẬP ("280.000 / kg"); server đổi về đồng / đơn vị tính. Bán thành phẩm không có giá tay — suy từ công thức mẻ.
 *
 * `ingredient` = null → thêm mới (có "Lưu & thêm mới"); có → sửa (có "Ẩn nguyên liệu"). Lỗi: giữ hộp thoại, hiện câu lỗi.
 */
export function IngredientDialog({
  slug,
  open,
  ingredient,
  openingAllowed,
  onClose,
}: {
  slug: string;
  open: boolean;
  ingredient: Ingredient | null;
  /** Nguyên liệu chưa có phát sinh kho nào → khai được "Tồn kho ban đầu" (P26). Thêm mới luôn được. */
  openingAllowed: boolean;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  // Đổi số này → form dựng lại sạch (sau "Lưu & thêm mới", hoặc khi mở cho nguyên liệu khác).
  const [round, setRound] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const themTiep = useRef(false);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) {
      setError(null);
      setRound((r) => r + 1);
      d.showModal();
    } else if (!open && d.open) d.close();
  }, [open, ingredient]);

  const tieuDe = ingredient ? "Sửa nguyên liệu" : "Thêm nguyên liệu";

  return (
    <dialog
      ref={dialog}
      aria-labelledby="nguyen-lieu-tieu-de"
      onClose={onClose}
      className="m-auto w-[calc(100%-2rem)] max-w-2xl rounded-lg border border-hairline-soft bg-canvas p-0 text-ink shadow-modal backdrop:bg-ink/40"
    >
      {open && (
        <form
          key={round}
          action={async (fd) => {
            setError(null);
            const r = ingredient ? await updateIngredient(fd) : await createIngredient(fd);
            if (!r.ok) {
              setError(r.error ?? "Chưa lưu được. Vui lòng thử lại.");
              return;
            }
            if (themTiep.current) setRound((n) => n + 1);
            else onClose();
          }}
          className="flex max-h-[calc(100dvh-2rem)] flex-col"
        >
          <div className="flex items-center justify-between gap-md border-b border-hairline-soft px-lg py-md">
            <h2 id="nguyen-lieu-tieu-de" className="font-display text-xl">
              {tieuDe}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Đóng"
              className="grid h-9 w-9 place-items-center rounded-md text-steel hover:bg-surface"
            >
              ✕
            </button>
          </div>
          <div className="overflow-y-auto px-lg py-md">
            <IngredientFields ingredient={ingredient} openingAllowed={openingAllowed} />
            <input type="hidden" name="slug" value={slug} />
            {ingredient && <input type="hidden" name="id" value={ingredient.id} />}
            {error && (
              <p role="alert" className="mt-md rounded-md bg-cream-soft px-md py-sm text-sm text-status-late">
                {error}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-sm border-t border-hairline-soft px-lg py-md">
            {ingredient && (
              // Không có trường "active" → server hiểu là ẩn.
              <button
                type="submit"
                formAction={async (fd) => {
                  const r = await setIngredientActive(fd);
                  if (r.ok) onClose();
                  else setError(r.error ?? "Chưa ẩn được.");
                }}
                formNoValidate
                className="mr-auto inline-flex h-11 items-center rounded-md px-sm text-sm text-status-late hover:bg-surface"
              >
                Ẩn nguyên liệu
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-11 items-center rounded-md border border-hairline-strong px-lg text-sm text-ink hover:bg-surface"
            >
              Bỏ qua
            </button>
            {!ingredient && (
              <SubmitButton
                variant="secondary"
                onClick={() => (themTiep.current = true)}
                pendingLabel="Đang lưu…"
              >
                Lưu &amp; thêm mới
              </SubmitButton>
            )}
            <SubmitButton onClick={() => (themTiep.current = false)} pendingLabel="Đang lưu…">
              Lưu
            </SubmitButton>
          </div>
        </form>
      )}
    </dialog>
  );
}

function IngredientFields({ ingredient, openingAllowed }: { ingredient: Ingredient | null; openingAllowed: boolean }) {
  const [kind, setKind] = useState(ingredient?.kind ?? "purchased");
  const [baseUnit, setBaseUnit] = useState(ingredient?.base_unit ?? "g");
  const [purchaseUnit, setPurchaseUnit] = useState(ingredient?.purchase_unit ?? "");
  const factor = ingredient?.purchase_factor ?? 1;
  const donViNhap = purchaseUnit.trim();
  const known = donViNhap ? knownFactor(donViNhap, baseUnit) : null;
  const unitWord = BASE_UNIT_LABEL[baseUnit];
  const price = ingredient ? purchasePrice(ingredient.last_unit_cost, factor) : null;

  return (
    <div className="grid grid-cols-1 gap-md sm:grid-cols-2">
      <label className={`${LABEL} sm:col-span-2`}>
        Tên nguyên liệu *
        <Input name="name" required autoFocus defaultValue={ingredient?.name ?? ""} placeholder="Thịt bò" />
      </label>

      <fieldset className="flex flex-col gap-xxs text-sm text-slate sm:col-span-2">
        <legend className="mb-xxs">Loại</legend>
        <div className="flex flex-wrap gap-sm">
          {(
            [
              ["purchased", "Mua vào"],
              ["prepared", "Quán tự nấu"],
            ] as const
          ).map(([v, nhan]) => (
            <label
              key={v}
              className={`inline-flex min-h-11 cursor-pointer items-center gap-xs rounded-full border px-md ${
                kind === v ? "border-primary bg-cream text-primary-deep" : "border-hairline-strong text-slate"
              }`}
            >
              <input
                type="radio"
                name="kind"
                value={v}
                checked={kind === v}
                onChange={() => setKind(v)}
                className="h-4 w-4 accent-primary"
              />
              {nhan}
            </label>
          ))}
        </div>
        {kind === "prepared" && <span className={HINT}>Nước dùng, sốt… nấu theo mẻ; giá vốn tính từ công thức mẻ.</span>}
      </fieldset>

      <label className={LABEL}>
        Đơn vị tính *
        <select name="base_unit" value={baseUnit} onChange={(e) => setBaseUnit(e.target.value as typeof baseUnit)} className={SELECT}>
          {BASE_UNIT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <span className={HINT}>Dùng khi ghi định lượng món và tồn kho. Gia vị dùng dưới 1 g thì chọn gam.</span>
      </label>

      {kind === "purchased" ? (
        <div className={LABEL}>
          <span id="don-vi-nhap">Đơn vị nhập hàng</span>
          {/* "1 thùng = 24 cái" như Sapo "Quy đổi đơn vị". Đơn vị quen (kg, lạng, lít…) tự tính hệ số, không cho gõ. */}
          <div className="flex items-center gap-xs" aria-labelledby="don-vi-nhap">
            <span className="text-ink">1</span>
            <Input
              name="purchase_unit"
              aria-label="Đơn vị nhập hàng"
              value={purchaseUnit}
              onChange={(e) => setPurchaseUnit(e.target.value)}
              placeholder="thùng, kg…"
              className="w-28"
            />
            <span className="text-ink">=</span>
            {!donViNhap ? (
              <span className="text-steel">1 {unitWord}</span>
            ) : known !== null ? (
              <>
                <input type="hidden" name="purchase_factor" value={String(known)} />
                <span className="text-ink" data-he-so-tu-tinh>
                  {known.toLocaleString("vi-VN", { maximumFractionDigits: 3 })} {unitWord}
                </span>
              </>
            ) : (
              <>
                <Input
                  name="purchase_factor"
                  aria-label={`1 ${donViNhap} bằng bao nhiêu ${unitWord}`}
                  required
                  inputMode="decimal"
                  defaultValue={ingredient?.purchase_unit ? String(factor).replace(".", ",") : ""}
                  placeholder="24"
                  className="w-24"
                />
                <span className="text-ink">{unitWord}</span>
              </>
            )}
          </div>
          <span className={HINT}>Để trống nếu mua đúng theo đơn vị tính.</span>
        </div>
      ) : (
        <label className={LABEL}>
          1 mẻ nấu ra *
          <span className="flex items-center gap-xs">
            <Input
              name="batch_output_qty"
              required
              inputMode="decimal"
              defaultValue={ingredient?.batch_output_qty ? String(ingredient.batch_output_qty).replace(".", ",") : ""}
              placeholder="40.000"
            />
            <span className="shrink-0 text-ink">{unitWord}</span>
          </span>
        </label>
      )}

      {kind === "purchased" && (
        <label className={LABEL}>
          Giá vốn
          <span className="flex items-center gap-xs">
            <MoneyField name="price" defaultValue={price ?? ""} placeholder="280.000" />
            <span className="shrink-0 text-ink">₫ / {donViNhap || unitWord}</span>
          </span>
          <span className={HINT}>Không bắt buộc. Mỗi lần nhập hàng có giá sẽ tự cập nhật.</span>
        </label>
      )}

      {openingAllowed && (
        <label className={LABEL} data-ton-dau>
          Tồn kho ban đầu
          <span className="flex items-center gap-xs">
            <Input name="opening_qty" inputMode="decimal" placeholder="0" />
            <span className="shrink-0 text-ink">{kind === "purchased" && donViNhap ? donViNhap : unitWord}</span>
          </span>
          <span className={HINT}>Hàng đang có sẵn lúc bắt đầu dùng. Chỉ khai một lần; sau đó lệch thì kiểm kê.</span>
        </label>
      )}

      <label className="flex min-h-11 items-center gap-sm text-sm text-slate sm:col-span-2">
        <input type="checkbox" name="must_count" defaultChecked={ingredient?.must_count ?? false} className="h-5 w-5 accent-primary" />
        Kiểm kê cuối ngày <span className="text-steel">(nguyên liệu đắt: thịt, hải sản, nước dùng)</span>
      </label>
    </div>
  );
}
