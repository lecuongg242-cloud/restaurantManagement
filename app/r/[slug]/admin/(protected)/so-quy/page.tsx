import Link from "next/link";
import { getSessionMembership } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { resolveRange, vnToday } from "@/lib/billing/report-range";
import { fundsWithOpening, loadCashbook, loadCategories } from "@/lib/cashbook/data";
import { FUND_LABEL, type Fund } from "@/lib/cashbook/labels";
import { parseSettings } from "@/lib/tenant/settings";
import { bankByBin } from "@/lib/payments/banks";
import { formatVnd } from "@/lib/orders/cart";
import { gioNgayNamVn } from "@/lib/time/vn";
import { RangePicker } from "@/components/admin/reports/RangePicker";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MoneyField } from "@/components/ui/money-input";
import { SubmitButton } from "@/components/ui/submit-button";
import { createOpening } from "./actions";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Sổ quỹ (P20 20-02, CASH-01..04) — như KiotViet "Sổ quỹ": tab Tiền mặt / Ngân hàng / Tổng quỹ; Quỹ đầu kỳ · Tổng thu ·
 * Tổng chi · Tồn quỹ; "+ Phiếu thu", "+ Phiếu chi", "Xuất file". Tiền bán hàng là MỘT dòng mỗi ngày mỗi phương thức
 * (QD-027 C7), bấm vào mở báo cáo ngày đó.
 */
