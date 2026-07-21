import { headers } from "next/headers";

/**
 * Layout tenant: đọc slug từ params (và đối chiếu header x-tenant-slug do middleware gắn).
 * V1 chưa tra DB — chỉ chứng minh routing theo slug. Header hiển thị tạm tên slug.
 */
export default async function TenantLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const headerSlug = (await headers()).get("x-tenant-slug");

  return (
    <div className="min-h-screen bg-canvas">
      <header className="flex items-center gap-sm border-b border-hairline-soft px-lg py-sm">
        <span className="grid h-8 w-8 place-items-center rounded-md bg-primary text-sm font-semibold text-primary-fg">
          {slug.charAt(0).toUpperCase()}
        </span>
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-medium text-ink" data-tenant-slug={slug}>
            {slug}
          </span>
          <span className="text-xs text-steel">
            tenant · middleware: {headerSlug ?? "—"}
          </span>
        </div>
      </header>
      <main className="p-lg">{children}</main>
    </div>
  );
}
