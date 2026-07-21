/**
 * Layout tenant (bao mọi bề mặt /r/[slug]/*). Thin passthrough: chỉ đánh dấu
 * data-tenant-slug để chứng minh routing (01-01) và nhường phần chrome cho từng
 * bề mặt (admin/pos/kds tự render shell riêng; customer render header của mình).
 */
export default async function TenantLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return (
    <div className="min-h-screen bg-canvas" data-tenant-slug={slug}>
      {children}
    </div>
  );
}
