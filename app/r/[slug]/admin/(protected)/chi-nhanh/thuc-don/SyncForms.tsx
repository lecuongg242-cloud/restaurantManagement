"use client";

import { useActionState } from "react";
import { setRootAction, syncMenuAction, type KetQuaDongBo } from "./actions";
import { SubmitButton } from "@/components/ui/submit-button";
import type { CapNoi, DongThayDoi } from "@/lib/brand/menu-sync";

const EMPTY: KetQuaDongBo = {};
const LOAI: Record<DongThayDoi["loai"], string> = {
  category: "Nhóm món",
  item: "Món",
  group: "Nhóm tùy chọn",
  option: "Tùy chọn",
  link: "Gắn tùy chọn",
};

function KetQua({ s }: { s: KetQuaDongBo }) {
  if (s.ok) return <p className="text-sm text-status-ready">{s.ok}</p>;
  if (s.error) return <p className="text-sm text-status-late">{s.error}</p>;
  return null;
}

export function RootPicker({ slug, rootId, branches }: { slug: string; rootId: string | null; branches: { tenantId: string; name: string }[] }) {
  const [s, action] = useActionState(setRootAction, EMPTY);
  return (
    <form action={action} className="flex flex-wrap items-center gap-sm">
      <input type="hidden" name="slug" value={slug} />
      <label className="flex items-center gap-xs text-sm text-slate">
        Chi nhánh gốc (giữ thực đơn chuẩn)
        <select name="tenant_id" defaultValue={rootId ?? ""} className="h-9 rounded-md border border-hairline-strong bg-canvas px-sm text-sm text-ink">
          {branches.map((b) => (
            <option key={b.tenantId} value={b.tenantId}>
              {b.name}
            </option>
          ))}
        </select>
      </label>
      <SubmitButton size="sm" variant="secondary" pendingLabel="…">
        Đổi gốc
      </SubmitButton>
      <KetQua s={s} />
    </form>
  );
}

/** Xem trước + đồng bộ MỘT chi nhánh; cặp nối lần đầu hiện thành ô tích (mặc định tích). */
export function BranchSync({
  slug,
  tenantId,
  them,
  sua,
  an,
  goiYNoi,
}: {
  slug: string;
  tenantId: string;
  them: DongThayDoi[];
  sua: DongThayDoi[];
  an: DongThayDoi[];
  goiYNoi: CapNoi[];
}) {
  const [s, action] = useActionState(syncMenuAction, EMPTY);
  const khong = them.length + sua.length + an.length === 0 && goiYNoi.length === 0;
  return (
    <form action={action} className="flex flex-col gap-sm">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="target" value={tenantId} />
      {khong ? (
        <p className="text-sm text-status-ready">Đã khớp với chi nhánh gốc.</p>
      ) : (
        <div className="grid gap-md md:grid-cols-3">
          <Nhom tieuDe={`Thêm (${them.length})`} ds={them} />
          <Nhom tieuDe={`Sửa (${sua.length})`} ds={sua} />
          <Nhom tieuDe={`Ẩn (${an.length})`} ds={an} />
        </div>
      )}
      {goiYNoi.length > 0 && (
        <fieldset className="rounded-md border border-hairline-soft p-sm">
          <legend className="px-xxs text-sm font-medium text-ink">Nối với món có sẵn cùng tên (lần đầu)</legend>
          <p className="text-xs text-steel">Tích = dùng chung với món gốc (không tạo bản trùng). Bỏ tích = giữ riêng.</p>
          <ul className="mt-xs grid gap-xxs sm:grid-cols-2">
            {goiYNoi.map((p) => (
              <li key={`${p.kind}:${p.branchId}`}>
                <label className="flex items-center gap-xs text-sm text-slate">
                  <input type="checkbox" name="pair" value={`${p.kind}:${p.branchId}:${p.rootId}:${tenantId}`} defaultChecked className="h-4 w-4" />
                  {LOAI[p.kind]}: {p.ten}
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      )}
      <div className="flex flex-wrap items-center gap-sm">
        <SubmitButton size="sm" pendingLabel="Đang đồng bộ…" disabled={khong}>
          Đồng bộ chi nhánh này
        </SubmitButton>
        <KetQua s={s} />
      </div>
    </form>
  );
}

function Nhom({ tieuDe, ds }: { tieuDe: string; ds: DongThayDoi[] }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{tieuDe}</p>
      <ul className="mt-xxs max-h-48 space-y-[2px] overflow-y-auto text-sm text-slate">
        {ds.length === 0 && <li className="text-steel">—</li>}
        {ds.map((d, i) => (
          <li key={i}>
            <span className="text-steel">{LOAI[d.loai]}:</span> {d.ten}
            {d.chiTiet && <span className="text-xs text-steel"> ({d.chiTiet})</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Đồng bộ mọi chi nhánh còn chênh một lần — dùng các cặp nối gợi ý mặc định. */
export function SyncAll({ slug, targets, pairs }: { slug: string; targets: string[]; pairs: string[] }) {
  const [s, action] = useActionState(syncMenuAction, EMPTY);
  if (targets.length === 0) return null;
  return (
    <form action={action} className="flex flex-wrap items-center gap-sm">
      <input type="hidden" name="slug" value={slug} />
      {targets.map((t) => (
        <input key={t} type="hidden" name="target" value={t} />
      ))}
      {pairs.map((p) => (
        <input key={p} type="hidden" name="pair" value={p} />
      ))}
      <SubmitButton pendingLabel="Đang đồng bộ…">Đồng bộ tất cả ({targets.length} chi nhánh)</SubmitButton>
      <KetQua s={s} />
    </form>
  );
}
