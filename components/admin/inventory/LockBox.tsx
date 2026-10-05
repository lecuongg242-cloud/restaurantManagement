import Link from "next/link";
import { LOCK_HOWTO, lockLines, type LockConflict } from "@/lib/inventory/lock";

/**
 * Khung đỏ "vướng kiểm kê" (P34, QD-034 D2 — như iPOS: không ghi được chứng từ trước lần kiểm kê đã hoàn thành). Nêu từng
 * phiếu kiểm kê cần hủy kèm link mở nó ở tab "Kiểm kê & hủy".
 */
export function LockBox({ title, conflicts, countHref }: { title: string; conflicts: LockConflict[]; countHref: string }) {
  if (conflicts.length === 0) return null;
  const counts = [...new Map(conflicts.map((c) => [c.count_id, c.code])).entries()];
  return (
    <div role="alert" data-vuong-kiem-ke className="rounded-md border border-status-late/40 bg-status-late/5 px-md py-sm text-sm">
      <p className="font-medium text-status-late">{title}</p>
      <ul className="mt-xxs list-disc pl-lg text-ink">
        {lockLines(conflicts).map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
      <p className="mt-xxs text-slate">{LOCK_HOWTO}</p>
      <div className="mt-xs flex flex-wrap gap-sm">
        {counts.map(([id, code]) => (
          <Link
            key={id}
            href={`${countHref}#kk-${id}`}
            className="inline-flex min-h-9 items-center rounded-md border border-hairline-strong bg-canvas px-md text-ink hover:bg-surface"
          >
            Mở phiếu {code}
          </Link>
        ))}
      </div>
    </div>
  );
}
