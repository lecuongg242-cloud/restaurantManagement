import Link from "next/link";
import { redirect } from "next/navigation";
import { isSuperAdmin } from "@/lib/auth/session";
import { docQuan } from "@/lib/super/tong-hop";
import { ngayVnHienThi } from "@/lib/tenant/subscription";
import { gioNgayNamVn } from "@/lib/time/vn";
import { StatusToggleForm, ResetPasswordForm, DeleteTenantForm } from "../tenant-actions";
import { HanDungChip } from "../HanDungChip";
import { SuperPageHeader } from "@/components/super/SuperShell";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** Danh sách nhà hàng: tài khoản owner, trạng thái, tạm ngưng / xóa. Hạn dùng chỉ xem — sửa ở Thuê bao. */
export default async function NhaHangPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string; giu_mat_khau?: string }>;
}) {
  if (!(await isSuperAdmin())) redirect("/super/login");
  const { created, giu_mat_khau } = await searchParams;
  const { quan } = await docQuan();

  return (
    <div className="flex flex-col gap-lg">
      <SuperPageHeader
        title="Nhà hàng"
        description={`${quan.length} nhà hàng đang được quản lý.`}
        actions={
          <Button asChild>
            <Link href="/super/new">+ Nhà hàng mới</Link>
          </Button>
        }
      />

      {created && (
        <p
          role="status"
          className="rounded-md border border-status-ready bg-status-ready-bg px-md py-sm text-sm text-status-ready"
        >
          Đã tạo nhà hàng “{created}”. Owner có thể đăng nhập tại /r/{created}/admin/login.
          {giu_mat_khau && " Email owner đã có tài khoản đang dùng ở quán khác — giữ nguyên mật khẩu cũ."}
        </p>
      )}

      <section className="rounded-lg border border-hairline-soft bg-canvas shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[56rem] text-left text-sm">
            <thead className="border-b border-hairline-soft text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-lg py-sm font-medium">Nhà hàng</th>
                <th className="px-md py-sm font-medium">Owner</th>
                <th className="px-md py-sm font-medium">Trạng thái</th>
                <th className="px-md py-sm font-medium">Hạn dùng</th>
                <th className="px-md py-sm font-medium">Tạo lúc</th>
                <th className="px-lg py-sm font-medium">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline-soft">
              {quan.map((q) => {
                const isSuspended = q.status === "suspended";
                return (
                  <tr key={q.id} className={cn("align-top", isSuspended && "bg-surface/40")}>
                    <td className="px-lg py-md">
                      <div className="flex items-center gap-sm">
                        <span
                          className={cn(
                            "grid h-9 w-9 shrink-0 place-items-center rounded-md bg-cream-soft font-semibold text-lg text-ink",
                            isSuspended && "opacity-60"
                          )}
                        >
                          {q.name.trim().charAt(0).toUpperCase() || "?"}
                        </span>
                        <div className="min-w-0">
                          <p className="font-medium text-ink">{q.name}</p>
                          <p className="text-xs text-steel">
                            <span className="font-mono">{q.slug}</span> ·{" "}
                            <Link href={`/r/${q.slug}/admin/login`} className="text-primary underline-offset-4 hover:underline">
                              Vào admin →
                            </Link>
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-md py-md text-slate">{q.owner ?? "—"}</td>
                    <td className="px-md py-md">
                      {isSuspended ? (
                        <span className="inline-flex items-center gap-xxs rounded-full bg-cream-soft px-xs py-[2px] text-xs text-steel">
                          <span className="h-1.5 w-1.5 rounded-full bg-steel" aria-hidden />
                          tạm ngưng
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-xxs rounded-full bg-surface px-xs py-[2px] text-xs text-slate">
                          <span className="h-1.5 w-1.5 rounded-full bg-status-ready" aria-hidden />
                          hoạt động
                        </span>
                      )}
                    </td>
                    <td className="px-md py-md">
                      <p className="text-slate">{q.paid_until ? ngayVnHienThi(q.paid_until) : "Không giới hạn"}</p>
                      <HanDungChip han={q.han} />
                    </td>
                    <td className="px-md py-md text-slate">{gioNgayNamVn(q.created_at)}</td>
                    <td className="px-lg py-md">
                      <div className="flex flex-wrap items-start gap-xs">
                        {q.owner && <ResetPasswordForm tenantId={q.id} />}
                        <StatusToggleForm tenantId={q.id} isSuspended={isSuspended} />
                        {isSuspended && <DeleteTenantForm tenantId={q.id} slug={q.slug} />}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {quan.length === 0 && (
          <div className="flex flex-col items-center gap-sm p-xxl text-center">
            <p className="text-sm text-steel">Chưa có nhà hàng nào.</p>
            <Button asChild size="sm">
              <Link href="/super/new">Tạo nhà hàng đầu tiên</Link>
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
