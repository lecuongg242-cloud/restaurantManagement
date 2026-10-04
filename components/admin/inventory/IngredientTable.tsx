"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { IngredientDialog } from "@/components/admin/inventory/IngredientForm";
import { RecipeEditor } from "@/components/admin/inventory/RecipeEditor";
import { BASE_UNIT_LABEL, type BaseUnit, type Ingredient, type IngredientKind } from "@/lib/inventory/types";
import { setIngredientActive } from "@/app/r/[slug]/admin/(protected)/inventory/actions";

export type IngredientRow = {
  ing: Ingredient;
  /** "280.000₫ / kg" hoặc "chưa có giá". */
  price: string;
  priceMissing: boolean;
  /** "6,65 kg (6.652,58 g)"; null = chưa có dòng sổ kho. */
  stock: string | null;
  stockLow: boolean;
  openingAllowed: boolean;
  /** Chỉ bán thành phẩm: công thức 1 mẻ + nguyên liệu thiếu giá. */
  recipe: { lines: { ingredient_id: string; qty: number }[]; missing: string[] } | null;
};

type Option = { id: string; name: string; base_unit: BaseUnit; kind: IngredientKind };

/** Bỏ dấu để gõ "thit bo" vẫn ra "Thịt bò". */
const khongDau = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();

const LOAI: Record<IngredientKind, string> = { purchased: "Mua vào", prepared: "Tự nấu" };

/**
 * Tab "Nguyên liệu" (P29, chủ dự án chốt 04/10/2026): bảng như Sapo / KiotViet / CUKCUK — tìm, lọc Đang dùng / Đã ẩn,
 * "+ Thêm nguyên liệu" mở hộp thoại; bấm dòng mở hộp thoại sửa; bán thành phẩm có nút "Công thức mẻ".
 */