export default async function CashbookPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const session = (await getSessionMembership(slug))!;
  const tenantId = session.tenant.id;
  const quy: Fund | "all" = sp.quy === "bank" || sp.quy === "all" ? sp.quy : "cash";
  const now = new Date();
  const range = resolveRange(sp, now);
  const supabase = await createClient();
  await loadCategories(supabase, tenantId); // lần đầu mở: tạo danh mục loại thu/chi mặc định
  const [{ summary, flows }, opened, { data: t }] = await Promise.all([
    loadCashbook(supabase, tenantId, quy, range.fromUtc, range.toUtc),
    fundsWithOpening(supabase, tenantId),
    supabase.from("tenants").select("settings").eq("id", tenantId).single(),
  ]);
  const bank = parseSettings(t?.settings).bank;
  const bankLabel = bank ? `${bankByBin(bank.bin)?.shortName ?? "Ngân hàng"} ·${bank.account_no.slice(-4)}` : FUND_LABEL.bank;
  const base = `/r/${slug}/admin/so-quy`;
  const keepRange = new URLSearchParams(
    Object.entries({ preset: sp.preset, from: sp.from, to: sp.to, offset: sp.offset }).filter(([, v]) => v) as [string, string][]
  ).toString();
  const withQuy = (q: string) => `${base}?quy=${q}${keepRange ? `&${keepRange}` : ""}`;
  const TABS: { key: Fund | "all"; label: string }[] = [
    { key: "cash", label: FUND_LABEL.cash },
    { key: "bank", label: bankLabel },
    { key: "all", label: "Tổng quỹ" },
  ];

  return (
    <div className="flex flex-col gap-lg">
      <header className="flex flex-wrap items-end justify-between gap-md">
        <div>
          <h1 className="font-semibold text-2xl text-ink">Sổ quỹ</h1>
          <p className="text-sm text-steel">{range.label} · giờ Việt Nam</p>
          <nav aria-label="Sổ quỹ" className="mt-xs flex gap-md text-sm">
            <span className="font-medium text-ink">Sổ quỹ</span>
            <Link href={`${base}/loai`} className="text-primary">
              Loại thu chi
            </Link>
          </nav>
        </div>
        <div className="flex flex-wrap items-center gap-sm">
          <Link
            href={`${base}/moi?loai=thu&quy=${quy === "all" ? "cash" : quy}`}
            className="inline-flex h-9 items-center rounded-md border border-hairline-strong px-md text-sm text-ink hover:bg-surface"
          >
            + Phiếu thu
          </Link>
          <Link
            href={`${base}/moi?loai=chi&quy=${quy === "all" ? "cash" : quy}`}
            className="inline-flex h-9 items-center rounded-md bg-primary px-md text-sm font-medium text-primary-fg hover:bg-primary-deep"
          >
            + Phiếu chi
          </Link>
          <a
            href={`${base}/export?quy=${quy}${keepRange ? `&${keepRange}` : ""}`}
            className="inline-flex h-9 items-center rounded-md border border-hairline-strong px-md text-sm text-ink hover:bg-surface"
          >
            Xuất file
          </a>
          <RangePicker
            base={base}
            preset={range.preset}
            offset={range.offset}
            fromDay={range.fromDay}
            toDay={range.toDay}
            baseFrom={range.input.from ?? range.fromDay}
            baseTo={range.input.to ?? range.toDay}
            canGoNext={range.canGoNext}
            today={vnToday(now)}
            keep={{ quy }}
          />
        </div>
      </header>

      <nav aria-label="Quỹ" className="flex gap-xs">
        {TABS.map((tab) => (
          <Link
            key={tab.key}
            href={withQuy(tab.key)}
            aria-current={quy === tab.key ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 items-center rounded-md px-md text-sm",
              quy === tab.key ? "bg-cream font-medium text-ink" : "text-steel hover:bg-surface"
            )}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      <section className="grid gap-md sm:grid-cols-2 xl:grid-cols-4" data-tong-quy>
        {[
          { nhan: "Quỹ đầu kỳ", so: summary.opening },
          { nhan: "Tổng thu", so: summary.totalIn },
          { nhan: "Tổng chi", so: summary.totalOut },
          { nhan: "Tồn quỹ", so: summary.closing, dam: true },
        ].map((k) => (
          <Card key={k.nhan}>
            <p className="text-sm text-steel">{k.nhan}</p>
            <p className={cn("mt-xxs font-semibold text-2xl tabular-nums", k.dam ? "text-primary" : "text-ink")}>{formatVnd(k.so)}</p>
          </Card>
        ))}
      </section>

      {quy !== "all" && !opened.has(quy) && (
        <Card>
          <h2 className="text-base font-medium text-ink">Nhập số dư đầu kỳ — {quy === "cash" ? "tiền mặt đang có trong két" : "số dư tài khoản"}</h2>
          <p className="mt-xxs text-sm text-steel">Chỉ cần một lần, lúc bắt đầu dùng sổ quỹ. Không có thì để trống.</p>
          <form action={createOpening} className="mt-md flex flex-wrap items-end gap-sm">
            <input type="hidden" name="slug" value={slug} />
            <input type="hidden" name="fund" value={quy} />
            <label className="flex flex-col gap-xxs text-sm text-slate">
              Số tiền
              <MoneyField name="amount" placeholder="0" className="w-44 text-right" />
            </label>
            <label className="flex flex-col gap-xxs text-sm text-slate">
              Tính từ ngày
              <Input type="date" name="day" defaultValue={vnToday(now)} max={vnToday(now)} />
            </label>
            <SubmitButton size="sm" className="h-11" pendingLabel="Đang lưu…">Lưu số dư</SubmitButton>
          </form>
        </Card>
      )}

      <section className="rounded-lg border border-hairline-soft bg-canvas shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[52rem] text-left text-sm" data-so-quy>
            <thead className="border-b border-hairline-soft text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-lg py-sm font-medium">Mã phiếu</th>
                <th className="px-md py-sm font-medium">Thời gian</th>
                <th className="px-md py-sm font-medium">Loại thu chi</th>
                <th className="px-md py-sm font-medium">Người nộp/nhận</th>
                {quy === "all" && <th className="px-md py-sm font-medium">Quỹ</th>}
                <th className="px-md py-sm text-right font-medium">Thu</th>
                <th className="px-lg py-sm text-right font-medium">Chi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline-soft">
              {flows.map((f, i) => {
                const huy = f.status === "cancelled";
                const day = f.occurred_at && f.kind === "sales" ? new Date(Date.parse(f.occurred_at) + 7 * 3600e3).toISOString().slice(0, 10) : "";
                return (
                  <tr key={f.voucher_id ?? `s${i}`} className={cn("hover:bg-surface/60", huy && "text-steel line-through")}>
                    <td className="px-lg py-sm font-mono text-xs">
                      {f.kind === "voucher" ? (
                        <Link href={`${base}/${f.voucher_id}`} className="text-ink underline-offset-4 hover:underline">
                          {f.code}
                        </Link>
                      ) : (
                        <span className="text-steel">—</span>
                      )}
                    </td>
                    <td className="px-md py-sm text-slate">
                      {f.kind === "sales" ? day.split("-").reverse().join("/") : gioNgayNamVn(f.occurred_at)}
                    </td>
                    <td className="px-md py-sm text-ink">
                      {f.kind === "sales" ? (
                        <Link href={`/r/${slug}/admin/reports?preset=custom&from=${day}&to=${day}`} className="underline-offset-4 hover:underline">
                          Thu tiền bán hàng · {f.sales_count} hóa đơn
                        </Link>
                      ) : (
                        f.category ?? "—"
                      )}
                      {huy && <span className="ml-xs text-xs no-underline">(đã hủy)</span>}
                    </td>
                    <td className="px-md py-sm text-slate">{f.counterparty ?? (f.kind === "sales" ? "Khách hàng" : "")}</td>
                    {quy === "all" && <td className="px-md py-sm text-slate">{f.fund === "cash" ? FUND_LABEL.cash : bankLabel}</td>}
                    <td className="px-md py-sm text-right tabular-nums text-ink">{f.direction === "in" ? formatVnd(f.amount) : ""}</td>
                    <td className="px-lg py-sm text-right tabular-nums text-ink">{f.direction === "out" ? formatVnd(f.amount) : ""}</td>
                  </tr>
                );
              })}
              {flows.length === 0 && (
                <tr>
                  <td colSpan={quy === "all" ? 7 : 6} className="px-lg py-lg text-center text-sm text-steel">
                    Không có khoản thu chi nào trong kỳ này.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
