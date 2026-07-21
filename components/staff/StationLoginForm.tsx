import { stationSignIn } from "@/app/r/[slug]/station-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Đăng nhập tài khoản TRẠM (1 lần/thiết bị) cho POS hoặc KDS.
 * Sau khi đăng nhập trạm, nhân viên thao tác nhanh bằng PIN (StaffPicker).
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
          Nhà hàng <span className="font-mono text-ink">{slug}</span> · đăng nhập thiết bị bằng
          tài khoản trạm.
        </p>

        {error && (
          <p className="mt-md rounded-md border border-status-late bg-cream-soft px-md py-sm text-sm text-status-late">
            {error}
          </p>
        )}

        <form action={stationSignIn} className="mt-lg flex flex-col gap-md">
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="surface" value={surface} />
          <label className="flex flex-col gap-xxs text-sm text-slate">
            Email trạm
            <Input name="email" type="email" required autoComplete="email" />
          </label>
          <label className="flex flex-col gap-xxs text-sm text-slate">
            Mật khẩu
            <Input name="password" type="password" required autoComplete="current-password" />
          </label>
          <Button type="submit" size="lg" className="mt-xs">
            Đăng nhập thiết bị
          </Button>
        </form>
      </div>
    </div>
  );
}
