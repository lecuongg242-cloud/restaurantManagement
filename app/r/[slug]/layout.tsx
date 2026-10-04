import type { Metadata } from "next";
import { headers } from "next/headers";
import { tenantGate } from "@/lib/tenant/active";
import { thuongHieuQuan } from "@/lib/tenant/thuong-hieu";
import { TenantSuspended } from "@/components/tenant/TenantSuspended";
import { TenantExpired } from "@/components/tenant/TenantExpired";
import { platformConfig } from "@/lib/platform/config";
import { duongDanBieuTuong } from "@/lib/tenant/bieu-tuong";

/**
 * Trang vẫn mở khi quán HẾT HẠN (SUB-04): đăng nhập + Gia hạn — lối thoát duy nhất của chủ quán. Trang
 * Gia hạn tự kiểm owner bằng service-role (auth_tenant_ids() đã loại quán này), không mở lỗ RLS nào.
 */
function moKhiHetHan(slug: string, path: string | null): boolean {
  return path === `/r/${slug}/admin/login` || path === `/r/${slug}/admin/gia-han`;
}

/** Tab trình duyệt mang tên + logo của quán (mọi bề mặt: khách, POS, KDS, admin). */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const quan = await thuongHieuQuan(slug);
  if (!quan) return {};
  return { title: quan.ten, icons: { icon: duongDanBieuTuong(slug, quan) } };
}

/**
 * Layout tenant (bao mọi bề mặt /r/[slug]/*). Ngoài việc đánh dấu data-tenant-slug để chứng minh
 * routing (01-01), đây là CHỐT CHẶN của trạng thái tạm ngưng (TENANT-06, QD-012 §2).
 *
 * Đặt ở đây vì layout này bao cả khách, POS, KDS, admin lẫn trang in — kiểm một chỗ là phủ hết,
 * và bề mặt thêm sau này tự động được che mà không ai phải nhớ.
 *
 * RENDER thẳng màn tạm ngưng chứ KHÔNG redirect: quán bị ngưng làm auth_tenant_ids() rỗng (0039)
 * ⇒ policy tenants_member_read giấu luôn dòng tenant ⇒ getSessionMembership trả null ⇒ guard admin
 * đá về /admin/login ⇒ đăng nhập lại thành công ⇒ vòng lặp chuyển hướng. Không chuyển hướng thì
 * không có vòng lặp nào để mà sai.
 */
export default async function TenantLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const gate = await tenantGate(slug);

  if (gate === "suspended") {
    return (
      <div className="min-h-screen bg-canvas" data-tenant-slug={slug} data-tenant-suspended="true">
        <TenantSuspended />
      </div>
    );
  }

  // Hết hạn: cũng RENDER (không redirect) như tạm ngưng — cùng lý do vòng lặp chuyển hướng ở trên.
  if (gate === "expired" && !moKhiHetHan(slug, (await headers()).get("x-pathname"))) {
    return (
      <div className="min-h-screen bg-canvas" data-tenant-slug={slug} data-tenant-expired="true">
        <TenantExpired slug={slug} supportPhone={(await platformConfig()).supportPhone} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas" data-tenant-slug={slug}>
      {children}
    </div>
  );
}
