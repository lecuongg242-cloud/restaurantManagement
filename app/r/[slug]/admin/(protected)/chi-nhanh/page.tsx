import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionMembership } from "@/lib/auth/session";
import { canManage, defaultRouteForRole } from "@/lib/auth/rbac";
import { chuoiCuaQuan } from "@/lib/brand/context";
import { TongQuanChuoi } from "@/components/brand/TongQuanChuoi";
import { Card, CardTitle } from "@/components/ui/card";
import { CreateBranchForm } from "./CreateBranchForm";

export const dynamic = "force-dynamic";

/**
 * Chi nhánh (P15) — NGAY trong admin quán, như "Quản lý chi nhánh" của KiotViet / "Nhà hàng" của CUKCUK: danh sách
 * + tổng quan hôm nay cả chuỗi, chủ quán tự tạo chi nhánh, lối vào đồng bộ thực đơn. Quán lẻ chỉ thấy nút tạo.
 */
export default async function ChiNhanhPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await getSessionMembership(slug);
  if (!session) redirect(`/r/${slug}/admin/login`);
  if (!canManage(session.role, "branches")) redirect(defaultRouteForRole(slug, session.role));

  const chuoi = await chuoiCuaQuan(session.tenant.id, session.userId);
  const laChu = session.role === "owner" && (!chuoi || chuoi.laChuChuoi);

  return (
    <div className="flex flex-col gap-lg">
      <header>
        <h1 className="font-semibold text-2xl text-ink">Chi nhánh</h1>
        <p className="mt-xxs text-sm text-steel">
          {chuoi
            ? `Chuỗi ${chuoi.brand.name} · ${chuoi.branches.length} chi nhánh. Chuyển chi nhánh bằng ô chọn ở góc trên.`
            : "Quán đang có một chi nhánh. Tạo thêm chi nhánh để quản lý chung: một tài khoản, báo cáo gộp, thực đơn đồng bộ, gia hạn một lần."}
        </p>
      </header>

      {chuoi && <TongQuanChuoi branches={chuoi.branches} hienTai={slug} />}

      {chuoi && chuoi.laChuChuoi && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-md">
            <div>
              <CardTitle>Đồng bộ thực đơn</CardTitle>
              <p className="mt-xxs text-sm text-steel">
                Sửa thực đơn ở chi nhánh gốc rồi đồng bộ sang các chi nhánh khác. Chi nhánh giữ giá riêng đã sửa và trạng thái hết món.
              </p>
            </div>
            <Link
              href={`/r/${slug}/admin/chi-nhanh/thuc-don`}
              className="inline-flex h-10 items-center rounded-md border border-hairline-strong px-lg text-sm text-ink hover:bg-surface"
            >
              Mở đồng bộ thực đơn
            </Link>
          </div>
        </Card>
      )}

      {laChu && (
        <Card>
          <CardTitle>Thêm chi nhánh</CardTitle>
          <div className="mt-md">
            <CreateBranchForm slug={slug} laChuoi={!!chuoi} />
          </div>
        </Card>
      )}

      {chuoi && (
        <p className="text-sm text-steel">
          Báo cáo gộp cả chuỗi: mục <Link href={`/r/${slug}/admin/reports`} className="text-primary underline-offset-4 hover:underline">Báo cáo</Link>{" "}
          → chọn “Tất cả chi nhánh”. Trang cho khách chọn chi nhánh:{" "}
          <Link href={`/b/${chuoi.brand.slug}`} className="text-primary underline-offset-4 hover:underline">
            /b/{chuoi.brand.slug}
          </Link>
          .
        </p>
      )}
    </div>
  );
}
