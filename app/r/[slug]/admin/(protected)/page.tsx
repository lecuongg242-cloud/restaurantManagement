import { getSessionMembership } from "@/lib/auth/session";
import { Card, CardTitle, CardContent } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function AdminDashboard({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await getSessionMembership(slug);

  return (
    <div className="max-w-3xl">
      <h1 className="font-display text-3xl text-ink">
        Chào {session?.tenant.name ?? slug}
      </h1>
      <p className="mt-sm text-sm text-slate">
        Bảng điều khiển quản trị. P1 dựng khung — các mục nghiệp vụ (thực đơn, bàn, đơn)
        sẽ mở ở các plan sau.
      </p>

      <div className="mt-xl grid gap-md sm:grid-cols-2">
        <Card>
          <CardTitle>Nhân viên & PIN</CardTitle>
          <CardContent>
            Tạo nhân viên trạm (thu ngân / phục vụ / bếp) và đặt PIN 4 số ở mục{" "}
            <span className="text-ink">Nhân viên</span>.
          </CardContent>
        </Card>
        <Card>
          <CardTitle>Phạm vi dữ liệu</CardTitle>
          <CardContent>
            Xem dữ liệu tenant hiện tại (bằng chứng cách ly RLS) ở mục{" "}
            <span className="text-ink">Phạm vi dữ liệu</span>.
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
