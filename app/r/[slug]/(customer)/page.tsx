import { headers } from "next/headers";

export default async function CustomerHome({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const headerSlug = (await headers()).get("x-tenant-slug");

  return (
    <div>
      <header className="flex items-center gap-sm border-b border-hairline-soft px-lg py-sm">
        <span className="grid h-8 w-8 place-items-center rounded-md bg-primary text-sm font-semibold text-primary-fg">
          {slug.charAt(0).toUpperCase()}
        </span>
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-medium text-ink" data-tenant-slug={slug}>
            {slug}
          </span>
          <span className="text-xs text-steel">tenant · middleware: {headerSlug ?? "—"}</span>
        </div>
      </header>
      <main className="mx-auto max-w-md p-lg">
        <h1 className="font-display text-3xl leading-tight text-ink">Thực đơn</h1>
        <p className="mt-sm text-sm text-slate">
          Bề mặt khách (customer). Khung P1 — nội dung gọi món ở plan sau.
        </p>
      </main>
    </div>
  );
}
