"use client";

import { useState } from "react";
import { SubmitButton } from "@/components/ui/submit-button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { BASE_UNIT_LABEL, type BaseUnit } from "@/lib/inventory/types";
import { formatVnd } from "@/lib/orders/cart";
import { draftPaysInFull, lineAmount, receiptTotals } from "@/lib/purchasing/receipt";
import { recordReceipts } from "@/app/r/[slug]/admin/(protected)/inventory/actions";

export type ReceiptIngredient = {
  id: string;
  name: string;
  base_unit: BaseUnit;
  purchase_unit: string | null;
};

export type ReceiptSupplierOption = { id: string; code: string; name: string; phone: string | null };

/** Phiếu tạm đang sửa tiếp (P20). */
export type ReceiptDraft = {
  id: string;
  supplier_id: string | null;
  discount: number;
  pay_now: number;
  pay_fund: "cash" | "bank";
  note: string | null;
  /** Thời gian nhập đã chọn ("2026-10-05T14:00" giờ VN); null = lúc bấm Hoàn thành. */
  received_at: string | null;
  lines: { ingredient_id: string; qty: number; unit_price: number | null }[];
};

type Row = { key: number; ingredient_id: string; qty: string; price: string };

const selectCls =
  "h-11 min-w-0 rounded-md border border-hairline-strong bg-canvas px-sm text-base text-ink sm:text-sm focus-visible:border-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary";

