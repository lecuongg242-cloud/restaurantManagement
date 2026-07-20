import { createClient } from "@/lib/supabase/server";
import { createTenant } from "./actions";
import { CopyLink } from "@/components/copy-link";

export default async function SuperAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ invited?: string; email?: string; err?: string }>;
}) {
  const { invited, email, err } = await searchParams;
  const supabase = await createClient();
  const { data: tenants } = await supabase
    .from("tenants")
    .select("id, slug, name, status, created_at")
    .order("created_at", { ascending: false });

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 p-6">
      <header>
        <h1 className="text-2xl font-bold">Quản trị SaaS</h1>
        <p className="text-sm opacity-70">
          Tạo nhà hàng (tenant) mới và gửi lời mời cho chủ nhà hàng.
        </p>
      </header>

      {err && (
        <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600">
          {err}
        </p>
      )}
      {invited && (
        <div className="rounded-lg bg-green-500/10 px-3 py-3 text-sm">
          <p className="mb-2 font-medium">
            Đã tạo nhà hàng. Gửi link này cho {email}:
          </p>
          <CopyLink path={`/invite/${invited}`} />
        </div>
      )}

      <section className="rounded-xl border border-foreground/15 p-4">
        <h2 className="mb-3 font-semibold">Tạo nhà hàng mới</h2>
        <form action={createTenant} className="flex flex-col gap-3">
          <input
            name="name"
            required
            placeholder="Tên nhà hàng (VD: Phở Bà Ba)"
            className="min-h-11 rounded-lg border border-foreground/20 bg-transparent px-3 text-base outline-none focus:border-foreground/60"
          />
          <input
            name="slug"
            required
            pattern="[a-z0-9][a-z0-9-]{1,48}[a-z0-9]"
            placeholder="slug (VD: pho-ba-ba)"
            className="min-h-11 rounded-lg border border-foreground/20 bg-transparent px-3 font-mono text-base outline-none focus:border-foreground/60"
          />
          <input
            name="owner_email"
            type="email"
            required
            placeholder="Email chủ nhà hàng"
            className="min-h-11 rounded-lg border border-foreground/20 bg-transparent px-3 text-base outline-none focus:border-foreground/60"
          />
          <button className="min-h-11 rounded-lg bg-foreground font-medium text-background">
            Tạo và gửi lời mời owner
          </button>
        </form>
      </section>

      <section>
        <h2 className="mb-3 font-semibold">
          Danh sách nhà hàng ({tenants?.length ?? 0})
        </h2>
        <ul className="flex flex-col gap-2">
          {(tenants ?? []).map((t) => (
            <li
              key={t.id}
              className="flex items-center justify-between rounded-lg border border-foreground/15 px-4 py-3"
            >
              <div>
                <span className="font-medium">{t.name}</span>
                <span className="ml-2 font-mono text-sm opacity-60">/r/{t.slug}</span>
              </div>
              <span className="text-sm opacity-70">{t.status}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
