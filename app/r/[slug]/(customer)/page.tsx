import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Header khách hiển thị logo + tên tenant (OPS-06). Khách là ẩn danh nên RLS
 * chặn đọc bảng tenants qua phiên user → đọc CHỈ trường nhận diện công khai
 * (name, logo_url) bằng admin client. Theme sản phẩm cố định (QD-006 F2 — không
 * override màu theo tenant). Nội dung gọi món ở P3.
 */
export default async function CustomerHome({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const admin = createAdminClient();
  const { data: tenant } = await admin
    .from("tenants")
    .select("name, logo_url")
    .eq("slug", slug)
    .maybeSingle();

  const name = tenant?.name ?? slug;
  const logoUrl = tenant?.logo_url ?? null;

  return (
    <div>
      <header className="flex items-center gap-sm border-b border-hairline-soft px-lg py-sm">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt={name} className="h-8 w-8 rounded-md object-cover" />
        ) : (
          <span className="grid h-8 w-8 place-items-center rounded-md bg-primary text-sm font-semibold text-primary-fg">
            {name.charAt(0).toUpperCase()}
          </span>
        )}
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-medium text-ink" data-tenant-slug={slug}>
            {name}
          </span>
          <span className="text-xs text-steel">Thực đơn</span>
        </div>
      </header>
      <main className="mx-auto max-w-md p-lg">
        <h1 className="font-display text-3xl leading-tight text-ink">Thực đơn</h1>
        <p className="mt-sm text-sm text-slate">
          Bề mặt khách (customer). Nội dung gọi món sẽ mở ở P3.
        </p>
      </main>
    </div>
  );
}
