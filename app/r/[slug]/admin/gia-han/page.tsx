import Link from "next/link";
import { redirect } from "next/navigation";
import { ownerForRenewal, renewalHistory } from "@/lib/tenant/renewal";
import { platformConfig } from "@/lib/platform/config";
import { buildVietQrPayload } from "@/lib/payments/vietqr";
import { qrSvg } from "@/lib/tables/qr";
import { docGoi } from "@/lib/platform/plans-db";
import { chonGoi, thoiHanChu } from "@/lib/platform/plans";
import {
  daysLeft,
  homNayHanDung,
  noiDungGiaHan,
  ngayVnHienThi,
  subscriptionState,
  type SubscriptionState,
} from "@/lib/tenant/subscription";
import { formatVnd } from "@/lib/orders/cart";
import { gioNgayNamVn } from "@/lib/time/vn";
import { Card, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { KhoiChuyenKhoan } from "@/components/tenant/KhoiChuyenKhoan";
import { GiaHanChuoi } from "@/components/brand/GiaHanChuoi";

export const dynamic = "force-dynamic";

/**
 * Trang Gia hạn cho chủ quán (SUB-04, QD-021 D8). NẰM NGOÀI nhóm (protected): guard đó đọc membership
 * qua RLS, mà quán bị khóa vì hết hạn thì RLS đã loại quán ⇒ guard đá về đăng nhập mãi. Trang này tự
 * kiểm owner bằng service-role (`ownerForRenewal`) và được layout /r/[slug] cho qua khi hết hạn.
 *
 * Gói: danh sách super-admin tự đặt (0061, chỉ gói bật "Hiện cho quán"), chọn bằng tham số URL `goi` = id gói —
 * server dựng QR đúng giá gói đó.
 */
const NHAN: Record<SubscriptionState, { chu: string; lop: string }> = {
  unlimited: { chu: "Không giới hạn", lop: "bg-surface text-slate" },
  ok: { chu: "Đang dùng", lop: "bg-status-ready-bg text-status-ready" },
  due_soon: { chu: "Sắp hết hạn", lop: "bg-status-new text-status-new-fg" },
  grace: { chu: "Quá hạn — đang trong ân hạn", lop: "bg-status-late text-status-late-fg" },
  locked: { chu: "Đã khóa — cần gia hạn", lop: "bg-status-late text-status-late-fg" },
};

export default async function GiaHanPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ goi?: string }>;
}) {
  const { slug } = await params;
  const { goi } = await searchParams;
  const owner = await ownerForRenewal(slug);
  if (!owner) redirect(`/r/${slug}/admin/login`);
  const { tenant } = owner;

  const today = homNayHanDung();
  const state = subscriptionState(tenant.paid_until, today);
  const [cfg, plans] = await Promise.all([platformConfig(), docGoi()]);
  const goiHien = plans.filter((p) => p.visible);
  const chon = chonGoi(plans, goi, tenant.paid_until, today);
  const amount = chon?.plan.price ?? null;
  const content = chon ? noiDungGiaHan(slug, chon.plan.months) : "";
  // "2 năm ưu đãi (2 năm)" thì thừa — chỉ ghi thời hạn khi tên gói chưa nói.
  const thoiHan = chon ? thoiHanChu(chon.plan.months) : "";
  const goiChu = !chon ? "" : chon.plan.name.toLowerCase().includes(thoiHan.toLowerCase()) ? chon.plan.name : `${chon.plan.name} (${thoiHan})`;
  const history = await renewalHistory(tenant.id);
  const base = `/r/${slug}/admin/gia-han`;

  const svg =
    cfg.bank && chon
      ? await qrSvg(
          buildVietQrPayload({ bin: cfg.bank.bin, accountNo: cfg.bank.account_no, content, ...(amount ? { amount } : {}) })
        )
      : null;

  return (
    <div className="min-h-screen bg-surface p-md sm:p-lg">
      <div className="mx-auto w-full max-w-2xl">
        {state !== "locked" && (
          <Link href={`/r/${slug}/admin`} className="text-sm text-primary underline-offset-4 hover:underline">
            ← Về khu quản trị
          </Link>
        )}
        <h1 className="mt-sm font-display text-2xl text-ink">Gia hạn sử dụng</h1>
        <p className="mt-xxs text-sm text-steel">{tenant.name}</p>

        <div className="mt-lg grid gap-lg">
          <Card>
            <CardTitle>Hạn dùng hiện tại</CardTitle>
            <div className="mt-md flex flex-wrap items-center gap-sm">
              <span className={cn("rounded-full px-sm py-[2px] text-sm font-medium", NHAN[state].lop)}>
                {NHAN[state].chu}
              </span>
              {tenant.paid_until && (
                <span className="text-sm text-slate">
                  Hết hạn {ngayVnHienThi(tenant.paid_until)}
                  {state === "ok" || state === "due_soon"
                    ? ` · còn ${daysLeft(tenant.paid_until, today)} ngày`
                    : ""}
                </span>
              )}
            </div>
            {state === "unlimited" && (
              <p className="mt-xs text-sm text-steel">Quán đang dùng không giới hạn — không cần gia hạn.</p>
            )}
          </Card>

          {tenant.brand ? (
            <GiaHanChuoi brand={tenant.brand} goi={goi} base={base} />
          ) : (
          <Card>
            <CardTitle>Chuyển khoản gia hạn</CardTitle>
            <nav className="mt-md flex flex-wrap gap-xs" aria-label="Chọn gói">
              {goiHien.map((p) => {
                const dangChon = p.id === chon?.plan.id;
                return (
                  <Link
                    key={p.id}
                    href={`${base}?goi=${p.id}`}
                    aria-current={dangChon ? "page" : undefined}
                    className={cn(
                      "rounded-md border px-md py-xs text-left text-sm",
                      dangChon ? "border-ink bg-ink text-canvas" : "border-hairline-strong text-slate"
                    )}
                  >
                    <span className="block">{p.name}</span>
                    <span className={cn("block text-xs", dangChon ? "text-canvas/80" : "text-steel")}>
                      {formatVnd(p.price)}
                    </span>
                  </Link>
                );
              })}
            </nav>

            {chon && (
              <p className="mt-md text-sm text-slate" data-goi-tom-tat>
                {chon.hanMoi ? (
                  <>
                    Sau khi gia hạn, hạn mới đến <strong className="text-ink">{ngayVnHienThi(chon.hanMoi)}</strong>.
                  </>
                ) : (
                  <>
                    Gói <strong className="text-ink">vĩnh viễn</strong>: trả một lần, dùng không giới hạn, không cần gia hạn nữa.
                  </>
                )}
              </p>
            )}

            {!chon ? (
              <p className="mt-md text-sm text-steel">
                Chưa có gói gia hạn nào. Vui lòng liên hệ{cfg.supportPhone ? ` ${cfg.supportPhone}` : " bộ phận hỗ trợ"}.
              </p>
            ) : (
              <KhoiChuyenKhoan
                cfg={cfg}
                svg={svg}
                amount={amount}
                content={content}
                moTa={
                  <>
                    = Gia hạn quán <strong>{tenant.name}</strong>, gói <strong>{goiChu}</strong>.
                  </>
                }
              />
            )}
          </Card>
          )}

          {!tenant.brand && (
          <Card>
            <CardTitle>Lịch sử gia hạn</CardTitle>
            {history.length === 0 ? (
              <p className="mt-md text-sm text-steel">Chưa có lần gia hạn nào.</p>
            ) : (
              <ul className="mt-md divide-y divide-hairline-soft text-sm">
                {history.map((h) => (
                  <li key={h.id} className="flex flex-wrap justify-between gap-xs py-xs">
                    <span className="text-slate">{gioNgayNamVn(h.recorded_at)}</span>
                    <span className="text-ink">
                      {h.lifetime
                        ? `Vĩnh viễn · ${formatVnd(h.amount)}`
                        : `${h.months ? `+${h.months} tháng` : "Gia hạn"} · ${formatVnd(h.amount)} → hạn ${ngayVnHienThi(h.paid_until_after!)}`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          )}
        </div>
      </div>
    </div>
  );
}
