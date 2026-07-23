import { getSessionMembership } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { createStaff, resetPin, setStaffActive, deleteStaff } from "./actions";

export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = {
  cashier: "Thu ngân",
  waiter: "Phục vụ",
  kitchen: "Bếp",
};

export default async function StaffPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await getSessionMembership(slug);

  const supabase = await createClient();
  const { data: staff } = await supabase
    .from("memberships")
    .select("id, display_name, email, role, active, created_at")
    .eq("tenant_id", session!.tenant.id)
    .in("role", ["cashier", "waiter", "kitchen"])
    .order("created_at", { ascending: true });

  return (
    <div className="w-full max-w-4xl">
      <h1 className="font-display text-2xl text-ink">Nhân viên</h1>
      <p className="mt-xxs text-sm text-steel">
        Mỗi nhân viên có email riêng + PIN 4 số, đăng nhập thẳng ở POS/KDS bằng email + PIN (QD-009).
        Tạo nhiều người cùng vai trò, mỗi người một email/PIN để truy vết.
      </p>

      {/* Thêm nhân viên */}
      <Card className="mt-lg">
        <form
          action={createStaff}
          className="grid grid-cols-1 gap-md sm:grid-cols-[1fr_1fr_150px_110px_auto] sm:items-end"
        >
          <input type="hidden" name="slug" value={slug} />
          <label className="flex flex-col gap-xxs text-sm text-slate">
            Tên hiển thị
            <Input name="display_name" required placeholder="Lan" />
          </label>
          <label className="flex flex-col gap-xxs text-sm text-slate">
            Email
            <Input name="email" type="email" required placeholder="lan@pho-viet.vn" />
          </label>
          <label className="flex flex-col gap-xxs text-sm text-slate">
            Vai trò
            <select
              name="role"
              required
              defaultValue="cashier"
              className="h-11 rounded-md border border-hairline-strong bg-canvas px-md text-sm text-ink focus-visible:border-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
            >
              <option value="cashier">Thu ngân</option>
              <option value="waiter">Phục vụ</option>
              <option value="kitchen">Bếp</option>
            </select>
          </label>
          <label className="flex flex-col gap-xxs text-sm text-slate">
            PIN (4 số)
            <Input
              name="pin"
              inputMode="numeric"
              pattern="\d{4}"
              maxLength={4}
              required
              placeholder="1234"
            />
          </label>
          <SubmitButton pendingLabel="Đang thêm…">Thêm</SubmitButton>
        </form>
      </Card>

      {/* Danh sách */}
      <div className="mt-lg overflow-hidden rounded-lg border border-hairline-soft">
        <table className="w-full text-sm">
          <thead className="bg-surface text-left text-steel">
            <tr>
              <th className="px-md py-sm font-medium">Tên</th>
              <th className="px-md py-sm font-medium">Email</th>
              <th className="px-md py-sm font-medium">Vai trò</th>
              <th className="px-md py-sm font-medium">Trạng thái</th>
              <th className="px-md py-sm font-medium">Đặt lại PIN</th>
              <th className="px-md py-sm font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {(staff ?? []).map((s) => (
              <tr key={s.id} className="border-t border-hairline-soft align-middle">
                <td className="px-md py-sm text-ink">{s.display_name}</td>
                <td className="px-md py-sm font-mono text-xs text-steel">{s.email ?? "—"}</td>
                <td className="px-md py-sm">
                  <Badge variant="cream">{ROLE_LABEL[s.role] ?? s.role}</Badge>
                </td>
                <td className="px-md py-sm">
                  {s.active ? (
                    <span className="text-status-ready">Đang bật</span>
                  ) : (
                    <span className="text-steel">Đã tắt</span>
                  )}
                </td>
                <td className="px-md py-sm">
                  <form action={resetPin} className="flex items-center gap-xs">
                    <input type="hidden" name="slug" value={slug} />
                    <input type="hidden" name="id" value={s.id} />
                    <Input
                      name="pin"
                      inputMode="numeric"
                      pattern="\d{4}"
                      maxLength={4}
                      required
                      placeholder="••••"
                      className="h-9 w-24"
                    />
                    <Button type="submit" variant="secondary" size="sm">
                      Lưu
                    </Button>
                  </form>
                </td>
                <td className="px-md py-sm">
                  <div className="flex items-center gap-xs">
                    <form action={setStaffActive}>
                      <input type="hidden" name="slug" value={slug} />
                      <input type="hidden" name="id" value={s.id} />
                      <input type="hidden" name="active" value={s.active ? "false" : "true"} />
                      <Button type="submit" variant="link" size="sm">
                        {s.active ? "Tắt" : "Bật"}
                      </Button>
                    </form>
                    <form action={deleteStaff}>
                      <input type="hidden" name="slug" value={slug} />
                      <input type="hidden" name="id" value={s.id} />
                      <ConfirmSubmit
                        message={`Xóa nhân viên "${s.display_name}"? Thao tác không hoàn tác được.`}
                        className="inline-flex h-9 items-center rounded-md px-sm text-sm text-status-late hover:bg-surface"
                      >
                        Xóa
                      </ConfirmSubmit>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
            {(staff ?? []).length === 0 && (
              <tr>
                <td colSpan={6} className="px-md py-lg text-center text-steel">
                  Chưa có nhân viên. Thêm ở form phía trên.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
