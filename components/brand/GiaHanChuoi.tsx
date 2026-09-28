import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { platformConfig } from "@/lib/platform/config";
import { docGoi } from "@/lib/platform/plans-db";
import { chonGoi, thoiHanChu } from "@/lib/platform/plans";
import { hanChung, tienGiaHanChuoi } from "@/lib/brand/billing";
import { buildVietQrPayload } from "@/lib/payments/vietqr";
import { qrSvg } from "@/lib/tables/qr";
import { homNayHanDung, ngayVnHienThi, noiDungGiaHan, subscriptionState } from "@/lib/tenant/subscription";
import { formatVnd } from "@/lib/orders/cart";
import { gioNgayNamVn } from "@/lib/time/vn";
import { KhoiChuyenKhoan } from "@/components/tenant/KhoiChuyenKhoan";
import { cn } from "@/lib/utils";

/**
 * Gia hạn cả chuỗi (P15 15-07, QD-023 D8–D12): một lần chuyển khoản, mọi chi nhánh đang hoạt động cùng một ngày hết
 * hạn. Số tiền = giá gói × số chi nhánh đang hoạt động (không giảm — chốt 27/09/2026). Chỉ chủ thương hiệu.
 *
 * Đọc chi nhánh bằng service role SAU khi đã kiểm chủ thương hiệu: chi nhánh đang bị khóa vì hết hạn đã bị
 * auth_tenant_ids() loại khỏi phiên, nhưng vẫn phải hiện ở đây — đây là nơi gỡ khóa.
 */
export async function GiaHanChuoi({
  brand,
  goi,
  base,
}: {
  brand: { id: string; slug: string; name: string };
  goi: string | undefined;
  /** Trang Gia hạn đang mở (tab gói trỏ về đây). */
  base: string;
}) {
  const s = { brand };
  const slug = brand.slug;

  const admin = createAdminClient();
  const [{ data: dsChiNhanh }, { data: lichSu }, cfg, plans] = await Promise.all([
    admin.from("tenants").select("id, slug, name, status, paid_until").eq("brand_id", s.brand.id).order("name"),
    admin
      .from("subscription_payments")
      .select("id, lifetime, months, amount, paid_until_after, recorded_at, note")
      .eq("brand_id", s.brand.id)
      .order("recorded_at", { ascending: false })
      .limit(24),
    platformConfig(),
    docGoi(),
  ]);
  const chiNhanh = (dsChiNhanh ?? []) as { id: string; slug: string; name: string; status: string; paid_until: string | null }[];
  const chung = hanChung(chiNhanh);
  const today = homNayHanDung();
  const chon = chonGoi(plans, goi, chung.han, today);
  const amount = chon ? tienGiaHanChuoi(chon.plan.price, chung.soDangTinh) : null;
  const content = chon ? noiDungGiaHan(slug, chon.plan.months) : "";
  const svg =
    cfg.bank && chon && amount
      ? await qrSvg(buildVietQrPayload({ bin: cfg.bank.bin, accountNo: cfg.bank.account_no, content, amount }))
      : null;

  return (
    <div className="flex flex-col gap-lg">
      <header>
        <h2 className="font-display text-xl text-ink">Gia hạn cả chuỗi {brand.name}</h2>
        <p className="mt-xs text-sm text-steel">
          Một lần chuyển khoản cho mọi chi nhánh đang hoạt động — tất cả cùng một ngày hết hạn. Chi nhánh mở thêm giữa kỳ
          dùng ngay, hết hạn cùng ngày, không thu bù.
        </p>
      </header>

      <section className="rounded-lg border border-hairline-soft bg-canvas p-lg shadow-card">
        <h2 className="font-display text-lg text-ink">Hạn chung</h2>
        <p className="mt-xs text-sm text-slate" data-han-chung>
          {chung.han ? <>Hết hạn <strong className="text-ink">{ngayVnHienThi(chung.han)}</strong></> : "Không giới hạn"} ·{" "}
          {chung.soDangTinh} chi nhánh đang hoạt động
        </p>
        <table className="mt-md w-full text-left text-sm">
          <tbody className="divide-y divide-hairline-soft">
            {chiNhanh.map((c) => {
              const st = subscriptionState(c.paid_until, today);
              return (
                <tr key={c.id}>
                  <td className="py-xs pr-md text-ink">{c.name}</td>
                  <td className="py-xs pr-md text-slate">{c.status === "active" ? "đang tính" : "tạm ngưng — không tính"}</td>
                  <td className={cn("py-xs", st === "grace" || st === "locked" ? "font-medium text-status-late" : "text-slate")}>
                    {c.paid_until ? ngayVnHienThi(c.paid_until) : "Không giới hạn"}
                    {st === "locked" && " · đã khóa"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="rounded-lg border border-hairline-soft bg-canvas p-lg shadow-card">
        <h2 className="font-display text-lg text-ink">Chuyển khoản gia hạn</h2>
        <nav className="mt-md flex flex-wrap gap-xs" aria-label="Chọn gói">
          {plans
            .filter((p) => p.visible)
            .map((p) => {
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
                    {formatVnd(p.price)} / chi nhánh
                  </span>
                </Link>
              );
            })}
        </nav>

        {!chon ? (
          <p className="mt-md text-sm text-steel">Chưa có gói gia hạn nào. Vui lòng liên hệ bộ phận hỗ trợ.</p>
        ) : (
          <>
            <p className="mt-md text-sm text-slate" data-tien-chuoi>
              {formatVnd(chon.plan.price)} × {chung.soDangTinh} chi nhánh ={" "}
              <strong className="text-ink">{formatVnd(amount ?? 0)}</strong>
              {chon.hanMoi ? (
                <> · hạn mới của cả chuỗi đến <strong className="text-ink">{ngayVnHienThi(chon.hanMoi)}</strong></>
              ) : (
                <> · mọi chi nhánh thành <strong className="text-ink">không giới hạn</strong></>
              )}
              .
            </p>
            <KhoiChuyenKhoan
              cfg={cfg}
              svg={svg}
              amount={amount}
              content={content}
              moTa={
                <>
                  = Gia hạn chuỗi <strong>{s.brand.name}</strong> ({chung.soDangTinh} chi nhánh), gói{" "}
                  <strong>{chon.plan.name.toLowerCase().includes(thoiHanChu(chon.plan.months).toLowerCase()) ? chon.plan.name : `${chon.plan.name} (${thoiHanChu(chon.plan.months)})`}</strong>.
                </>
              }
            />
          </>
        )}
      </section>

      <section className="rounded-lg border border-hairline-soft bg-canvas p-lg shadow-card">
        <h2 className="font-display text-lg text-ink">Lịch sử gia hạn chuỗi</h2>
        {(lichSu ?? []).length === 0 ? (
          <p className="mt-md text-sm text-steel">Chưa có lần gia hạn nào.</p>
        ) : (
          <ul className="mt-md divide-y divide-hairline-soft text-sm">
            {(lichSu ?? []).map((h) => (
              <li key={h.id as string} className="flex flex-wrap justify-between gap-xs py-xs">
                <span className="text-slate">{gioNgayNamVn(h.recorded_at as string)}</span>
                <span className="text-ink">
                  {h.lifetime
                    ? `Vĩnh viễn · ${formatVnd(h.amount as number)}`
                    : `+${h.months} tháng · ${formatVnd(h.amount as number)} → hạn ${ngayVnHienThi(h.paid_until_after as string)}`}
                  {h.note ? <span className="text-xs text-steel"> · {h.note as string}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
