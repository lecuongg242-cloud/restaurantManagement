import type { Metadata } from "next";
import { isTenantActive } from "@/lib/tenant/active";
import { thuongHieuQuan } from "@/lib/tenant/thuong-hieu";
import { TenantSuspended } from "@/components/tenant/TenantSuspended";

/** Tab trình duyệt mang tên + logo của quán (mọi bề mặt: khách, POS, KDS, admin). */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const quan = await thuongHieuQuan(slug);
  if (!quan) return {};
  return { title: quan.ten, icons: { icon: `/r/${slug}/favicon.png` } };
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

  if (!(await isTenantActive(slug))) {
    return (
      <div className="min-h-screen bg-canvas" data-tenant-slug={slug} data-tenant-suspended="true">
        <TenantSuspended />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas" data-tenant-slug={slug}>
      {children}
    </div>
  );
}
