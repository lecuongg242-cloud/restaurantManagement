"use client";

import { useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { MoneyField } from "@/components/ui/money-input";
import { SubmitButton } from "@/components/ui/submit-button";
import { COUNTERPARTY_LABEL, SOURCE_DOC_LABEL, type Fund } from "@/lib/cashbook/labels";
import { createVoucher } from "@/app/r/[slug]/admin/(protected)/so-quy/actions";

type Cat = { id: string; name: string; default_in_pnl: boolean };

const label = "flex min-w-0 flex-col gap-xxs text-sm text-slate";
const select = "h-11 min-w-0 rounded-md border border-hairline-strong bg-canvas px-sm text-sm text-ink";

/**
 * Phiếu thu / phiếu chi (CASH-02) — trường như KiotViet "Sổ quỹ": Thời gian, Loại thu/chi, Nhóm người nộp/nhận + Tên,
 * Giá trị, Quỹ, Ghi chú, "Hạch toán vào kết quả kinh doanh" (mặc định theo loại). Chứng từ gốc gập lại, không bắt buộc.
 */
export function VoucherForm({
  slug,
  direction,
  fund,
  now,
  categories,
  suppliers,
  bankLabel,
}: {
  slug: string;
  direction: "in" | "out";
  fund: Fund;
  now: string;
  categories: Cat[];
  suppliers: { id: string; name: string }[];
  bankLabel: string;
}) {
  const [catId, setCatId] = useState("");
  const [inPnl, setInPnl] = useState(true);
  const [cp, setCp] = useState<"" | keyof typeof COUNTERPARTY_LABEL>("");
  const chi = direction === "out";

  return (
    <form action={createVoucher} className="flex flex-col gap-md">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="direction" value={direction} />
      <div className="grid gap-md sm:grid-cols-2 xl:grid-cols-3">
        <label className={label}>
          Loại {chi ? "chi" : "thu"} *
          <select
            name="category_id"
            required
            value={catId}
            onChange={(e) => {
              setCatId(e.target.value);
              const c = categories.find((x) => x.id === e.target.value);
              if (c) setInPnl(c.default_in_pnl);
            }}
            className={select}
          >
            <option value="">— Chọn —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <Link href={`/r/${slug}/admin/so-quy/loai`} className="text-xs text-primary">
            Thêm / sửa loại {chi ? "chi" : "thu"}
          </Link>
        </label>
        <label className={label}>
          Giá trị *
          <MoneyField name="amount" required placeholder="0" className="text-right" />
        </label>
        <label className={label}>
          Thời gian
          <Input type="datetime-local" name="occurred_at" defaultValue={now} max={now} />
        </label>
        <fieldset className={label}>
          <legend className="mb-xxs">Quỹ</legend>
          <div className="flex min-h-11 items-center gap-md">
            {(["cash", "bank"] as const).map((f) => (
              <label key={f} className="inline-flex items-center gap-xxs">
                <input type="radio" name="fund" value={f} defaultChecked={fund === f} />
                {f === "cash" ? "Tiền mặt" : bankLabel}
              </label>
            ))}
          </div>
        </fieldset>
        <label className={label}>
          Nhóm người {chi ? "nhận" : "nộp"}
          <select name="counterparty_kind" value={cp} onChange={(e) => setCp(e.target.value as typeof cp)} className={select}>
            <option value="">— Không ghi —</option>
            {(Object.keys(COUNTERPARTY_LABEL) as (keyof typeof COUNTERPARTY_LABEL)[])
              .filter((k) => chi || k !== "supplier")
              .map((k) => (
                <option key={k} value={k}>
                  {COUNTERPARTY_LABEL[k]}
                </option>
              ))}
          </select>
        </label>
        {cp === "supplier" ? (
          <label className={label}>
            Nhà cung cấp *
            <select name="supplier_id" required className={select} defaultValue="">
              <option value="">— Chọn —</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <span className="text-xs text-steel">Phiếu chi cho nhà cung cấp được trừ vào nợ cần trả của họ.</span>
          </label>
        ) : (
          cp && (
            <label className={label}>
              Tên người {chi ? "nhận" : "nộp"}
              <Input name="counterparty_name" maxLength={120} />
            </label>
          )
        )}
        <label className={`${label} sm:col-span-2 xl:col-span-3`}>
          Ghi chú
          <Input name="note" maxLength={500} placeholder={chi ? "Tiền điện tháng 9" : ""} />
        </label>
      </div>

      <label className="inline-flex items-center gap-xs text-sm text-ink">
        <input type="checkbox" name="in_pnl" checked={inPnl} onChange={(e) => setInPnl(e.target.checked)} />
        Hạch toán vào kết quả kinh doanh
        <span className="text-xs text-steel">({chi ? "tính là chi phí" : "tính là thu nhập khác"})</span>
      </label>

      <details className="rounded-md border border-hairline-soft p-md text-sm">
        <summary className="cursor-pointer text-slate">Chứng từ gốc (không bắt buộc)</summary>
        <div className="mt-md grid gap-md sm:grid-cols-3">
          <label className={label}>
            Loại chứng từ
            <select name="source_doc_kind" defaultValue="" className={select}>
              <option value="">— Không ghi —</option>
              {(Object.keys(SOURCE_DOC_LABEL) as (keyof typeof SOURCE_DOC_LABEL)[]).map((k) => (
                <option key={k} value={k}>
                  {SOURCE_DOC_LABEL[k]}
                </option>
              ))}
            </select>
          </label>
          <label className={label}>
            Số hóa đơn / chứng từ
            <Input name="source_doc_no" maxLength={40} />
          </label>
          <label className={label}>
            Ngày chứng từ
            <Input type="date" name="source_doc_date" />
          </label>
        </div>
      </details>

      <div>
        <SubmitButton pendingLabel="Đang lưu…">{chi ? "Lưu phiếu chi" : "Lưu phiếu thu"}</SubmitButton>
      </div>
    </form>
  );
}
