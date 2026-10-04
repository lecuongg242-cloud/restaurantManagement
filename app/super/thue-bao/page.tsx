import Link from "next/link";
import { redirect } from "next/navigation";
import { isSuperAdmin } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { docGoi } from "@/lib/platform/plans-db";
import { docQuan } from "@/lib/super/tong-hop";
import { daysLeft, ngayVnHienThi } from "@/lib/tenant/subscription";
import { formatVnd } from "@/lib/orders/cart";
import { gioNgayNamVn } from "@/lib/time/vn";
import { PaidUntilForm, RecordRenewalForm } from "../tenant-actions";
import { HanDungChip } from "../HanDungChip";
import { SuperPageHeader } from "@/components/super/SuperShell";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Thuê bao (SUB-01, SUB-04): hạn dùng mọi quán — mặc định quán sắp hết / đã hết lên đầu — ghi nhận gia hạn,
 * sửa hạn tay, và nhật ký gia hạn toàn hệ thống.
 */
export default async function ThueBaoPage({
  searchParams,
}: {
  searchParams: Promise<{ sap?: string }>;
}) {
  if (!(await isSuperAdmin())) redirect("/super/login");
  const { sap } = await searchParams;
  const theoTen = sap === "ten";

  const [{ quan, today }, { data: nhatKy }] = await Promise.all([
    docQuan(),
    createAdminClient()
      .from("subscription_payments")
      .select("id, tenant_id, lifetime, months, amount, paid_until_before, paid_until_after, recorded_at, note")
      .order("recorded_at", { ascending: false })
      .limit(200),
  ]);
  const plans = await docGoi();
  const tenQuan = new Map(quan.map((q) => [q.id, q.name]));

  // Không giới hạn xuống cuối.
  const danhSach = theoTen
    ? [...quan].sort((a, b) => a.name.localeCompare(b.name, "vi"))
    : [...quan].sort((a, b) => (a.paid_until ?? "9999-12-31").localeCompare(b.paid_until ?? "9999-12-31"));

  const gia = plans.map((p) => `${p.name} ${formatVnd(p.price)}`);

  return (
    <div className="flex flex-col gap-lg">
      <SuperPageHeader
        title="Thuê bao"
        description={
          <>
            Hạn dùng và gia hạn của mọi quán. Gói: {gia.length ? gia.join(" · ") : "chưa có gói nào"} (<Link href="/super/cai-dat" className="text-primary underline-offset-4 hover:underline">sửa gói</Link>) ·{" "}
            <Link
              href={theoTen ? "/super/thue-bao" : "/super/thue-bao?sap=ten"}
              className="text-primary underline-offset-4 hover:underline"
            >
              {theoTen ? "Sắp theo hạn dùng" : "Sắp theo tên"}
            </Link>
          </>
        }
      />

      <section className="rounded-lg border border-hairline-soft bg-canvas shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[56rem] text-left text-sm">
            <thead className="border-b border-hairline-soft text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-lg py-sm font-medium">Nhà hàng</th>
                <th className="px-md py-sm font-medium">Hạn dùng</th>
                <th className="px-md py-sm font-medium">Còn lại</th>
                <th className="px-lg py-sm font-medium">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline-soft">
              {danhSach.map((q) => {
                const d = q.paid_until ? daysLeft(q.paid_until, today) : null;
                return (
                  <tr key={q.id} className="align-top">
                    <td className="px-lg py-md">
                      <p className="font-medium text-ink">{q.name}</p>
                      <p className="font-mono text-xs text-steel">{q.slug}</p>
                    </td>
                    <td className="px-md py-md">
                      <p className="text-slate">{q.paid_until ? ngayVnHienThi(q.paid_until) : "Không giới hạn"}</p>
                      <HanDungChip han={q.han} />
                    </td>
                    <td className={cn("px-md py-md tabular-nums", d != null && d < 0 ? "font-medium text-status-late" : "text-slate")}>
                      {d == null ? "—" : d >= 0 ? `${d} ngày` : `quá ${-d} ngày`}
                    </td>
                    <td className="px-lg py-md">
                      <div className="flex flex-wrap items-start gap-xs">
                        <RecordRenewalForm
                          tenantId={q.id}
                          paidUntil={q.paid_until}
                          today={today}
                          plans={plans}
                        />
                        <PaidUntilForm tenantId={q.id} paidUntil={q.paid_until} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-lg border border-hairline-soft bg-canvas shadow-card">
        <h2 className="px-lg pt-lg font-semibold text-xl text-ink">Nhật ký gia hạn</h2>
        {(nhatKy ?? []).length === 0 ? (
          <p className="px-lg pb-lg pt-sm text-sm text-steel">Chưa có lần gia hạn nào.</p>
        ) : (
          <div className="mt-sm overflow-x-auto">
            <table className="w-full min-w-[48rem] text-left text-sm">
              <thead className="border-b border-hairline-soft text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-lg py-sm font-medium">Lúc ghi</th>
                  <th className="px-md py-sm font-medium">Nhà hàng</th>
                  <th className="px-md py-sm font-medium">Gói</th>
                  <th className="px-md py-sm text-right font-medium">Số tiền</th>
                  <th className="px-md py-sm font-medium">Hạn cũ → mới</th>
                  <th className="px-lg py-sm font-medium">Ghi chú</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline-soft">
                {(nhatKy ?? []).map((r) => (
                  <tr key={r.id}>
                    <td className="px-lg py-sm text-slate">{gioNgayNamVn(r.recorded_at)}</td>
                    <td className="px-md py-sm text-ink">{tenQuan.get(r.tenant_id) ?? "—"}</td>
                    <td className="px-md py-sm text-slate">
                      {r.lifetime ? "Vĩnh viễn" : r.months ? `${r.months} tháng` : "Chọn ngày"}
                    </td>
                    <td className="px-md py-sm text-right tabular-nums text-ink">{formatVnd(r.amount)}</td>
                    <td className="px-md py-sm text-slate">
                      {r.paid_until_before ? ngayVnHienThi(r.paid_until_before) : "không giới hạn"} →{" "}
                      {r.paid_until_after ? ngayVnHienThi(r.paid_until_after) : "không giới hạn"}
                    </td>
                    <td className="px-lg py-sm text-steel">{r.note ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
