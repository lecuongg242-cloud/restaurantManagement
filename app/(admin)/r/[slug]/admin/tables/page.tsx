import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/env";
import { SetupNotice } from "@/components/setup-notice";
import { ConfirmButton } from "@/components/confirm-button";
import { siteOrigin, tableQrDataUrl } from "@/lib/qr";
import { btn, input, alertError, eyebrow } from "@/lib/ui";
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
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className={eyebrow}>
            <span className="h-2 w-2 rounded-full bg-id-pos" />
            Quản trị
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">
            Khu vực &amp; bàn
          </h1>
          <p className="mt-1 text-sm text-muted">
            Mỗi bàn có mã QR riêng. Đổi tên bàn không làm QR đã in mất hiệu lực.
          </p>
        </div>
        {(tables ?? []).length > 0 && (
          <Link href={`/r/${slug}/admin/tables/print`} className={btn.primary}>
            In toàn bộ QR
          </Link>
        )}
      </header>

      {err && (
        <p role="alert" className={alertError}>
          {err}
        </p>
      )}

      <section className="rounded-2xl border border-border p-5">
        <h2 className="mb-3 text-lg font-semibold">Thêm khu vực</h2>
        <form action={createArea} className="flex gap-2.5">
          <input type="hidden" name="slug" value={slug} />
          <input
            name="name"
            required
            placeholder="Ví dụ: Tầng 1, Sân vườn…"
            className={input}
          />
          <button className={btn.primary}>Thêm</button>
        </form>
      </section>

      {(areas ?? []).length === 0 && (
        <div className="flex flex-col items-center gap-1 rounded-2xl border border-dashed border-border px-6 py-12 text-center">
          <p className="font-semibold">Chưa có khu vực nào</p>
          <p className="text-sm text-muted">
            Tạo khu vực (ví dụ &quot;Tầng 1&quot;) rồi thêm bàn hàng loạt.
          </p>
        </div>
      )}

      {(areas ?? []).map((area) => {
        const areaTables = (tables ?? []).filter((t) => t.area_id === area.id);
        return (
          <section key={area.id} className="rounded-2xl border border-border p-5">
            <div className="mb-4 flex items-center justify-between gap-2">
              <form action={renameArea} className="flex flex-1 items-center gap-2">
                <input type="hidden" name="slug" value={slug} />
                <input type="hidden" name="id" value={area.id} />
                <input
                  name="name"
                  defaultValue={area.name}
                  required
                  aria-label="Tên khu vực"
                  className="min-h-10 w-full max-w-72 rounded-lg border border-transparent bg-transparent px-2 text-lg font-semibold outline-none transition-colors duration-200 hover:border-border focus:border-ring focus:ring-2 focus:ring-ring/25"
                />
                <button className={btn.smTertiary}>Đổi tên</button>
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
                  className={btn.smDanger}
                >
                  Xóa
                </ConfirmButton>
              </form>
            </div>

            <ul className="grid gap-2.5 sm:grid-cols-2">
              {areaTables.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center gap-3.5 rounded-xl border border-border-soft p-3 transition-colors duration-200 hover:border-border"
                >
                  <Image
                    src={qrByTable.get(t.id)!}
                    alt={`QR bàn ${t.name}`}
                    width={64}
                    height={64}
                    unoptimized
                    className="h-16 w-16 shrink-0 rounded-md"
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <form action={renameTable} className="flex items-center gap-1.5">
                      <input type="hidden" name="slug" value={slug} />
                      <input type="hidden" name="id" value={t.id} />
                      <span className="text-sm text-muted">Bàn</span>
                      <input
                        name="name"
                        defaultValue={t.name}
                        required
                        aria-label={`Tên bàn ${t.name}`}
                        className="min-h-9 w-16 rounded-lg border border-transparent bg-transparent px-1.5 font-semibold outline-none transition-colors duration-200 hover:border-border focus:border-ring focus:ring-2 focus:ring-ring/25"
                      />
                      <button className="inline-flex min-h-9 cursor-pointer items-center rounded-full border border-border px-3 text-xs font-semibold transition-colors duration-200 hover:border-foreground">
                        Lưu
                      </button>
                    </form>
                    <div className="flex items-center gap-3 text-[13px] font-medium">
                      <a
                        href={qrByTable.get(t.id)!}
                        download={`qr-${slug}-${area.name}-ban-${t.name}.png`}
                        className="flex min-h-8 items-center text-foreground underline underline-offset-2 transition-opacity duration-200 hover:opacity-70"
                      >
                        Tải PNG
                      </a>
                      <form action={deleteTable} className="flex">
                        <input type="hidden" name="slug" value={slug} />
                        <input type="hidden" name="id" value={t.id} />
                        <ConfirmButton
                          message={`Xóa bàn "${t.name}"? QR đã in của bàn này sẽ hết hiệu lực.`}
                          className="flex min-h-8 cursor-pointer items-center text-destructive underline underline-offset-2 transition-opacity duration-200 hover:opacity-70"
                        >
                          Xóa bàn
                        </ConfirmButton>
                      </form>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            <form
              action={bulkCreateTables}
              className="mt-4 flex flex-wrap items-center gap-2.5 border-t border-border-soft pt-4"
            >
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
                aria-label="Số bàn cần tạo"
                className={`${input} tabular w-20 shrink-0 font-mono`}
              />
              <span className="text-sm">bàn, đánh số tự động</span>
              <button className={btn.tertiary}>Tạo bàn</button>
            </form>
          </section>
        );
      })}
    </main>
  );
}