export function IngredientTable({ slug, rows, options }: { slug: string; rows: IngredientRow[]; options: Option[] }) {
  const [q, setQ] = useState("");
  const [loc, setLoc] = useState<"active" | "hidden">("active");
  const [sua, setSua] = useState<{ row: IngredientRow | null } | null>(null);
  const [congThuc, setCongThuc] = useState<IngredientRow | null>(null);

  const dangDung = rows.filter((r) => r.ing.active);
  const daAn = rows.filter((r) => !r.ing.active);
  const shown = useMemo(() => {
    const k = khongDau(q.trim());
    return (loc === "active" ? dangDung : daAn).filter((r) => !k || khongDau(r.ing.name).includes(k));
  }, [q, loc, dangDung, daAn]);

  // Như Sapo "Quy đổi đơn vị": "1 thùng = 24 cái"; không có đơn vị nhập thì chỉ đơn vị tính.
  const donVi = (ing: Ingredient) =>
    ing.purchase_unit && ing.purchase_factor !== 1
      ? `1 ${ing.purchase_unit} = ${ing.purchase_factor.toLocaleString("vi-VN", { maximumFractionDigits: 3 })} ${BASE_UNIT_LABEL[ing.base_unit]}`
      : BASE_UNIT_LABEL[ing.base_unit];
  const dungDuoc = (ing: Ingredient) => (ing.kind === "purchased" && ing.yield_days > 0 ? `${ing.yield_pct}%` : "—");

  const loai = (v: "active" | "hidden", nhan: string, n: number) => (
    <button
      type="button"
      aria-pressed={loc === v}
      onClick={() => setLoc(v)}
      className={cn(
        "inline-flex h-9 items-center rounded-full border px-md text-sm",
        loc === v ? "border-primary bg-cream text-primary-deep" : "border-hairline-strong text-slate hover:bg-surface"
      )}
    >
      {nhan} <span className="ml-xxs tabular-nums">{n}</span>
    </button>
  );

  return (
    <div className="flex flex-col gap-md">
      <div className="flex flex-wrap items-center gap-sm">
        <label className="relative w-full sm:w-72">
          <span className="sr-only">Tìm nguyên liệu</span>
          <Search className="pointer-events-none absolute left-sm top-1/2 h-4 w-4 -translate-y-1/2 text-steel" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm nguyên liệu" className="pl-[2.25rem]" />
        </label>
        <div className="flex gap-xs">
          {loai("active", "Đang dùng", dangDung.length)}
          {loai("hidden", "Đã ẩn", daAn.length)}
        </div>
        <button
          type="button"
          onClick={() => setSua({ row: null })}
          className="ml-auto inline-flex h-11 items-center rounded-md bg-primary px-lg text-sm font-semibold text-primary-fg hover:bg-primary-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          + Thêm nguyên liệu
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-hairline-strong px-md py-xl text-center text-sm text-steel">
          Chưa có nguyên liệu nào. Bấm &quot;+ Thêm nguyên liệu&quot; để khai nguyên liệu đầu tiên.
        </p>
      ) : shown.length === 0 ? (
        <p className="px-md py-xl text-center text-sm text-steel">
          {q ? `Không có nguyên liệu nào khớp "${q}".` : loc === "hidden" ? "Không có nguyên liệu nào đang ẩn." : "Chưa có nguyên liệu nào."}
        </p>
      ) : (
        <>
          {/* Máy tính: bảng. */}
          <div className="hidden overflow-hidden rounded-lg border border-hairline-soft md:block">
            <table className="w-full text-sm" data-bang-nguyen-lieu>
              <thead className="bg-surface text-left text-xs text-steel">
                <tr>
                  <th className="px-md py-sm font-medium">Tên nguyên liệu</th>
                  <th className="px-md py-sm font-medium">Loại</th>
                  <th className="px-md py-sm font-medium">Đơn vị</th>
                  <th className="px-md py-sm text-right font-medium">Giá vốn</th>
                  <th className="px-md py-sm text-right font-medium">Tồn kho</th>
                  <th className="px-md py-sm text-right font-medium">Dùng được</th>
                  <th className="px-md py-sm text-center font-medium">Kiểm cuối ngày</th>
                  <th className="px-md py-sm" />
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline-soft">
                {shown.map((r) => (
                  <tr
                    key={r.ing.id}
                    onClick={() => r.ing.active && setSua({ row: r })}
                    className={cn(r.ing.active && "cursor-pointer hover:bg-cream-soft")}
                  >
                    <td className="px-md py-sm">
                      {r.ing.active ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSua({ row: r });
                          }}
                          className="text-left font-medium text-ink hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          {r.ing.name}
                        </button>
                      ) : (
                        <span className="text-steel">{r.ing.name}</span>
                      )}
                    </td>
                    <td className="px-md py-sm text-slate">{LOAI[r.ing.kind]}</td>
                    <td className="px-md py-sm text-slate">{donVi(r.ing)}</td>
                    <td className={cn("px-md py-sm text-right tabular-nums", r.priceMissing ? "text-status-late" : "text-ink")}>
                      {r.price}
                    </td>
                    <td className={cn("px-md py-sm text-right tabular-nums", r.stockLow ? "text-status-late" : "text-ink")}>
                      {r.stock ?? "—"}
                    </td>
                    <td className="px-md py-sm text-right tabular-nums text-slate">{dungDuoc(r.ing)}</td>
                    <td className="px-md py-sm text-center">
                      {r.ing.must_count && <Check className="mx-auto h-4 w-4 text-status-ready" aria-label="Có" />}
                    </td>
                    <td className="px-md py-sm text-right" onClick={(e) => e.stopPropagation()}>
                      <HanhDong slug={slug} row={r} onCongThuc={() => setCongThuc(r)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Điện thoại: mỗi nguyên liệu một hàng gọn. */}
          <ul className="divide-y divide-hairline-soft rounded-lg border border-hairline-soft md:hidden">
            {shown.map((r) => (
              <li key={r.ing.id} className="flex items-start gap-sm px-md py-sm">
                <button
                  type="button"
                  disabled={!r.ing.active}
                  onClick={() => setSua({ row: r })}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="flex items-baseline justify-between gap-sm">
                    <span className={cn("font-medium", r.ing.active ? "text-ink" : "text-steel")}>{r.ing.name}</span>
                    <span className={cn("text-sm tabular-nums", r.priceMissing ? "text-status-late" : "text-ink")}>{r.price}</span>
                  </span>
                  <span className="mt-xxs block text-xs text-steel">
                    {LOAI[r.ing.kind]} · {donVi(r.ing)} · tồn {r.stock ?? "—"}
                    {r.ing.must_count ? " · kiểm cuối ngày" : ""}
                  </span>
                </button>
                <HanhDong slug={slug} row={r} onCongThuc={() => setCongThuc(r)} />
              </li>
            ))}
          </ul>
        </>
      )}

      <IngredientDialog
        slug={slug}
        open={sua !== null}
        ingredient={sua?.row?.ing ?? null}
        openingAllowed={sua?.row ? sua.row.openingAllowed : true}
        onClose={() => setSua(null)}
      />
      <CongThucDialog slug={slug} row={congThuc} options={options} onClose={() => setCongThuc(null)} />
    </div>
  );
}

