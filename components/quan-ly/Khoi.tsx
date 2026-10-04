import { cn } from "@/lib/utils";

/** Khối nội dung của app Quản lý — thẻ trắng viền mảnh, tiêu đề nhỏ (một cột điện thoại). */
export function Khoi({ tieuDe, className, children }: { tieuDe?: string; className?: string; children: React.ReactNode }) {
  return (
    <section className={cn("rounded-lg border border-hairline-soft bg-canvas p-md shadow-card", className)}>
      {tieuDe && <h2 className="mb-sm text-sm font-medium text-ink">{tieuDe}</h2>}
      {children}
    </section>
  );
}

/** Ô số nhỏ (hàng 3 thẻ của Tổng quan, Giao diện B5). */
export function TheSo({ nhan, so, phu }: { nhan: string; so: string; phu?: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-hairline-soft bg-canvas p-sm shadow-card">
      <p className="truncate text-xs text-steel">{nhan}</p>
      <p className="mt-xxs truncate text-lg font-semibold tabular-nums text-ink">{so}</p>
      {phu && <p className="truncate text-xs text-steel">{phu}</p>}
    </div>
  );
}

/** Trạng thái trống (Giao diện B10). */
export function Trong({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border border-dashed border-hairline-strong bg-canvas px-md py-xl text-center text-sm text-steel">{children}</p>;
}
