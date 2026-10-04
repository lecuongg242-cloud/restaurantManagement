"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PosArea, PosPending, PosSession, PosTable } from "@/lib/orders/pos";
import { groupCandidates } from "@/lib/orders/group-candidates";
import { setTableGroupAction } from "@/app/r/[slug]/pos/actions";
import { offlineMsg } from "@/components/pos/offline-msg";

/**
 * Hộp "Ghép bàn với B1" (P23, TABLE-03/06 — giao diện chốt 01/10/2026). Bàn chia theo khu, mỗi bàn là một ô tích;
 * bỏ tích bàn phụ = bỏ ghép. Gửi TOÀN BỘ danh sách bàn phụ mong muốn — server kiểm lại hết trong một giao dịch.
 * Điện thoại: tấm từ dưới lên, nút dính đáy.
 */
export function GroupTablesDialog({
  slug,
  mainTable,
  areas,
  tables,
  sessions,
  pending,
  onClose,
}: {
  slug: string;
  mainTable: PosTable;
  areas: PosArea[];
  tables: PosTable[];
  sessions: PosSession[];
  pending: PosPending[];
  onClose: () => void;
}) {
  const router = useRouter();
  const candidates = useMemo(
    () => groupCandidates({ mainTableId: mainTable.id, tables, sessions, pending }),
    [mainTable.id, tables, sessions, pending]
  );
  const initial = useMemo(
    () => new Set(candidates.filter((c) => c.checked && c.table.id !== mainTable.id).map((c) => c.table.id)),
    [candidates, mainTable.id]
  );
  const [picked, setPicked] = useState<Set<string>>(() => new Set(initial));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const changed = picked.size !== initial.size || [...picked].some((id) => !initial.has(id));

  const sections = useMemo(() => {
    const out = areas
      .map((a) => ({ id: a.id, name: a.name, items: candidates.filter((c) => c.table.area_id === a.id) }))
      .filter((s) => s.items.length > 0);
    const none = candidates.filter((c) => c.table.area_id === null || !areas.some((a) => a.id === c.table.area_id));
    if (none.length > 0) out.push({ id: "none", name: "Chưa xếp khu", items: none });
    return out;
  }, [areas, candidates]);

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const submit = async () => {
    setBusy(true);
    setError(null);
    const res = await setTableGroupAction(slug, mainTable.id, [...picked]).catch(() => null);
    setBusy(false);
    if (!res) setError(offlineMsg("ghép bàn"));
    else if (!res.ok) setError(res.error);
    else {
      router.refresh();
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-ink/50 p-md max-sm:items-end max-sm:p-0"
      role="dialog"
      aria-modal="true"
      aria-label="Ghép bàn"
    >
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-canvas shadow-modal max-sm:max-h-[90dvh] max-sm:max-w-none max-sm:rounded-b-none max-sm:pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-start justify-between gap-md border-b border-hairline-soft px-lg py-md">
          <div>
            <h3 className="font-semibold text-lg text-ink">Ghép bàn với {mainTable.name}</h3>
            <p className="text-xs text-steel">Các bàn được chọn dùng chung một đơn và một hóa đơn.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-steel hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary max-sm:h-11 max-sm:w-11"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-lg py-md">
          {sections.map((s) => (
            <section key={s.id} className="mb-md last:mb-0">
              <h4 className="mb-xs text-xs font-medium uppercase tracking-wide text-steel">{s.name}</h4>
              <div className="grid grid-cols-3 gap-sm max-sm:grid-cols-2">
                {s.items.map((c) => {
                  const on = c.table.id === mainTable.id || picked.has(c.table.id);
                  return (
                    <button
                      key={c.table.id}
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      aria-disabled={c.locked}
                      disabled={c.locked || busy}
                      onClick={() => toggle(c.table.id)}
                      className={cn(
                        "relative flex min-h-[64px] flex-col items-start justify-between rounded-lg border-2 p-sm text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                        on ? "border-primary bg-cream-soft" : "border-hairline bg-canvas",
                        c.muted && "opacity-50",
                        !c.locked && !busy && "hover:bg-cream-soft"
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "absolute right-xs top-xs grid h-5 w-5 place-items-center rounded border",
                          on ? "border-primary bg-primary text-primary-fg" : "border-hairline-strong bg-canvas"
                        )}
                      >
                        {on && <Check className="h-3.5 w-3.5" />}
                      </span>
                      <span className="pr-lg text-base font-semibold text-ink">{c.table.name}</span>
                      {c.note && <span className="text-[11px] leading-tight text-steel">{c.note}</span>}
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        <div className="border-t border-hairline-soft px-lg py-md">
          {error && (
            <p role="alert" className="mb-sm text-sm text-status-late">
              {error}
            </p>
          )}
          <div className="flex gap-sm">
            <button
              type="button"
              onClick={onClose}
              className="h-12 flex-1 rounded-md border border-hairline-strong text-sm font-medium text-ink hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              Hủy
            </button>
            <button
              type="button"
              disabled={!changed || busy}
              onClick={submit}
              className="flex h-12 flex-[2] items-center justify-center rounded-md bg-primary text-base font-medium text-primary-fg hover:bg-primary-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:bg-hairline disabled:text-muted"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : `Xác nhận (${picked.size + 1} bàn)`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
