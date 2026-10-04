import Link from "next/link";
import { redirect } from "next/navigation";
import { isSuperAdmin } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { docQuan } from "@/lib/super/tong-hop";
import { ngayVnHienThi } from "@/lib/tenant/subscription";
import { SuperPageHeader } from "@/components/super/SuperShell";
import { HanDungChip } from "../HanDungChip";
import {
  AddMemberForm,
  AttachTenantForm,
  BrandRenewalForm,
  CreateBranchForm,
  CreateBrandForm,
  DeleteBrandForm,
  DetachTenantForm,
  RemoveMemberForm,
} from "./BrandForms";
import { docGoi } from "@/lib/platform/plans-db";
import { hanChung } from "@/lib/brand/billing";

export const dynamic = "force-dynamic";

/**
 * Thương hiệu (chuỗi) — P15 15-01. Mỗi chi nhánh là một quán (tenant) như hiện nay, gom dưới một thương hiệu;
 * chủ/quản lý thương hiệu dùng MỘT tài khoản vào mọi chi nhánh (QD-023 D1, D2).
 */
export default async function ThuongHieuPage() {
  if (!(await isSuperAdmin())) redirect("/super/login");
  const admin = createAdminClient();
  const [{ quan }, { data: brands }, { data: members }, { data: tb }, plans] = await Promise.all([
    docQuan(),
    admin.from("brands").select("id, slug, name, root_tenant_id, created_at").order("created_at"),
    admin.from("brand_members").select("brand_id, user_id, role"),
    admin.from("tenants").select("id, brand_id"),
    docGoi(),
  ]);
  const brandOf = new Map((tb ?? []).map((t) => [t.id as string, (t.brand_id as string | null) ?? null]));
  const quanLe = quan.filter((q) => !brandOf.get(q.id)).map((q) => ({ id: q.id, name: q.name, slug: q.slug }));

  // Email của thành viên (auth.users) — chỉ super-admin xem, qua service role.
  const ids = [...new Set((members ?? []).map((m) => m.user_id as string))];
  const emailById = new Map<string, string>();
  for (const id of ids) {
    const { data } = await admin.auth.admin.getUserById(id);
    if (data.user?.email) emailById.set(id, data.user.email);
  }

  return (
    <div className="flex flex-col gap-lg">
      <SuperPageHeader
        title="Thương hiệu"
        description="Chuỗi nhiều chi nhánh: mỗi chi nhánh là một quán riêng (bàn, nhân viên, máy in, kho riêng), chủ dùng một tài khoản vào tất cả."
      />

      <section className="rounded-lg border border-hairline-soft bg-canvas p-lg shadow-card">
        <h2 className="font-semibold text-lg text-ink">Tạo thương hiệu</h2>
        <div className="mt-md">
          <CreateBrandForm quanLe={quanLe} />
        </div>
      </section>

      {(brands ?? []).length === 0 && <p className="text-sm text-steel">Chưa có thương hiệu nào.</p>}

      {(brands ?? []).map((b) => {
        const chiNhanh = quan.filter((q) => brandOf.get(q.id) === b.id);
        const tv = (members ?? []).filter((m) => m.brand_id === b.id);
        const chung = hanChung(chiNhanh);
        const goc = chiNhanh.find((q) => q.id === b.root_tenant_id) ?? chiNhanh[0];
        return (
          <section key={b.id} className="rounded-lg border border-hairline-soft bg-canvas p-lg shadow-card" data-brand={b.slug}>
            <div className="flex flex-wrap items-baseline justify-between gap-sm">
              <h2 className="font-semibold text-xl text-ink">
                {b.name} <span className="font-mono text-sm text-steel">{b.slug}</span>
              </h2>
              <p className="text-sm text-steel">
                {chiNhanh.length} chi nhánh · hạn chung {chung.han ? ngayVnHienThi(chung.han) : "không giới hạn"} ·{" "}
                {goc && (
                  <Link href={`/r/${goc.slug}/admin/chi-nhanh`} className="text-primary underline-offset-4 hover:underline">
                    Chi nhánh (admin quán gốc) →
                  </Link>
                )}
              </p>
            </div>
            <div className="mt-xs">
              <DeleteBrandForm brandId={b.id} slug={b.slug} />
            </div>
            <div className="mt-sm">
              <BrandRenewalForm brandId={b.id} plans={plans} soChiNhanh={chung.soDangTinh} coKhongGioiHan={chung.coKhongGioiHan} />
            </div>

            <div className="mt-md overflow-x-auto">
              <table className="w-full min-w-[40rem] text-left text-sm">
                <thead className="border-b border-hairline-soft text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="py-xs pr-md font-medium">Chi nhánh</th>
                    <th className="py-xs pr-md font-medium">Trạng thái</th>
                    <th className="py-xs pr-md font-medium">Hạn dùng</th>
                    <th className="py-xs font-medium" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline-soft">
                  {chiNhanh.map((q) => (
                    <tr key={q.id}>
                      <td className="py-sm pr-md">
                        <span className="text-ink">{q.name}</span>{" "}
                        <span className="font-mono text-xs text-steel">{q.slug}</span>
                        {b.root_tenant_id === q.id && (
                          <span className="ml-xs rounded-full bg-cream px-xs py-[2px] text-xs text-ink">gốc</span>
                        )}
                      </td>
                      <td className="py-sm pr-md text-slate">{q.status === "suspended" ? "tạm ngưng" : "hoạt động"}</td>
                      <td className="py-sm pr-md text-slate">
                        {q.paid_until ? ngayVnHienThi(q.paid_until) : "Không giới hạn"} <HanDungChip han={q.han} />
                      </td>
                      <td className="py-sm text-right">
                        <span className="inline-flex items-center gap-md">
                          <DetachTenantForm tenantId={q.id} ten={q.name} />
                          <Link href={`/r/${q.slug}/admin/login`} className="text-primary underline-offset-4 hover:underline">
                            Vào admin →
                          </Link>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-lg grid gap-lg xl:grid-cols-2">
              <div className="flex flex-col gap-md">
                <h3 className="text-sm font-medium text-ink">Thêm chi nhánh</h3>
                <CreateBranchForm
                  brandId={b.id}
                  gocId={b.root_tenant_id}
                  chiNhanh={chiNhanh.map((q) => ({ id: q.id, name: q.name, slug: q.slug }))}
                />
                <AttachTenantForm brandId={b.id} quanLe={quanLe} />
              </div>
              <div className="flex flex-col gap-sm">
                <h3 className="text-sm font-medium text-ink">Chủ / quản lý cả chuỗi</h3>
                <ul className="divide-y divide-hairline-soft text-sm">
                  {tv.map((m) => {
                    const email = emailById.get(m.user_id as string) ?? (m.user_id as string);
                    return (
                      <li key={m.user_id as string} className="flex items-center justify-between gap-sm py-xs">
                        <span className="text-ink">
                          {email} <span className="text-xs text-steel">· {m.role === "owner" ? "chủ" : "quản lý"}</span>
                        </span>
                        <RemoveMemberForm brandId={b.id} userId={m.user_id as string} ten={email} />
                      </li>
                    );
                  })}
                  {tv.length === 0 && <li className="py-xs text-steel">Chưa có ai — gắn một quán có sẵn hoặc thêm người.</li>}
                </ul>
                <AddMemberForm brandId={b.id} />
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}
