"use client";

import { useState } from "react";
import { SubmitButton } from "@/components/ui/submit-button";
import { Input } from "@/components/ui/input";
import { formatVnd } from "@/lib/orders/cart";
import { parseQty } from "@/lib/inventory/units";
import { countDiff, countSummary, isBigDiff } from "@/lib/inventory/count";
import { recordCounts } from "@/app/r/[slug]/admin/(protected)/inventory/actions";

/** Một nguyên liệu cần kiểm. `theoretical` và `unitPrice` theo ĐƠN VỊ NHẬP (kg, đ/kg); giá null = chưa có giá. */
export type CountRow = { id: string; name: string; unit: string; theoretical: number; unitPrice: number | null };

const fmt = (n: number) => n.toLocaleString("vi-VN", { maximumFractionDigits: 3 });
const signed = (n: number) => (n > 0 ? `+${fmt(n)}` : fmt(n));
const signedVnd = (n: number) => (n > 0 ? `+${formatVnd(n)}` : n < 0 ? `−${formatVnd(-n)}` : formatVnd(0));
/** "0" là đếm hết hàng — hợp lệ; còn lại như ô số lượng khác. Trống / sai = chưa đếm. */
const readCount = (raw: string) => (raw.trim() === "0" ? 0 : parseQty(raw));

/**
 * Kiểm kê (INV-08, P25 INV-11) — cột theo KiotViet "Kiểm kho": Tồn kho · Thực tế · SL lệch · Giá trị lệch, cuối phiếu có
 * Tổng lệch tăng / giảm / chênh lệch. Số đếm luôn được ghi (đếm là số thật), nhưng lệch quá 50% tồn sổ thì dòng bôi vàng
 * và bấm "Hoàn thành" phải xác nhận lại — chặn gõ nhầm 82 thay vì 8,2. Ô để trống = không đếm nguyên liệu đó.
 */