/** Cột cuối: "Công thức mẻ" cho bán thành phẩm; "Hiện lại" cho nguyên liệu đã ẩn. */
function HanhDong({ slug, row, onCongThuc }: { slug: string; row: IngredientRow; onCongThuc: () => void }) {
  if (!row.ing.active)
    return (
      <form action={async (fd) => void (await setIngredientActive(fd))}>
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="id" value={row.ing.id} />
        <input type="hidden" name="active" value="true" />
        <button type="submit" className="inline-flex min-h-9 items-center rounded-md px-sm text-sm text-primary hover:bg-surface">
          Hiện lại
        </button>
      </form>
    );
  if (row.recipe)
    return (
      <button
        type="button"
        onClick={onCongThuc}
        className={cn(
          "inline-flex min-h-9 shrink-0 items-center rounded-md border px-sm text-xs font-medium hover:bg-surface",
          row.recipe.lines.length === 0 ? "border-status-late/40 text-status-late" : "border-hairline-strong text-slate"
        )}
      >
        Công thức mẻ{row.recipe.lines.length === 0 ? " (chưa có)" : ""}
      </button>
    );
  return null;
}

function CongThucDialog({
  slug,
  row,
  options,
  onClose,
}: {
  slug: string;
  row: IngredientRow | null;
  options: Option[];
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (row && !d.open) d.showModal();
    else if (!row && d.open) d.close();
  }, [row]);
  const ing = row?.ing;
  return (
    <dialog
      ref={dialog}
      aria-labelledby="cong-thuc-tieu-de"
      onClose={onClose}
      className="m-auto w-[calc(100%-2rem)] max-w-2xl rounded-lg border border-hairline-soft bg-canvas p-0 text-ink shadow-modal backdrop:bg-ink/40"
    >
      {ing && row?.recipe && (
        <div className="flex max-h-[calc(100dvh-2rem)] flex-col">
          <div className="flex items-center justify-between gap-md border-b border-hairline-soft px-lg py-md">
            <h2 id="cong-thuc-tieu-de" className="font-semibold text-xl">
              Công thức 1 mẻ {ing.name}{" "}
              <span className="text-base text-steel">
                ({ing.batch_output_qty?.toLocaleString("vi-VN")} {BASE_UNIT_LABEL[ing.base_unit]})
              </span>
            </h2>
            <button type="button" onClick={onClose} aria-label="Đóng" className="grid h-9 w-9 place-items-center rounded-md text-steel hover:bg-surface">
              ✕
            </button>
          </div>
          <div className="overflow-y-auto px-lg py-md">
            <RecipeEditor
              key={ing.id}
              slug={slug}
              ownerKind="parent"
              ownerId={ing.id}
              lines={row.recipe.lines}
              options={options}
              excludeId={ing.id}
              label={ing.name}
            />
            {row.recipe.missing.length > 0 && (
              <p className="mt-xs text-xs text-status-late">Chưa đủ giá: {row.recipe.missing.join(", ")}</p>
            )}
          </div>
        </div>
      )}
    </dialog>
  );
}
