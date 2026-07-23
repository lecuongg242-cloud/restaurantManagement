import { staffSignIn } from "@/app/r/[slug]/station-actions";
import { SubmitButton } from "@/components/ui/submit-button";
import { Input } from "@/components/ui/input";

/**
 * Đăng nhập nhân viên POS/KDS (QD-009) — 1 bước: email + PIN. Nhân viên gõ email riêng + PIN 4 số
 * là vào thẳng bề mặt với đúng danh tính. Owner/manager gõ email + mật khẩu thường ở cùng form.
 */
export function StationLoginForm({
  slug,
  surface,
  error,
}: {
  slug: string;
  surface: "pos" | "kds";
  error?: string;
}) {
  const title = surface === "pos" ? "Trạm POS" : "Màn hình bếp (KDS)";
  return (
    <div className="grid min-h-screen place-items-center bg-surface p-lg">
      <div className="w-full max-w-sm rounded-lg border border-hairline-soft bg-canvas p-xxl shadow-card">
        <h1 className="font-display text-2xl text-ink">{title}</h1>
        <p className="mt-xxs text-sm text-steel">
          Nhà hàng <span className="font-mono text-ink">{slug}</span> · đăng nhập bằng email + PIN.
        </p>

        {error && (
          <p
            role="alert"
            className="mt-md rounded-md border border-status-late bg-cream-soft px-md py-sm text-sm text-status-late"
          >
            {error}
          </p>
        )}

        <form action={staffSignIn} className="mt-lg flex flex-col gap-md">
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="surface" value={surface} />
          <label className="flex flex-col gap-xxs text-sm text-slate">
            Email
            <Input name="email" type="email" required autoComplete="username" autoFocus />
          </label>
          <label className="flex flex-col gap-xxs text-sm text-slate">
            PIN / mật khẩu
            <Input
              name="secret"
              type="password"
              inputMode="numeric"
              required
              autoComplete="current-password"
              placeholder="••••"
            />
          </label>
          <SubmitButton size="lg" pendingLabel="Đang đăng nhập…" className="mt-xs">
            Đăng nhập
          </SubmitButton>
        </form>
      </div>
    </div>
  );
}
