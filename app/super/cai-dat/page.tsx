import { redirect } from "next/navigation";
import { isSuperAdmin } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { platformConfig } from "@/lib/platform/config";
import { bankByBin } from "@/lib/payments/banks";
import { buildVietQrPayload } from "@/lib/payments/vietqr";
import { qrSvg } from "@/lib/tables/qr";
import { formatVnd } from "@/lib/orders/cart";
import { gioNgayNamVn } from "@/lib/time/vn";
import { SuperPageHeader } from "@/components/super/SuperShell";
import { PlatformSettingsForm } from "./PlatformSettingsForm";
import { PlanManager } from "./PlanManager";
import { docGoi } from "@/lib/platform/plans-db";

export const dynamic = "force-dynamic";

/** Nội dung mẫu cho QR xem trước — cùng khuôn `GIAHAN {MÃQUÁN} {n}T` của trang Gia hạn. */
const NOI_DUNG_THU = "GIAHAN THU 1T";

/**
 * Cài đặt nền tảng (0060): tài khoản nhận tiền gia hạn, giá gói, số hỗ trợ. Bên phải là QR XEM TRƯỚC dựng
 * từ cấu hình ĐANG CÓ HIỆU LỰC (đã gộp dự phòng env) — quét thử bằng app ngân hàng trước khi quán dùng.
 */
export default async function CaiDatNenTangPage() {
  if (!(await isSuperAdmin())) redirect("/super/login");

  const { data: dong } = await createAdminClient()
    .from("platform_settings")
    .select("bank_bin, bank_account_no, bank_account_name, support_phone, updated_at")
    .maybeSingle();
  const [cfg, plans] = await Promise.all([platformConfig(), docGoi()]);
  // QR thử mang giá của gói đầu tiên đang hiện cho quán — đúng thứ chủ quán thấy đầu tiên.
  const goiThu = plans.find((p) => p.visible) ?? null;
  const s = (v: unknown) => (v == null ? "" : String(v));

  const svg = cfg.bank
    ? await qrSvg(
        buildVietQrPayload({
          bin: cfg.bank.bin,
          accountNo: cfg.bank.account_no,
          content: NOI_DUNG_THU,
          ...(goiThu ? { amount: goiThu.price } : {}),
        })
      )
    : null;

  return (
    <div className="flex flex-col gap-lg">
      <SuperPageHeader
        title="Cài đặt nền tảng"
        description={
          dong?.updated_at
            ? `Tài khoản nhận tiền gia hạn, gói dịch vụ. Lưu lần cuối ${gioNgayNamVn(dong.updated_at as string)}.`
            : "Tài khoản nhận tiền gia hạn, gói dịch vụ. Chưa lưu tài khoản lần nào."
        }
      />

      <section className="rounded-lg border border-hairline-soft bg-canvas p-lg shadow-card">
        <h2 className="font-display text-lg text-ink">Gói dịch vụ</h2>
        <p className="mt-xxs text-sm text-steel">
          Mỗi gói một giá riêng — thêm, sửa, xóa tùy ý. Gói bật “Hiện cho quán” xuất hiện trên trang Gia hạn của chủ
          quán; tắt đi thì gói chỉ dùng khi bạn ghi nhận ở Thuê bao.
        </p>
        <div className="mt-md">
          <PlanManager plans={plans} />
        </div>
      </section>

      <div className="grid gap-lg xl:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="rounded-lg border border-hairline-soft bg-canvas p-lg shadow-card">
          <PlatformSettingsForm
            giaTri={{
              bank_bin: s(dong?.bank_bin),
              bank_account_no: s(dong?.bank_account_no),
              bank_account_name: s(dong?.bank_account_name),
              support_phone: s(dong?.support_phone),
            }}
          />
        </section>

        <aside className="self-start rounded-lg border border-hairline-soft bg-canvas p-lg shadow-card" data-qr-xem-truoc>
          <h2 className="font-display text-lg text-ink">Xem trước QR</h2>
          {svg && cfg.bank ? (
            <>
              <div
                className="mx-auto mt-md h-56 w-56 rounded-md border border-hairline-soft bg-white p-xs [&_svg]:h-full [&_svg]:w-full"
                dangerouslySetInnerHTML={{ __html: svg }}
              />
              <dl className="mt-md grid gap-xxs text-sm">
                <dt className="text-xs text-steel">Tài khoản</dt>
                <dd className="text-ink">
                  {bankByBin(cfg.bank.bin)?.shortName ?? cfg.bank.bin} ·{" "}
                  <span className="font-mono">{cfg.bank.account_no}</span>
                </dd>
                <dd className="text-ink">{cfg.bank.account_name}</dd>
                <dt className="mt-xs text-xs text-steel">Số tiền thử</dt>
                <dd className="text-ink">
                  {goiThu ? `${formatVnd(goiThu.price)} (gói “${goiThu.name}”)` : "không kèm số tiền"}
                </dd>
                <dt className="mt-xs text-xs text-steel">Nội dung thử</dt>
                <dd className="font-mono text-ink">{NOI_DUNG_THU}</dd>
              </dl>
              <p className="mt-md text-xs text-steel">
                Quét bằng app ngân hàng: phải hiện đúng tên chủ tài khoản. Không cần chuyển.
                {cfg.bankSource === "env" && " Tài khoản này đang lấy từ biến môi trường PLATFORM_* (chưa lưu ở đây)."}
              </p>
            </>
          ) : (
            <p className="mt-md text-sm text-steel">
              Chưa có tài khoản nhận — trang Gia hạn của các quán đang báo &ldquo;Chưa có thông tin tài khoản nhận&rdquo;.
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
