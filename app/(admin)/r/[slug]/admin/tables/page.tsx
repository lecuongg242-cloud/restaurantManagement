import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/env";
import { SetupNotice } from "@/components/setup-notice";
import { ConfirmButton } from "@/components/confirm-button";
import { siteOrigin, tableQrDataUrl } from "@/lib/qr";
import {
  createArea,
  renameArea,
  deleteArea,
  bulkCreateTables,
  renameTable,
  deleteTable,
} from "./actions";

export default async function TablesAdminPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ err?: string }>;
}) {
  const { slug } = await params;
  const { err } = await searchParams;
  if (!hasSupabaseEnv()) return <SetupNotice />;
  const supabase = await createClient();

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, name")
    .eq("slug", slug)
    .maybeSingle();
  if (!tenant) return null;

  const [{ data: areas }, { data: tables }] = await Promise.all([
    supabase
      .from("areas")
      .select("id, name")
      .eq("tenant_id", tenant.id)
      .order("sort")
      .order("created_at"),
    supabase
      .from("tables")
      .select("id, area_id, name, qr_token")
      .eq("tenant_id", tenant.id)
      .order("created_at"),
  ]);

  const origin = await siteOrigin();
  const qrByTable = new Map<string, string>();
  for (const t of tables ?? []) {
    qrByTable.set(t.id, await tableQrDataUrl(origin, slug, t.qr_token));
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-6">
      <header className="flex items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Khu vực & bàn — {tenant.name}</h1>
          <p className="text-sm opacity-70">
            Mỗi bàn có mã QR riêng. Đổi tên bàn không làm QR đã in mất hiệu lực.
          </p>
        </div>
        <div className="flex shrink-0 gap-3">
          {(tables ?? []).length > 0 && (
            <Link
              href={`/r/${slug}/admin/tables/print`}
              className="flex min-h-11 items-center rounded-full bg-primary px-4 text-sm font-medium text-on-primary"
            >
              In toàn bộ QR
            </Link>
          )}
          <Link
            href={`/r/${slug}/admin`}
            className="flex min-h-11 items-center text-sm underline opacity-70"
          >
            ← Quản trị
          </Link>
        </div>
      </header>

      {err && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {err}
        </p>
      )}

      <section className="rounded-card border border-border p-4">
        <h2 className="mb-3 font-semibold">Thêm khu vực</h2>
        <form action={createArea} className="flex gap-3">
          <input type="hidden" name="slug" value={slug} />
          <input
            name="name"
            required
            placeholder="Ví dụ: Tầng 1, Sân vườn…"
            className="min-h-11 flex-1 rounded-input border border-border bg-transparent px-3 text-base outline-none focus:border-ring"
          />
          <button className="min-h-11 cursor-pointer rounded-full bg-primary px-4 font-medium text-on-primary">
            Thêm
          </button>
        </form>
      </section>

      {(areas ?? []).length === 0 && (
        <p className="rounded-card border border-dashed border-border p-6 text-center opacity-70">
          Chưa có khu vực nào. Tạo khu vực (ví dụ &quot;Tầng 1&quot;) rồi thêm
          bàn hàng loạt.
        </p>
      )}

      {(areas ?? []).map((area) => {
        const areaTables = (tables ?? []).filter((t) => t.area_id === area.id);
        return (
          <section key={area.id} className="rounded-card border border-border p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <form action={renameArea} className="flex flex-1 items-center gap-2">
                <input type="hidden" name="slug" value={slug} />
                <input type="hidden" name="id" value={area.id} />
                <input
                  name="name"
                  defaultValue={area.name}
                  required
                  className="min-h-9 flex-1 rounded-input border border-transparent bg-transparent px-2 font-semibold outline-none focus:border-ring"
                />
                <button className="min-h-9 cursor-pointer rounded-full border border-border px-3 text-sm">
                  Đổi tên
                </button>
              </form>
              <form action={deleteArea}>
                <input type="hidden" name="slug" value={slug} />
                <input type="hidden" name="id" value={area.id} />
                <ConfirmButton
                  message={
                    areaTables.length > 0
                      ? `Xóa khu vực "${area.name}" sẽ xóa cả ${areaTables.length} bàn (QR các bàn này hết hiệu lực). Chắc chắn?`
                      : `Xóa khu vực "${area.name}"?`
                  }
                  className="min-h-9 cursor-pointer rounded-full border border-destructive/40 px-3 text-sm text-destructive"
                >
                  Xóa
                </ConfirmButton>
              </form>
            </div>

            <ul className="grid gap-3 sm:grid-cols-2">
              {areaTables.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center gap-3 rounded-input border border-border-soft p-3"
                >
                  <Image
                    src={qrByTable.get(t.id)!}
                    alt={`QR bàn ${t.name}`}
                    width={64}
                    height={64}
                    unoptimized
                    className="h-16 w-16 shrink-0"
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <form action={renameTable} className="flex items-center gap-1">
                      <input type="hidden" name="slug" value={slug} />
                      <input type="hidden" name="id" value={t.id} />
                      <span className="text-sm opacity-60">Bàn</span>
                      <input
                        name="name"
                        defaultValue={t.name}
                        required
                        className="min-h-9 w-16 rounded-input border border-transparent bg-transparent px-1 font-medium outline-none focus:border-ring"
                      />
                      <button className="min-h-9 cursor-pointer rounded-full border border-border px-2 text-xs">
                        Lưu
                      </button>
                    </form>
                    <div className="flex gap-2 text-xs">
                      <a
                        href={qrByTable.get(t.id)!}
                        download={`qr-${slug}-${area.name}-ban-${t.name}.png`}
                        className="underline opacity-70"
                      >
                        Tải PNG
                      </a>
                      <form action={deleteTable}>
                        <input type="hidden" name="slug" value={slug} />
                        <input type="hidden" name="id" value={t.id} />
                        <ConfirmButton
                          message={`Xóa bàn "${t.name}"? QR đã in của bàn này sẽ hết hiệu lực.`}
                          className="cursor-pointer text-destructive underline"
                        >
                          Xóa bàn
                        </ConfirmButton>
                      </form>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            <form action={bulkCreateTables} className="mt-3 flex items-center gap-2">
              <input type="hidden" name="slug" value={slug} />
              <input type="hidden" name="area_id" value={area.id} />
              <span className="text-sm">Thêm</span>
              <input
                name="count"
                type="number"
                min={1}
                max={100}
                defaultValue={1}
                required
                className="min-h-11 w-20 rounded-input border border-border bg-transparent px-3 text-base outline-none focus:border-ring"
              />
              <span className="text-sm">bàn (đánh số tự động)</span>
              <button className="min-h-11 cursor-pointer rounded-full border border-border px-4 text-sm font-medium">
                Tạo bàn
              </button>
            </form>
          </section>
        );
      })}
    </main>
  );
}