export function CountForm({ slug, rows }: { slug: string; rows: CountRow[] }) {
  const [counted, setCounted] = useState<Record<string, string>>({});

  const lines = rows.flatMap((r) => {
    const c = readCount(counted[r.id] ?? "");
    if (c === null) return [];
    const diff = countDiff(r.theoretical, c);
    return [{ row: r, counted: c, diff, big: isBigDiff(r.theoretical, c), value: r.unitPrice === null ? null : Math.round(diff * r.unitPrice) }];
  });
  const byId = new Map(lines.map((l) => [l.row.id, l]));
  const sum = countSummary(lines.map((l) => ({ theoretical: l.row.theoretical, counted: l.counted, unitPrice: l.row.unitPrice })));
  const big = lines.filter((l) => l.big);

  const confirmBig = (e: React.FormEvent<HTMLFormElement>) => {
    if (big.length === 0) return;
    const list = big
      .map((l) => `• ${l.row.name}: tồn kho ${fmt(l.row.theoretical)} ${l.row.unit}, thực tế ${fmt(l.counted)} ${l.row.unit} (lệch ${signed(l.diff)} ${l.row.unit})`)
      .join("\n");
    if (!confirm(`Lệch lớn — kiểm tra lại số đếm:\n${list}\n\nVẫn hoàn thành kiểm kê?`)) e.preventDefault();
  };

  return (
    <form action={recordCounts} onSubmit={confirmBig} className="flex flex-col gap-sm">
      <input type="hidden" name="slug" value={slug} />
      <input
        type="hidden"
        name="rows"
        value={JSON.stringify(rows.map((r) => ({ ingredient_id: r.id, counted: counted[r.id] ?? "" })))}
      />
      <div className="rounded-lg border border-hairline-soft">
        <div className="hidden grid-cols-[1fr_8rem_10rem_7rem_8rem] gap-sm border-b border-hairline-soft px-md py-xs text-xs font-medium text-steel sm:grid">
          <span>Nguyên liệu</span>
          <span className="text-right">Tồn kho</span>
          <span className="text-right">Thực tế</span>
          <span className="text-right">SL lệch</span>
          <span className="text-right">Giá trị lệch</span>
        </div>
        <ul className="divide-y divide-hairline-soft">
          {rows.map((r) => {
            const l = byId.get(r.id);
            const tone = !l || l.diff === 0 ? "text-slate" : l.diff > 0 ? "text-status-ready" : "text-status-late";
            return (
              <li
                key={r.id}
                data-lech-lon={l?.big ? "" : undefined}
                className={`grid grid-cols-[1fr_auto] items-center gap-x-sm gap-y-xxs px-md py-sm sm:grid-cols-[1fr_8rem_10rem_7rem_8rem] ${l?.big ? "bg-status-new/40" : ""}`}
              >
                <span className="min-w-0 text-sm text-ink">
                  {r.name}
                  {l?.big && (
                    <span className="ml-xs whitespace-nowrap rounded bg-status-new px-xs text-xs text-status-new-fg">Lệch lớn</span>
                  )}
                  <span className="block text-xs text-steel sm:hidden">
                    Tồn kho: {fmt(r.theoretical)} {r.unit}
                  </span>
                </span>
                <span className="hidden text-right text-sm tabular-nums text-slate sm:block">
                  {fmt(r.theoretical)} {r.unit}
                </span>
                <span className="flex items-center justify-end gap-xs">
                  <Input
                    aria-label={`Thực tế ${r.name} (${r.unit})`}
                    inputMode="decimal"
                    value={counted[r.id] ?? ""}
                    onChange={(e) => setCounted((c) => ({ ...c, [r.id]: e.target.value }))}
                    placeholder="Thực tế"
                    className="w-24 text-right tabular-nums"
                  />
                  <span className="w-10 text-sm text-steel">{r.unit}</span>
                </span>
                <span className={`col-span-2 text-right text-xs tabular-nums sm:col-span-1 sm:text-sm ${tone}`} aria-label={`SL lệch ${r.name}`}>
                  {l ? (
                    <>
                      <span className="sm:hidden">Lệch </span>
                      {signed(l.diff)} {r.unit}
                      {l.value !== null && <span className="sm:hidden"> · {signedVnd(l.value)}</span>}
                    </>
                  ) : (
                    <span className="hidden sm:inline">—</span>
                  )}
                </span>
                <span className={`hidden text-right text-sm tabular-nums sm:block ${tone}`}>
                  {l ? (l.value === null ? "chưa có giá" : signedVnd(l.value)) : "—"}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {lines.length > 0 && (
        <div className="grid gap-xxs text-sm sm:ml-auto sm:w-full sm:max-w-sm" data-tong-kiem-ke>
          <div className="flex justify-between">
            <span className="text-slate">Tổng lệch tăng ({sum.up.count})</span>
            <span className={`tabular-nums ${sum.up.value ? "text-status-ready" : "text-slate"}`}>{signedVnd(sum.up.value)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate">Tổng lệch giảm ({sum.down.count})</span>
            <span className={`tabular-nums ${sum.down.value ? "text-status-late" : "text-slate"}`}>{signedVnd(sum.down.value)}</span>
          </div>
          <div className="flex justify-between font-medium">
            <span className="text-ink">Tổng chênh lệch</span>
            <span className="tabular-nums text-ink">{signedVnd(sum.up.value + sum.down.value)}</span>
          </div>
          {sum.unpriced > 0 && (
            <p className="text-xs text-steel">{sum.unpriced} nguyên liệu lệch chưa có giá — không tính vào tiền.</p>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-end gap-sm">
        {big.length > 0 && <span className="text-sm text-status-new-fg">{big.length} dòng lệch lớn — kiểm tra lại số đếm.</span>}
        <SubmitButton size="sm" className="h-11 sm:h-9" pendingLabel="Đang ghi…">
          Hoàn thành
        </SubmitButton>
      </div>
    </form>
  );
}
