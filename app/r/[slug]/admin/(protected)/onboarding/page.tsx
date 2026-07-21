import { redirect } from "next/navigation";
import { getSessionMembership } from "@/lib/auth/session";
import { canManage, defaultRouteForRole } from "@/lib/auth/rbac";
import { createClient } from "@/lib/supabase/server";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";
import { getOnboardingState } from "./actions";

export const dynamic = "force-dynamic";

export default async function OnboardingPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ step?: string; error?: string; ok?: string }>;
}) {
  const { slug } = await params;
  const { step, error, ok } = await searchParams;

  const session = await getSessionMembership(slug);
  if (!session) redirect(`/r/${slug}/admin/login`);
  if (!canManage(session.role, "onboarding")) {
    redirect(defaultRouteForRole(slug, session.role));
  }

  const supabase = await createClient();
  const { data: tenant } = await supabase
    .from("tenants")
    .select("name, logo_url")
    .eq("id", session.tenant.id)
    .maybeSingle();

  const state = await getOnboardingState(slug);
  const initialStep = parseInt(step ?? "1", 10) || 1;

  return (
    <div className="mx-auto w-full max-w-3xl">
      <h1 className="font-display text-2xl text-ink">Thiết lập nhà hàng</h1>
      <p className="mt-xxs text-sm text-steel">
        Bốn bước để có đủ dữ liệu phục vụ: thông tin → menu mẫu → bàn + QR → xong.
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

      <div className="mt-lg">
        <OnboardingWizard
          slug={slug}
          initialStep={initialStep}
          state={state}
          tenantName={tenant?.name ?? ""}
          logoUrl={tenant?.logo_url ?? null}
        />
      </div>
    </div>
  );
}
