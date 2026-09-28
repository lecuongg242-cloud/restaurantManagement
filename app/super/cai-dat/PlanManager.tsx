"use client";

import { useActionState, useState } from "react";
import { deletePlan, savePlan, type SuperActionState } from "../actions";
import type { Plan } from "@/lib/platform/plans";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/lib/utils";

const EMPTY: SuperActionState = {};

/**
 * Danh sách gói dịch vụ (0061) — mỗi gói một dòng sửa tại chỗ, dòng cuối để thêm gói mới. Tên, thời hạn (số
 * tháng hoặc vĩnh viễn), giá riêng từng gói, và "Hiện cho quán" (tắt = chỉ super-admin dùng khi ghi nhận).
 */
export function PlanManager({ plans }: { plans: Plan[] }) {
  return (
    <div className="flex flex-col gap-sm" data-plan-manager>
      <div className="hidden grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_minmax(0,1.2fr)_auto_auto] gap-sm px-sm text-xs uppercase tracking-wide text-muted md:grid">
        <span>Tên gói</span>
        <span>Thời hạn</span>
        <span>Giá (đ)</span>
        <span>Hiện cho quán</span>
        <span />
      </div>
      {plans.map((p) => (
        <PlanRow key={p.id} plan={p} />
      ))}
      <PlanRow key={`moi-${plans.length}`} plan={null} />
    </div>
  );
}

function PlanRow({ plan }: { plan: Plan | null }) {
  const [state, action] = useActionState(savePlan, EMPTY);
  const [xoaState, xoa] = useActionState(deletePlan, EMPTY);
  const [vinhVien, setVinhVien] = useState(plan ? plan.months == null : false);
  const moi = plan == null;

  return (
    <div className={cn("rounded-md border p-sm", moi ? "border-dashed border-hairline-strong" : "border-hairline-soft")}>
      <form
        action={action}
        className="grid items-center gap-sm md:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_minmax(0,1.2fr)_auto_auto]"
      >
        {plan && <input type="hidden" name="plan_id" value={plan.id} />}
        <Input name="name" required maxLength={60} defaultValue={plan?.name ?? ""} placeholder={moi ? "Tên gói mới, vd: 2 năm ưu đãi" : ""} aria-label="Tên gói" />
        <div className="flex items-center gap-xs">
          <Input
            name="months"
            type="number"
            min={1}
            max={120}
            disabled={vinhVien}
            defaultValue={plan?.months ?? ""}
            placeholder="số tháng"
            className="w-24"
            aria-label="Số tháng"
          />
          <label className="flex items-center gap-xxs whitespace-nowrap text-xs text-slate">
            <input type="checkbox" name="lifetime" checked={vinhVien} onChange={(e) => setVinhVien(e.target.checked)} className="h-4 w-4" />
            Vĩnh viễn
          </label>
        </div>
        <Input name="price" inputMode="numeric" required defaultValue={plan?.price ?? ""} placeholder="vd 5500000" aria-label="Giá" />
        <label className="flex items-center gap-xxs text-xs text-slate md:justify-center">
          <input type="checkbox" name="visible" defaultChecked={plan?.visible ?? true} className="h-4 w-4" />
          <span className="md:sr-only">Hiện cho quán</span>
        </label>
        <div className="flex items-center gap-xs">
          <SubmitButton size="sm" variant={moi ? "primary" : "secondary"} pendingLabel="…">
            {moi ? "Thêm gói" : "Lưu"}
          </SubmitButton>
          {plan && (
            <button
              type="submit"
              formAction={xoa}
              formNoValidate
              onClick={(e) => {
                if (!confirm(`Xóa gói “${plan.name}”? Lịch sử gia hạn không bị ảnh hưởng.`)) e.preventDefault();
              }}
              className="h-9 rounded-md px-sm text-sm text-status-late hover:bg-status-late/10"
            >
              Xóa
            </button>
          )}
        </div>
      </form>
      {(state.error || xoaState.error) && <p className="mt-xxs text-xs text-status-late">{state.error ?? xoaState.error}</p>}
      {state.ok && <p className="mt-xxs text-xs text-status-ready">{state.ok}</p>}
    </div>
  );
}