/** "0,5" / "0.5" → 0.5; không phải số dương → 0 (chỉ để hiện tổng tạm, server kiểm lại). */
const soLuong = (s: string) => {
  const n = Number(s.trim().replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/**
 * Nhập hàng (INV-04 + P20 PURCH-02). "Lấy hàng lần trước" chép danh sách nguyên liệu của ngày nhập gần nhất — sáng nào quán
 * cũng mua gần như cùng một danh sách, chỉ sửa số (P25: thay cho tab "Nhập hôm nay" điền sẵn). Dòng để trống số lượng =
 * không nhập, bỏ qua. Nhà cung cấp, giá, tiền trả đều không bắt buộc. Mỗi lần "Hoàn thành" là một phiếu nhập.
 */
export function ReceiptForm({
  slug,
  ingredients,
  lastIngredients = [],
  goiY = {},
  suppliers = [],
  draft,
  nowVn,
  minDay,
}: {
  slug: string;
  ingredients: ReceiptIngredient[];
  /** Nguyên liệu của ngày nhập gần nhất — cho nút "Lấy hàng lần trước". Rỗng = không hiện nút. */
  lastIngredients?: string[];
  /** P18 18-02: gợi ý nhập (đơn vị nhập) theo dự báo hôm nay — nguyên liệu id → số. Rỗng = không có gợi ý. */
  goiY?: Record<string, number>;
  suppliers?: ReceiptSupplierOption[];
  draft?: ReceiptDraft;
  /** Giờ máy chủ theo VN ("2026-10-05T20:10") — mặc định khi chọn giờ khác; không tin đồng hồ máy nhân viên. */
  nowVn: string;
  /** Ngày cũ nhất còn mở sổ ("2026-09-29") — phiếu lùi được tới ngày này (P34, sổ tự chốt sau 7 ngày). */
  minDay: string;
}) {
  const [rows, setRows] = useState<Row[]>(() => {
    if (draft) {
      return draft.lines.map((l, i) => ({
        key: i, ingredient_id: l.ingredient_id, qty: String(l.qty), price: l.unit_price === null ? "" : String(l.unit_price),
      }));
    }
    return [{ key: 0, ingredient_id: "", qty: "", price: "" }];
  });
  const [nextKey, setNextKey] = useState(rows.length);
  const [supplierId, setSupplierId] = useState(draft?.supplier_id ?? "");
  const [discount, setDiscount] = useState(draft?.discount ?? 0);
  // Tiền trả mặc định = cần trả (trả đủ) cho tới khi người dùng tự sửa. Phiếu tạm lưu lúc trả đủ thì vẫn chạy theo cần trả.
  const [payTouched, setPayTouched] = useState(!!draft && !draftPaysInFull(draft));
  const [payNow, setPayNow] = useState(draft?.pay_now ?? 0);
  const [fund, setFund] = useState<"cash" | "bank">(draft?.pay_fund ?? "cash");
  // "Chưa trả (ghi nợ)" — như CUKCUK "Ghi nợ nhà cung cấp" / "Thanh toán ngay": nói rõ thay vì bắt xóa số tiền về 0.
  const [debt, setDebt] = useState(!!draft && draft.pay_now === 0);
  const [note, setNote] = useState(draft?.note ?? "");
  // Thời gian nhập (P34, như KiotViet "Ngày/giờ nhập hàng"): mặc định lúc bấm Hoàn thành — phiếu Lưu tạm tối hôm trước,
  // sáng mới Hoàn thành vẫn vào đúng giờ hàng về. Hàng về lúc khác (nhập bù cuối ngày, hôm sau) thì chọn giờ.
  const [atMode, setAtMode] = useState<"now" | "custom">(draft?.received_at ? "custom" : "now");
  const [atDate, setAtDate] = useState((draft?.received_at ?? nowVn).slice(0, 10));
  const [atTime, setAtTime] = useState((draft?.received_at ?? nowVn).slice(11, 16));

  const unitOf = (id: string) => {
    const i = ingredients.find((x) => x.id === id);
    return i ? i.purchase_unit ?? BASE_UNIT_LABEL[i.base_unit] : "";
  };
  const update = (key: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const coGoiY = Object.keys(goiY).length > 0;
  /** Chép gợi ý vào ô số lượng; nguyên liệu được gợi ý mà chưa có dòng thì thêm dòng. Không đụng ô giá. */
  const dienTheoGoiY = () => {
    const co = new Set(rows.map((r) => r.ingredient_id));
    const them = Object.keys(goiY)
      .filter((id) => !co.has(id))
      .map((id, i) => ({ key: nextKey + i, ingredient_id: id, qty: "", price: "" }));
    setNextKey(nextKey + them.length);
    setRows([...rows, ...them].map((r) => (goiY[r.ingredient_id] ? { ...r, qty: String(goiY[r.ingredient_id]) } : r)));
  };

  /** Thêm dòng cho nguyên liệu lần trước chưa có trên phiếu; dòng trống chưa chọn gì thì bỏ đi. Không đụng dòng đã điền. */
  const layHangLanTruoc = () => {
    const co = new Set(rows.map((r) => r.ingredient_id));
    const them = lastIngredients
      .filter((id) => !co.has(id))
      .map((id, i) => ({ key: nextKey + i, ingredient_id: id, qty: "", price: "" }));
    setNextKey(nextKey + them.length);
    setRows([...rows.filter((r) => r.ingredient_id || r.qty || r.price), ...them]);
  };

  const filled = rows.filter((r) => r.ingredient_id && soLuong(r.qty) > 0);
  const { subtotal } = receiptTotals(
    filled.map((r) => ({ qty: soLuong(r.qty), unit_price: r.price ? Number(r.price) : null })),
    0
  );
  const disc = Math.min(discount, subtotal);
  const total = subtotal - disc;
  const pay = debt ? 0 : payTouched ? Math.min(payNow, total) : total;
  const conNo = total - pay;

  return (
    // Hai cột như KiotViet "Nhập hàng" (chủ dự án chọn 05/10/2026): trái là hàng nhập, phải là khung "Thông tin phiếu" (NCC,
    // thời gian nhập, tiền, ghi chú, nút) dính khi cuộn. Dưới xl xếp dọc; nút dính đáy màn (cột phải `contents` để nút là
    // con trực tiếp của form — sticky theo cả form chứ không chỉ theo khung).
    <form action={recordReceipts} className="flex flex-col gap-md xl:grid xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start xl:gap-lg">
      <input type="hidden" name="slug" value={slug} />
      <input
        type="hidden"
        name="payload"
        value={JSON.stringify({
          id: draft?.id ?? null,
          supplier_id: supplierId || null,
          discount: disc,
          pay_now: pay,
          pay_fund: fund,
          note,
          received_at: atMode === "custom" ? `${atDate}T${atTime}` : null,
          rows: rows.map(({ ingredient_id, qty, price }) => ({ ingredient_id, qty, price })),
        })}
      />

      <div className="flex min-w-0 flex-col gap-sm" data-hang-nhap>
        <h3 className="text-sm font-medium text-ink">Hàng nhập</h3>
        {rows.map((r) => {
          const amount = r.price && soLuong(r.qty) > 0 ? lineAmount(soLuong(r.qty), Number(r.price)) : null;
          return (
            <div key={r.key} className="grid grid-cols-[1fr_auto] gap-xs sm:grid-cols-[minmax(0,1fr)_7.5rem_8rem_6.5rem_auto]">
              <select
                aria-label="Nguyên liệu"
                value={r.ingredient_id}
                onChange={(e) => update(r.key, { ingredient_id: e.target.value })}
                className={`col-span-2 sm:col-span-1 ${selectCls}`}
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
                  // Gợi ý theo dự báo hôm nay (P18) nằm ngay trong ô trống — không thêm cột làm chật dòng trên điện thoại.
                  placeholder={goiY[r.ingredient_id] ? `gợi ý ${goiY[r.ingredient_id]}` : "0"}
                  title={goiY[r.ingredient_id] ? `Gợi ý theo dự báo hôm nay: ${goiY[r.ingredient_id]}` : undefined}
                  className="w-16 text-right tabular-nums"
                />
                <span className="w-12 shrink-0 truncate text-sm text-steel">{unitOf(r.ingredient_id)}</span>
              </div>
              <MoneyInput
                aria-label="Đơn giá (không bắt buộc)"
                value={Number(r.price) || 0}
                onChange={(v) => update(r.key, { price: v ? String(v) : "" })}
                placeholder={`Giá / ${unitOf(r.ingredient_id) || "đv"}`}
              />
              <span className="hidden items-center justify-end text-sm tabular-nums text-slate sm:flex" aria-label="Thành tiền">
                {amount !== null ? formatVnd(amount) : ""}
              </span>
              <button
                type="button"
                aria-label="Bỏ dòng"
                onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                className="grid h-11 w-9 place-items-center rounded-md text-steel hover:bg-surface"
              >
                ✕
              </button>
            </div>
          );
        })}

        <div className="flex flex-wrap items-center gap-sm">
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
          {!draft && lastIngredients.length > 0 && (
            <button
              type="button"
              onClick={layHangLanTruoc}
              className="inline-flex min-h-11 items-center rounded-md border border-hairline-strong px-md text-sm text-ink hover:bg-surface"
            >
              Lấy hàng lần trước
            </button>
          )}
          {coGoiY && (
            <button
              type="button"
              onClick={dienTheoGoiY}
              className="inline-flex min-h-11 items-center rounded-md border border-hairline-strong px-md text-sm text-ink hover:bg-surface"
            >
              Điền theo gợi ý
            </button>
          )}
        </div>
      </div>

      <div className="contents xl:sticky xl:top-md xl:flex xl:flex-col xl:gap-md">
        <div className="flex flex-col gap-md rounded-lg border border-hairline-soft bg-surface/40 p-md" data-thong-tin-phieu>
          <h3 className="text-sm font-medium text-ink">Thông tin phiếu</h3>
          {suppliers.length > 0 && (
            <label className="flex flex-col gap-xxs text-sm text-slate">
              Nhà cung cấp (không bắt buộc)
              <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={selectCls} aria-label="Nhà cung cấp">
                <option value="">— Không chọn (mua lẻ, trả đủ) —</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.phone ? ` · ${s.phone}` : ""}
                  </option>
                ))}
              </select>
            </label>
          )}

          <fieldset className="flex flex-col gap-xxs text-sm text-slate" data-thoi-gian-nhap>
            <legend className="mb-xxs">Thời gian nhập</legend>
            <div className="flex flex-col gap-xxs sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-md">
              <label className="inline-flex min-h-9 items-center gap-xxs">
                <input type="radio" name="at_mode_ui" checked={atMode === "now"} onChange={() => setAtMode("now")} />
                Lúc bấm Hoàn thành
              </label>
              <label className="inline-flex min-h-9 items-center gap-xxs">
                <input type="radio" name="at_mode_ui" checked={atMode === "custom"} onChange={() => setAtMode("custom")} />
                Chọn giờ khác
              </label>
            </div>
            {atMode === "custom" && (
              <div className="flex flex-wrap items-center gap-xs">
                <Input
                  type="date"
                  aria-label="Ngày nhập"
                  value={atDate}
                  min={minDay}
                  max={nowVn.slice(0, 10)}
                  onChange={(e) => setAtDate(e.target.value)}
                  className="w-36"
                />
                <Input type="time" aria-label="Giờ nhập" value={atTime} onChange={(e) => setAtTime(e.target.value)} className="w-32" />
              </div>
            )}
            <span className="text-xs text-steel">
              Giờ hàng về quán. Lùi được tới {minDay.split("-").reverse().join("/")} (ngày cũ nhất chưa chốt sổ).
            </span>
          </fieldset>

          {/* Phần tiền — chữ theo KiotViet: Tổng tiền hàng · Giảm giá · Cần trả NCC · Tiền trả NCC · Tính vào công nợ. */}
          <div className="grid gap-xs border-t border-hairline-soft pt-md text-sm" data-tien-phieu-nhap>
            <div className="flex items-center justify-between">
              <span className="text-slate">Tổng tiền hàng</span>
              <span className="tabular-nums text-ink">{formatVnd(subtotal)}</span>
            </div>
            <label className="flex items-center justify-between gap-sm">
              <span className="text-slate">Giảm giá</span>
              <MoneyInput aria-label="Giảm giá" value={disc} onChange={setDiscount} placeholder="0" className="h-9 w-36 text-right" />
            </label>
            <div className="flex items-center justify-between font-medium">
              <span className="text-ink">Cần trả NCC</span>
              <span className="tabular-nums text-ink">{formatVnd(total)}</span>
            </div>
            <label className="flex items-center justify-between gap-sm">
              <span className="text-slate">Tiền trả NCC</span>
              <MoneyInput
                aria-label="Tiền trả NCC"
                value={pay}
                disabled={debt}
                onChange={(v) => {
                  setPayTouched(true);
                  setPayNow(v);
                }}
                placeholder="0"
                className="h-9 w-36 text-right disabled:bg-surface disabled:text-steel"
              />
            </label>
            {total > 0 && (
              <div className="flex flex-wrap items-center justify-end gap-x-md" role="radiogroup" aria-label="Thanh toán">
                {(["cash", "bank", "debt"] as const).map((f) => (
                  <label key={f} className="inline-flex min-h-9 items-center gap-xxs text-slate">
                    <input
                      type="radio"
                      name="fund_ui"
                      checked={f === "debt" ? debt : !debt && fund === f}
                      onChange={() => {
                        if (f === "debt") return setDebt(true);
                        setDebt(false);
                        setFund(f);
                      }}
                    />
                    {f === "cash" ? "Tiền mặt" : f === "bank" ? "Chuyển khoản" : "Chưa trả (ghi nợ)"}
                  </label>
                ))}
              </div>
            )}
            {conNo > 0 && (
              <p className={supplierId ? "text-right text-slate" : "text-right text-status-late"}>
                {supplierId
                  ? `Tính vào công nợ: ${formatVnd(conNo)}`
                  : debt
                    ? "Chọn nhà cung cấp ở trên để ghi nợ."
                    : `Còn thiếu ${formatVnd(conNo)} — chọn nhà cung cấp để ghi nợ, hoặc trả đủ.`}
              </p>
            )}
            <Input
              aria-label="Ghi chú"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              placeholder="Ghi chú (không bắt buộc)"
              className="h-9"
            />
          </div>
        </div>

        <div className="sticky bottom-0 z-10 -mx-md flex flex-wrap items-center justify-end gap-sm border-t border-hairline-soft bg-canvas px-md py-sm xl:static xl:mx-0 xl:border-0 xl:bg-transparent xl:p-0">
          <SubmitButton name="intent" value="draft" variant="secondary" size="sm" className="h-11 sm:h-9" pendingLabel="Đang lưu…">
            Lưu tạm
          </SubmitButton>
          <SubmitButton name="intent" value="complete" size="sm" className="h-11 sm:h-9" pendingLabel="Đang ghi…">
            Hoàn thành
          </SubmitButton>
        </div>
      </div>
    </form>
  );
}
