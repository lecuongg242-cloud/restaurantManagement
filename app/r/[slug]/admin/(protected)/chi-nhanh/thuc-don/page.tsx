import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionMembership } from "@/lib/auth/session";
import { chuoiCuaQuan } from "@/lib/brand/context";
import { createClient } from "@/lib/supabase/server";
import { docMenuSnapshot } from "@/lib/brand/menu-snapshot";
import { khongConThayDoi, planMenuSync } from "@/lib/brand/menu-sync";
import { BranchSync, RootPicker, SyncAll } from "./SyncForms";

export const dynamic = "force-dynamic";

/**
 * Đồng bộ thực đơn (P15 15-03, QD-023 D4) — sửa thực đơn ở chi nhánh gốc như bình thường, rồi vào đây xem trước và
 * đồng bộ sang chi nhánh khác (gần cách "Sao chép thực đơn" của iPOS / "Sao chép sang nhà hàng khác" của CUKCUK).
 * Chi nhánh giữ giá riêng đã sửa và trạng thái hết món. Chỉ chủ thương hiệu.
 */
export default async function ThucDonChuoiPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await getSessionMembership(slug);
  if (!session) redirect(`/r/${slug}/admin/login`);
  const chuoi = session.role === "owner" ? await chuoiCuaQuan(session.tenant.id, session.userId) : null;
  if (!chuoi?.laChuChuoi) redirect(`/r/${slug}/admin/chi-nhanh`);

  const branches = chuoi.branches;
  const root = branches.find((b) => b.tenantId === chuoi.brand.root_tenant_id) ?? null;
  const supabase = await createClient();
  const khac = branches.filter((b) => b.tenantId !== root?.tenantId);
  const rootSnap = root ? await docMenuSnapshot(supabase, root.tenantId) : null;
  const plans = rootSnap
    ? await Promise.all(khac.map(async (b) => ({ b, p: planMenuSync(rootSnap, await docMenuSnapshot(supabase, b.tenantId)) })))
    : [];
  const conChenh = plans.filter(({ p }) => !khongConThayDoi(p) || p.goiYNoi.length > 0);

  return (
    <div className="flex flex-col gap-lg">
      <header>
        <Link href={`/r/${slug}/admin/chi-nhanh`} className="text-sm text-primary underline-offset-4 hover:underline">
          ← Chi nhánh
        </Link>
        <h1 className="mt-xs font-display text-2xl text-ink">Đồng bộ thực đơn</h1>
        <p className="mt-xs max-w-3xl text-sm text-steel">
          Sửa thực đơn ở <strong className="text-ink">chi nhánh gốc</strong> như bình thường, rồi đồng bộ sang chi nhánh khác:
          thêm món mới, cập nhật tên / ảnh / nhóm / tùy chọn / giá, ẩn món gốc đã bỏ. Chi nhánh <strong>giữ giá riêng</strong>{" "}
          nếu đã tự sửa, và <strong>giữ trạng thái hết món</strong>. Món riêng của chi nhánh không bị đụng.
        </p>
      </header>

      <section className="rounded-lg border border-hairline-soft bg-canvas p-lg shadow-card">
        <RootPicker slug={slug} rootId={root?.tenantId ?? null} branches={branches} />
        {!root && <p className="mt-sm text-sm text-status-late">Chưa có chi nhánh gốc — chọn một chi nhánh ở trên.</p>}
      </section>

      {root && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-sm">
            <p className="text-sm text-slate">
              Gốc: <strong className="text-ink">{root.name}</strong> · {conChenh.length}/{khac.length} chi nhánh còn chênh
            </p>
            <SyncAll
              slug={slug}
              targets={conChenh.map(({ b }) => b.tenantId)}
              pairs={conChenh.flatMap(({ b, p }) => p.goiYNoi.map((x) => `${x.kind}:${x.branchId}:${x.rootId}:${b.tenantId}`))}
            />
          </div>
          {plans.map(({ b, p }) => (
            <section key={b.tenantId} className="rounded-lg border border-hairline-soft bg-canvas p-lg shadow-card" data-sync-branch={b.slug}>
              <h2 className="mb-md font-display text-lg text-ink">{b.name}</h2>
              <BranchSync slug={slug} tenantId={b.tenantId} them={p.them} sua={p.sua} an={p.an} goiYNoi={p.goiYNoi} />
            </section>
          ))}
          {khac.length === 0 && <p className="text-sm text-steel">Chuỗi mới có một chi nhánh — chưa có gì để đồng bộ.</p>}
        </>
      )}
    </div>
  );
}
