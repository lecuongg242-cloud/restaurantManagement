import { redirect } from "next/navigation";
import { getSessionMembership } from "@/lib/auth/session";
import { canManage, defaultRouteForRole } from "@/lib/auth/rbac";
import { createClient } from "@/lib/supabase/server";
import { parseSettings } from "@/lib/tenant/settings";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { ImageUpload } from "@/components/menu/ImageUpload";
import { updateIdentity, updateSettings } from "./actions";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const { slug } = await params;
  const { error, ok } = await searchParams;

  const session = await getSessionMembership(slug);
  if (!session) redirect(`/r/${slug}/admin/login`);
  if (!canManage(session.role, "settings")) {
    redirect(defaultRouteForRole(slug, session.role));
  }

  const supabase = await createClient();
  const { data: tenant } = await supabase
    .from("tenants")
    .select("name, logo_url, settings")
    .eq("id", session.tenant.id)
    .maybeSingle();

  const settings = parseSettings(tenant?.settings);

  return (
    <div className="w-full max-w-4xl">
      <h1 className="font-display text-2xl text-ink">Cài đặt</h1>
      <p className="mt-xxs text-sm text-steel">
        Nhận diện nhà hàng (tên, logo) và cấu hình vận hành (phí phục vụ, VAT, footer hóa đơn, duyệt order QR).
      </p>

      {error && (
        <p
          role="alert"
          className="mt-md rounded-md border border-status-late bg-cream-soft px-md py-sm text-sm text-status-late"
        >
          {error}
        </p>
      )}
      {ok && (
        <p
          role="status"
          className="mt-md rounded-md border border-status-ready bg-status-ready-bg px-md py-sm text-sm text-status-ready"
        >
          {ok}
        </p>
      )}

      <div className="mt-lg grid gap-lg">
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
              currentUrl={tenant?.logo_url ?? null}
              shape="circle"
              label="Logo nhà hàng (≤2MB, PNG/JPEG/WebP)"
            />
            <div>
              <SubmitButton size="sm" pendingLabel="Đang lưu…">
                Lưu nhận diện
              </SubmitButton>
            </div>
          </form>
        </Card>

        {/* Cấu hình vận hành */}
        <Card>
          <CardTitle>Cấu hình vận hành</CardTitle>
          <form action={updateSettings} className="mt-md flex flex-col gap-md">
            <input type="hidden" name="slug" value={slug} />
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
                className="rounded-md border border-hairline-strong bg-canvas px-md py-sm text-sm text-ink placeholder:text-muted focus-visible:border-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
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
