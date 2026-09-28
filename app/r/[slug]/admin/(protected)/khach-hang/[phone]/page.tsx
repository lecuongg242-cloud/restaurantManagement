import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSessionMembership } from "@/lib/auth/session";
import { canManage, defaultRouteForRole } from "@/lib/auth/rbac";
import { chuoiCuaQuan } from "@/lib/brand/context";
import { createClient } from "@/lib/supabase/server";
import { danhSachKhach, KENH, lichSuKhach } from "@/lib/reports/customers";
import { formatVnd } from "@/lib/orders/cart";
import { gioNgayNamVn } from "@/lib/time/vn";
import { Card, CardTitle } from "@/components/ui/card";
import { NoteForm } from "./NoteForm";

export const dynamic = "force-dynamic";

/** Chi tiết một khách (P16 16-05): tổng quan, lịch sử hóa đơn + đặt bàn (như tab "Lịch sử bán hàng" của KiotViet), ghi chú. */
export default async function KhachChiTiet({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; phone: string }>;
  searchParams: Promise<{ pham?: string }>;
}) {
  const { slug, phone } = await params;
  const { pham } = await searchParams;
  const session = await getSessionMembership(slug);
  if (!session) redirect(`/r/${slug}/admin/login`);
  if (!canManage(session.role, "customers")) redirect(defaultRouteForRole(slug, session.role));
  if (!/^0\d{8,10}$/.test(phone)) notFound();

  const chuoi = await chuoiCuaQuan(session.tenant.id, session.userId);
  const caChuoi = !!chuoi && chuoi.branches.length >= 2 && pham === "chuoi";
  const ids = caChuoi ? chuoi!.branches.map((b) => b.tenantId) : [session.tenant.id];
  const tenCn = new Map((chuoi?.branches ?? []).map((b) => [b.tenantId, b.name]));
  const supabase = await createClient();
  const [{ rows }, lichSu, { data: ghi }] = await Promise.all([
    danhSachKhach(ids, { q: phone, limit: 1 }),
    lichSuKhach(ids, phone),
    supabase.from("customer_notes").select("note").eq("tenant_id", session.tenant.id).eq("phone", phone).maybeSingle(),
  ]);
  const k = rows.find((r) => r.phone === phone);
  if (!k && lichSu.length === 0) notFound();

  const the: [string, string][] = k
    ? [
        ["Số lần đến", String(k.soLan)],
        ["Tổng chi tiêu", formatVnd(k.tongChi)],
        ["TB mỗi lần", k.soLan ? formatVnd(Math.round(k.tongChi / k.soLan)) : "—"],
        ["Lần gần nhất", gioNgayNamVn(k.ganNhat)],
      ]
    : [];

  return (
    <div className="flex flex-col gap-lg">
      <header>
        <Link href={`/r/${slug}/admin/khach-hang${caChuoi ? "?pham=chuoi" : ""}`} className="text-sm text-primary underline-offset-4 hover:underline">
          ← Khách hàng
        </Link>
        <h1 className="mt-xs font-display text-2xl text-ink">{k?.ten ?? "(không tên)"}</h1>
        <p className="font-mono text-sm text-slate">
          <a href={`tel:${phone}`} className="underline-offset-4 hover:underline">
            {phone}
          </a>
        </p>
      </header>

      {the.length > 0 && (
        <div className="grid gap-md sm:grid-cols-4">
          {the.map(([nhan, v]) => (
            <div key={nhan} className="rounded-lg border border-hairline-soft bg-canvas p-md shadow-card">
              <p className="text-xs text-steel">{nhan}</p>
              <p className="mt-xxs text-lg font-medium tabular-nums text-ink">{v}</p>
            </div>
          ))}
        </div>
      )}

      <Card>
        <CardTitle>Ghi chú</CardTitle>
        <div className="mt-md">
          <NoteForm slug={slug} phone={phone} note={(ghi?.note as string | undefined) ?? ""} />
        </div>
      </Card>

      <Card>
        <CardTitle>Lịch sử</CardTitle>
        <ul className="mt-md divide-y divide-hairline-soft text-sm" data-lich-su-khach>
          {lichSu.map((h) => (
            <li key={`${h.loai}-${h.id}`} className="flex flex-wrap items-baseline justify-between gap-xs py-xs">
              <span className="text-slate">
                {gioNgayNamVn(h.luc)}
                {caChuoi && <span className="ml-xs text-xs text-steel">{tenCn.get(h.tenantId)}</span>}
              </span>
              <span className="text-ink">
                {h.loai === "bill" ? (
                  <>
                    Hóa đơn {h.soHd != null ? `#${h.soHd}` : ""} · {h.kenh ? (KENH[h.kenh] ?? h.kenh) : ""}
                    {h.chiTiet ? ` · ${h.chiTiet}` : ""} · <strong>{formatVnd(h.tien ?? 0)}</strong>
                  </>
                ) : (
                  <>Đặt bàn · {h.chiTiet}</>
                )}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
