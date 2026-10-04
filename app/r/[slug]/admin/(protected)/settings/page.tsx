import { redirect } from "next/navigation";
import { getSessionMembership } from "@/lib/auth/session";
import { canManage, defaultRouteForRole } from "@/lib/auth/rbac";
import { createClient } from "@/lib/supabase/server";
import { MAX_TAX_LINES, parseSettings } from "@/lib/tenant/settings";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { ImageUpload } from "@/components/menu/ImageUpload";
import { updateBank, updateBranchInfo, updateIdentity, updateSettings, updateTaxes } from "./actions";
import { BANKS } from "@/lib/payments/banks";
import Link from "next/link";
import { daysLeft, homNayHanDung, ngayVnHienThi, subscriptionState } from "@/lib/tenant/subscription";
import { urlAnh } from "@/lib/storage/public-url";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const session = await getSessionMembership(slug);
  if (!session) redirect(`/r/${slug}/admin/login`);
  if (!canManage(session.role, "settings")) {
    redirect(defaultRouteForRole(slug, session.role));
  }

  const supabase = await createClient();
  const { data: tenant } = await supabase
    .from("tenants")
    .select("name, logo_url, cover_url, settings, paid_until")
    .eq("id", session.tenant.id)
    .maybeSingle();

  const settings = parseSettings(tenant?.settings);
  const paidUntil = (tenant?.paid_until as string | null) ?? null;
  const today = homNayHanDung();
  const hanState = subscriptionState(paidUntil, today);

  return (
    <div className="w-full max-w-4xl">
      <h1 className="font-semibold text-2xl text-ink">Cài đặt</h1>
      <p className="mt-xxs text-sm text-steel">
        Nhận diện nhà hàng (tên, logo/avatar, ảnh bìa) và cấu hình vận hành (phí phục vụ, VAT, footer hóa đơn, duyệt order QR).
      </p>

      <div className="mt-lg grid gap-lg">
        {/* Gói dịch vụ (SUB-04) — lối vào trang Gia hạn, kiểu Settings → Billing của các SaaS lớn. */}
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-md">
            <div>
              <CardTitle>Gói dịch vụ</CardTitle>
              <p className="mt-xxs text-sm text-slate" data-goi-cai-dat={hanState}>
                {!paidUntil
                  ? "Không giới hạn — không cần gia hạn."
                  : hanState === "grace" || hanState === "locked"
                    ? `Đã quá hạn ${-daysLeft(paidUntil, today)} ngày (hết hạn ${ngayVnHienThi(paidUntil)}).`
                    : `Còn ${daysLeft(paidUntil, today)} ngày — hết hạn ${ngayVnHienThi(paidUntil)}.`}
              </p>
            </div>
            <Link
              href={`/r/${slug}/admin/gia-han`}
              className="inline-flex h-9 items-center rounded-md border border-hairline-strong px-md text-sm text-ink hover:bg-surface"
            >
              {paidUntil ? "Gia hạn" : "Xem gói"}
            </Link>
          </div>
        </Card>

        {/* Nhận diện */}
        <Card>
          <CardTitle>Nhận diện nhà hàng</CardTitle>
          <form action={updateIdentity} className="mt-md flex flex-col gap-lg">
            <input type="hidden" name="slug" value={slug} />
            <label className="flex max-w-sm flex-col gap-xxs text-sm text-slate">
              Tên hiển thị
              <Input name="name" required defaultValue={tenant?.name ?? ""} />
            </label>
            <ImageUpload
              currentUrl={urlAnh(tenant?.logo_url)}
              shape="circle"
              label="Logo / avatar (≤10MB, PNG/JPEG/WebP) — hiện tròn trên trang chào bàn"
            />
            <ImageUpload
              name="cover"
              currentUrl={urlAnh(tenant?.cover_url)}
              shape="cover"
              label="Ảnh bìa (≤10MB, PNG/JPEG/WebP) — ảnh ngang, để trống thì dùng dải gradient mặc định"
            />
            <div>
              <SubmitButton size="sm" pendingLabel="Đang lưu…">
                Lưu nhận diện
              </SubmitButton>
            </div>
          </form>
        </Card>

        {/* Thông tin quán — hiện trên trang chuỗi cho khách chọn chi nhánh (P15 15-05). */}
        <Card>
          <CardTitle>Thông tin quán</CardTitle>
          <p className="mt-xxs text-sm text-steel">Địa chỉ, số điện thoại, giờ mở cửa — khách thấy khi chọn chi nhánh để đặt món / đặt bàn.</p>
          <form action={updateBranchInfo} className="mt-md flex flex-col gap-md">
            <input type="hidden" name="slug" value={slug} />
            <label className="flex max-w-xl flex-col gap-xxs text-sm text-slate">
              Địa chỉ
              <Input name="address" maxLength={200} defaultValue={settings.address} placeholder="12 Lê Lợi, Quận 1" />
            </label>
            <div className="grid max-w-xl gap-md sm:grid-cols-3">
              <label className="flex flex-col gap-xxs text-sm text-slate">
                Số điện thoại
                <Input name="phone" type="tel" maxLength={30} defaultValue={settings.phone} />
              </label>
              <label className="flex flex-col gap-xxs text-sm text-slate">
                Mở cửa
                <Input name="open_time" type="time" defaultValue={settings.open_time} />
              </label>
              <label className="flex flex-col gap-xxs text-sm text-slate">
                Đóng cửa
                <Input name="close_time" type="time" defaultValue={settings.close_time} />
              </label>
            </div>
            <div>
              <SubmitButton size="sm" pendingLabel="Đang lưu…">
                Lưu thông tin quán
              </SubmitButton>
            </div>
          </form>
        </Card>

        {/* Tài khoản nhận chuyển khoản (PAY-02) — dựng VietQR in trên hóa đơn chưa thanh toán. */}
        <Card>
          <CardTitle>Tài khoản nhận chuyển khoản</CardTitle>
          <p className="mt-xxs text-sm text-steel">
            Khai một lần: hóa đơn chưa thanh toán in ra sẽ có mã QR — khách quét bằng app ngân hàng là điền sẵn đúng số
            tiền và nội dung. Tiền về thì thu ngân chọn “Chuyển khoản” như hiện nay.
          </p>
          <form action={updateBank} className="mt-md flex flex-col gap-md">
            <input type="hidden" name="slug" value={slug} />
            <label className="flex min-w-0 max-w-sm flex-col gap-xxs text-sm text-slate">
              Ngân hàng
              <select
                name="bank_bin"
                defaultValue={settings.bank?.bin ?? ""}
                className="w-full min-w-0 rounded-md border border-hairline-strong bg-canvas px-md py-sm text-base text-ink sm:text-sm focus-visible:border-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
              >
                <option value="">— Chọn ngân hàng —</option>
                {BANKS.map((b) => (
                  <option key={b.bin} value={b.bin}>
                    {b.shortName} — {b.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid gap-md sm:grid-cols-2">
              <label className="flex flex-col gap-xxs text-sm text-slate">
                Số tài khoản
                <Input
                  name="bank_account_no"
                  inputMode="numeric"
                  pattern="[0-9 .\-]{6,25}"
                  autoComplete="off"
                  defaultValue={settings.bank?.account_no ?? ""}
                  placeholder="Chỉ chữ số, 6–19 số"
                />
              </label>
              <label className="flex flex-col gap-xxs text-sm text-slate">
                Tên chủ tài khoản
                <Input
                  name="bank_account_name"
                  autoComplete="off"
                  defaultValue={settings.bank?.account_name ?? ""}
                  placeholder="NGUYEN VAN A"
                  className="uppercase"
                />
                <span className="text-xs text-steel">Tự chuyển thành IN HOA không dấu, đúng như ngân hàng in.</span>
              </label>
            </div>
            <label className="flex items-center gap-sm text-sm text-slate">
              <input
                type="checkbox"
                name="print_qr_on_receipt"
                defaultChecked={settings.print_qr_on_receipt}
                className="h-4 w-4 rounded border-hairline-strong text-primary focus-visible:ring-primary"
              />
              In mã QR chuyển khoản trên hóa đơn
            </label>
            <p className="text-xs text-steel">Để trống số tài khoản rồi lưu = gỡ tài khoản, hóa đơn thôi in QR.</p>
            <div>
              <SubmitButton size="sm" pendingLabel="Đang lưu…">
                Lưu tài khoản
              </SubmitButton>
            </div>
          </form>
        </Card>

        {/* P20 20-04 — Thuế nộp nhà nước (QD-027 C9): quán tự khai, chỉ để ước tính trên Kết quả kinh doanh. */}
        <Card id="thue">
          <CardTitle>Thuế nộp nhà nước</CardTitle>
          <p className="mt-xxs text-sm text-steel">
            Khai theo cách quán đang nộp thuế — ví dụ &quot;Thuế khoán 10% doanh thu&quot;, hoặc hai dòng &quot;GTGT 3%&quot; +
            &quot;TNCN 1,5%&quot; doanh thu, hoặc &quot;TNCN 17% lợi nhuận&quot;. Báo cáo Kết quả kinh doanh dùng để ước tính
            lợi nhuận sau thuế. <span className="font-medium text-ink">Không</span> cộng vào hóa đơn — khác ô &quot;VAT (%)&quot;
            bên dưới (VAT là tiền khách trả thêm).
          </p>
          <form action={updateTaxes} className="mt-md flex flex-col gap-sm">
            <input type="hidden" name="slug" value={slug} />
            {Array.from({ length: MAX_TAX_LINES }, (_, i) => settings.taxes[i]).map((t, i) => (
              <div key={i} className="grid grid-cols-[1fr_6rem] gap-sm sm:grid-cols-[16rem_7rem_12rem]">
                <Input name="tax_name" maxLength={60} defaultValue={t?.name ?? ""} placeholder={i === 0 ? "Tên thuế, vd Thuế khoán" : ""} aria-label={`Tên thuế ${i + 1}`} />
                <Input name="tax_pct" inputMode="decimal" defaultValue={t ? String(t.pct).replace(".", ",") : ""} placeholder="%" aria-label={`Tỷ lệ % ${i + 1}`} />
                <select
                  name="tax_base"
                  defaultValue={t?.base ?? "revenue"}
                  aria-label={`Tính trên ${i + 1}`}
                  className="col-span-2 h-11 min-w-0 rounded-md border border-hairline-strong bg-canvas px-sm text-sm text-ink sm:col-span-1"
                >
                  <option value="revenue">trên doanh thu</option>
                  <option value="profit">trên lợi nhuận</option>
                </select>
              </div>
            ))}
            <div>
              <SubmitButton size="sm" pendingLabel="Đang lưu…">Lưu thuế</SubmitButton>
            </div>
          </form>
        </Card>

        {/* Cấu hình vận hành */}
        <Card>
          <CardTitle>Cấu hình vận hành</CardTitle>
          <form action={updateSettings} className="mt-md flex flex-col gap-md">
            <input type="hidden" name="slug" value={slug} />
            <label className="flex min-w-0 max-w-sm flex-col gap-xxs text-sm text-slate">
              Chế độ phục vụ
              {/* min-w-0: bề rộng NỘI TẠI của <select> = option dài nhất ("Gọi món tại quầy — …")
                  ~390px; thiếu nó là cả trang Cài đặt tràn ngang trên điện thoại. */}
              <select
                name="service_mode"
                defaultValue={settings.service_mode}
                className="w-full min-w-0 rounded-md border border-hairline-strong bg-canvas px-md py-sm text-base text-ink sm:text-sm focus-visible:border-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
              >
                <option value="table">Theo bàn — có sơ đồ bàn, đặt bàn, QR bàn</option>
                <option value="counter">Gọi món tại quầy — không gắn bàn (gọi món &amp; thu tiền tại quầy)</option>
              </select>
              <span className="text-xs text-steel">
                Quán không gắn bàn cho khách (khách tự chọn chỗ ngồi, cà phê, kiosk, mang đi) chọn “Gọi món tại quầy”:
                POS mở thẳng màn gọi món, ẩn sơ đồ bàn.
              </span>
            </label>

            <label className="flex min-w-0 max-w-sm flex-col gap-xxs text-sm text-slate">
              Cách in phiếu
              <select
                name="print_mode"
                defaultValue={settings.print_mode}
                className="w-full min-w-0 rounded-md border border-hairline-strong bg-canvas px-md py-sm text-base text-ink sm:text-sm focus-visible:border-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
              >
                <option value="browser">Trình duyệt — in từ máy quầy có cắm máy in</option>
                <option value="bridge">Cầu in — phiếu bếp tự in ra máy in bếp</option>
              </select>
              <span className="text-xs text-steel">
                “Cầu in” cần cài bộ cài cầu in trên máy tính ở quán. Chưa cài thì chọn “Trình duyệt”.
              </span>
            </label>

            <div className="grid gap-md sm:grid-cols-2">
              <label className="flex flex-col gap-xxs text-sm text-slate">
                Phí phục vụ (%)
                <Input
                  name="service_charge_pct"
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  defaultValue={settings.service_charge_pct}
                />
              </label>
              <label className="flex flex-col gap-xxs text-sm text-slate">
                VAT (%)
                <Input
                  name="vat_pct"
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  defaultValue={settings.vat_pct}
                />
              </label>
            </div>

            <label className="flex flex-col gap-xxs text-sm text-slate">
              Footer hóa đơn
              <textarea
                name="receipt_footer"
                rows={2}
                defaultValue={settings.receipt_footer}
                placeholder="Cảm ơn quý khách!"
                className="rounded-md border border-hairline-strong bg-canvas px-md py-sm text-base text-ink placeholder:text-muted sm:text-sm focus-visible:border-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
              />
            </label>

            <label className="flex items-center gap-sm text-sm text-slate">
              <input
                type="checkbox"
                name="qr_order_auto_send"
                defaultChecked={settings.qr_order_auto_send}
                className="h-4 w-4 rounded border-hairline-strong text-primary focus-visible:ring-primary"
              />
              Tự động gửi order QR xuống bếp (tắt = cần duyệt trước)
            </label>

            <label className="flex items-center gap-sm text-sm text-slate">
              <input
                type="checkbox"
                name="allow_discount"
                defaultChecked={settings.allow_discount}
                className="h-4 w-4 rounded border-hairline-strong text-primary focus-visible:ring-primary"
              />
              Cho phép giảm giá trên hóa đơn
            </label>

            <div>
              <SubmitButton size="sm" pendingLabel="Đang lưu…">
                Lưu cấu hình
              </SubmitButton>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
