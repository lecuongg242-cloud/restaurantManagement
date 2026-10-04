import Link from "next/link";
import { redirect } from "next/navigation";
import { isSuperAdmin } from "@/lib/auth/session";
import { listLeads } from "@/lib/marketing/leads";
import { canThuTien, docQuan } from "@/lib/super/tong-hop";
import { daysLeft, ngayVnHienThi } from "@/lib/tenant/subscription";
import { docCauIn } from "./BridgeTable";
import { SuperPageHeader } from "@/components/super/SuperShell";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** Tổng quan super-admin: con số chính + những quán cần làm gì đó hôm nay. */
export default async function SuperHome() {
  if (!(await isSuperAdmin())) redirect("/super/login");

  const [{ quan, today }, leads] = await Promise.all([docQuan(), listLeads()]);
  const { danhSach } = await docCauIn(quan);

  const hoatDong = quan.filter((q) => q.status === "active" && q.han !== "locked").length;
  const tamNgung = quan.filter((q) => q.status === "suspended").length;
  const thuTien = quan.filter(canThuTien).sort((a, b) => (a.paid_until ?? "").localeCompare(b.paid_until ?? ""));
  const cauInLoi = danhSach.filter((d) => d.hang.canChuY && !d.t.khoa);
  const leadMoi = leads.filter((l) => l.status === "new");

  const the = [
    { nhan: "Nhà hàng", so: quan.length, phu: `${hoatDong} đang hoạt động`, href: "/super/nha-hang", canh: false },
    { nhan: "Cần thu tiền", so: thuTien.length, phu: "sắp hết · ân hạn · đã khóa", href: "/super/thue-bao", canh: thuTien.length > 0 },
    { nhan: "Cầu in cần chú ý", so: cauInLoi.length, phu: "mất kết nối · máy in lỗi · bản cũ", href: "/super/cau-in", canh: cauInLoi.length > 0 },
    { nhan: "Khách quan tâm mới", so: leadMoi.length, phu: `${leads.length} liên hệ`, href: "/super/leads", canh: leadMoi.length > 0 },
    { nhan: "Tạm ngưng", so: tamNgung, phu: "khóa tay", href: "/super/nha-hang", canh: false },
  ];

  return (
    <div className="flex flex-col gap-lg">
      <SuperPageHeader
        title="Tổng quan"
        description="Tình hình mọi nhà hàng trên hệ thống."
        actions={
          <Button asChild>
            <Link href="/super/new">+ Nhà hàng mới</Link>
          </Button>
        }
      />

      <div className="grid gap-md sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {the.map((t) => (
          <Link
            key={t.nhan}
            href={t.href}
            className="rounded-lg border border-hairline-soft bg-canvas p-lg shadow-card transition-colors hover:bg-surface/60"
          >
            <p className="text-sm text-steel">{t.nhan}</p>
            <p className={cn("mt-xxs font-semibold text-3xl tabular-nums", t.canh ? "text-status-late" : "text-ink")}>
              {t.so}
            </p>
            <p className="mt-xxs text-xs text-steel">{t.phu}</p>
          </Link>
        ))}
      </div>

      <div className="grid gap-lg xl:grid-cols-2">
        <section className="rounded-lg border border-hairline-soft bg-canvas p-lg shadow-card">
          <div className="flex items-baseline justify-between gap-sm">
            <h2 className="font-semibold text-xl text-ink">Cần thu tiền</h2>
            <Link href="/super/thue-bao" className="text-sm text-primary underline-offset-4 hover:underline">
              Thuê bao →
            </Link>
          </div>
          {thuTien.length === 0 ? (
            <p className="mt-md text-sm text-steel">Không quán nào sắp hết hạn.</p>
          ) : (
            <ul className="mt-md divide-y divide-hairline-soft text-sm">
              {thuTien.map((q) => {
                const d = daysLeft(q.paid_until!, today);
                return (
                  <li key={q.id} className="flex flex-wrap items-baseline justify-between gap-xs py-xs">
                    <span className="text-ink">
                      {q.name} <span className="font-mono text-xs text-steel">{q.slug}</span>
                    </span>
                    <span className={cn(q.han === "due_soon" ? "text-slate" : "font-medium text-status-late")}>
                      {q.han === "locked" ? "ĐÃ KHÓA" : d >= 0 ? `còn ${d} ngày` : `quá ${-d} ngày`} · hạn{" "}
                      {ngayVnHienThi(q.paid_until!)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="rounded-lg border border-hairline-soft bg-canvas p-lg shadow-card">
          <div className="flex items-baseline justify-between gap-sm">
            <h2 className="font-semibold text-xl text-ink">Cầu in cần chú ý</h2>
            <Link href="/super/cau-in" className="text-sm text-primary underline-offset-4 hover:underline">
              Cầu in →
            </Link>
          </div>
          {cauInLoi.length === 0 ? (
            <p className="mt-md text-sm text-steel">Mọi cầu in đang ổn.</p>
          ) : (
            <ul className="mt-md divide-y divide-hairline-soft text-sm">
              {cauInLoi.map(({ t, hang }) => (
                <li key={t.id} className="flex flex-wrap items-baseline justify-between gap-xs py-xs">
                  <span className="text-ink">{t.name}</span>
                  <span className="font-medium text-status-late">
                    {hang.cauIn === "chet" ? "Cầu in mất kết nối" : hang.mayIn === "loi" ? "Máy in bếp không phản hồi" : "Bản cầu in cũ"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
