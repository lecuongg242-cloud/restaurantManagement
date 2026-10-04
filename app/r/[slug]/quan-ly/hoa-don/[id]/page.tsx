import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getSessionMembership } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { buildReceiptView } from "@/lib/billing/receipt-view";
import { formatVnd } from "@/lib/orders/cart";
import { TEN_PHUONG_THUC } from "@/lib/reports/hoa-don";
import { ngayGioVn } from "@/lib/quan-ly/dinh-dang";
import { Khoi } from "@/components/quan-ly/Khoi";

export const dynamic = "force-dynamic";

/**
 * Chi tiết một hóa đơn (P30, Giao diện B6) — CHỈ XEM. Nội dung món / giảm giá / phụ thu / VAT dựng bằng `buildReceiptView`
 * (cùng tờ hóa đơn in cho khách, đọc qua RLS) ⇒ không tự tính lại tiền. Thêm giờ vào, mọi lần thanh toán, người thu.
 */
export default async function ChiTietHoaDonPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<{ ky?: string }>;
}) {
  const { slug, id } = await params;
  const { ky } = await searchParams;
  const session = await getSessionMembership(slug);
  if (!session) redirect("/quan-ly");
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const tenantId = session.tenant.id;

  const hd = await buildReceiptView(id, tenantId);
  if (!hd) notFound();

  const client = await createClient();
  const [{ data: bill }, { data: tra }] = await Promise.all([
    client.from("bills").select("table_session_id, created_at, closed_by, area_label").eq("id", id).eq("tenant_id", tenantId).maybeSingle(),
    client.from("payments").select("method, amount, received_at").eq("bill_id", id).eq("tenant_id", tenantId).order("received_at"),
  ]);
  const [{ data: phien }, { data: nguoi }] = await Promise.all([
    bill?.table_session_id
      ? client.from("table_sessions").select("opened_at").eq("id", bill.table_session_id).eq("tenant_id", tenantId).maybeSingle()
      : Promise.resolve({ data: null }),
    bill?.closed_by
      ? client.from("memberships").select("display_name").eq("tenant_id", tenantId).eq("user_id", bill.closed_by).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const gioVao = (phien?.opened_at as string | undefined) ?? (bill?.created_at as string | undefined) ?? null;

  return (
    <div className="flex flex-col gap-md">
      <Link href={`/r/${slug}/quan-ly/hoa-don${ky ? `?ky=${ky}` : ""}`} className="-ml-xs inline-flex min-h-11 items-center gap-xxs text-sm text-primary-deep">
        <ChevronLeft className="size-4" aria-hidden /> Hóa đơn
      </Link>
      <div>
        <h1 className="font-display text-xl text-ink">
          Hóa đơn #{hd.billNo ?? "—"} · {hd.tableLabel}
        </h1>
        {bill?.area_label && <p className="text-sm text-steel">{bill.area_label as string}</p>}
        {hd.contactLine && <p className="text-sm text-steel">{hd.contactLine}</p>}
      </div>

      <Khoi tieuDe="Món">
        {hd.isChild && hd.childNote ? (
          <p className="text-sm text-steel">{hd.childNote}</p>
        ) : (
          <ul className="divide-y divide-hairline-soft">
            {hd.lines.map((l, i) => (
              <li key={i} className="flex items-start gap-sm py-xs text-sm">
                <span className="w-8 shrink-0 tabular-nums text-steel">{l.qty}×</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-ink">{l.name}</span>
                  {l.modifiers.length > 0 && <span className="block text-xs text-steel">{l.modifiers.join(", ")}</span>}
                  {l.note && <span className="block text-xs text-steel">Ghi chú: {l.note}</span>}
                </span>
                <span className="shrink-0 tabular-nums text-ink">{formatVnd(l.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </Khoi>

      <Khoi>
        <dl className="flex flex-col gap-xxs text-sm">
          <Dong nhan="Tạm tính" gt={formatVnd(hd.subtotal)} />
          {hd.discountAmount > 0 && <Dong nhan="Giảm giá" gt={`−${formatVnd(hd.discountAmount)}`} />}
          {hd.serviceChargeAmount > 0 && <Dong nhan={`Phụ thu ${hd.serviceChargePct}%`} gt={formatVnd(hd.serviceChargeAmount)} />}
          {hd.vatAmount > 0 && <Dong nhan={`VAT ${hd.vatPct}%`} gt={formatVnd(hd.vatAmount)} />}
          <div className="mt-xxs flex justify-between border-t border-hairline-soft pt-xs text-base font-semibold text-ink">
            <dt>Tổng</dt>
            <dd className="tabular-nums">{formatVnd(hd.total)}</dd>
          </div>
        </dl>
      </Khoi>

      <Khoi tieuDe="Thanh toán">
        <dl className="flex flex-col gap-xxs text-sm">
          {(tra ?? []).map((p, i) => (
            <Dong key={i} nhan={`${TEN_PHUONG_THUC[p.method as string] ?? p.method} · ${ngayGioVn(p.received_at as string)}`} gt={formatVnd(Number(p.amount))} />
          ))}
          {!tra?.length && <p className="text-steel">Chưa ghi thanh toán.</p>}
          <Dong nhan="Giờ vào" gt={ngayGioVn(gioVao)} />
          <Dong nhan="Giờ thanh toán" gt={ngayGioVn(hd.dateTime)} />
          <Dong nhan="Người thu" gt={(nguoi?.display_name as string | undefined) ?? "—"} />
        </dl>
      </Khoi>
    </div>
  );
}

function Dong({ nhan, gt }: { nhan: string; gt: string }) {
  return (
    <div className="flex justify-between gap-md">
      <dt className="text-steel">{nhan}</dt>
      <dd className="tabular-nums text-ink">{gt}</dd>
    </div>
  );
}
