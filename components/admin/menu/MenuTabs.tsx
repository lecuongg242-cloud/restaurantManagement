"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { createCategory } from "@/app/r/[slug]/admin/(protected)/menu/actions";

const PILL =
  "inline-flex min-h-10 shrink-0 items-center gap-xxs rounded-full border px-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1";

/**
 * Hàng tab danh mục của Thực đơn admin (chủ dự án chốt 04/10/2026): viên thuốc như tab Kho hàng / POS. Bấm tab = lọc (như
 * KiotViet "Nhóm hàng", Sapo "Lọc mặt hàng → Danh mục"). Tab giữ trong `?nhom=` nên sửa / thêm / bật tắt món (revalidate tại
 * chỗ) không nhảy về "Tất cả". Cuối hàng: "+ Danh mục" mở hộp thoại, thêm xong chuyển sang tab danh mục mới.
 */
export function MenuTabs({
  slug,
  tabs,
  total,
  active,
}: {
  slug: string;
  tabs: { id: string; name: string; count: number }[];
  total: number;
  /** id danh mục đang chọn; null = Tất cả. */
  active: string | null;
}) {
  const base = `/r/${slug}/admin/menu`;
  const tab = (href: string, label: string, count: number, on: boolean) => (
    <Link
      key={href}
      href={href}
      scroll={false}
      aria-current={on ? "page" : undefined}
      className={cn(PILL, on ? "border-primary bg-primary text-primary-fg" : "border-hairline-strong bg-canvas text-ink hover:bg-surface")}
    >
      {label}
      <span className={cn("tabular-nums", on ? "text-primary-fg/80" : "text-steel")}>{count}</span>
    </Link>
  );

  return (
    // overflow-x-auto: điện thoại vuốt ngang TRONG hàng tab, không cuộn trang.
    <nav aria-label="Danh mục" className="-mx-xs flex gap-sm overflow-x-auto px-xs py-xxs">
      {tab(base, "Tất cả", total, active === null)}
      {tabs.map((t) => tab(`${base}?nhom=${t.id}`, t.name, t.count, active === t.id))}
      <NewCategoryButton slug={slug} base={base} />
    </nav>
  );
}

function NewCategoryButton({ slug, base }: { slug: string; base: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [round, setRound] = useState(0);
  const close = () => dialog.current?.close();

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setRound((n) => n + 1);
          dialog.current?.showModal();
        }}
        className={cn(PILL, "border-dashed border-hairline-strong bg-canvas text-primary hover:bg-cream-soft")}
      >
        + Danh mục
      </button>
      <dialog
        ref={dialog}
        aria-labelledby="them-danh-muc"
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-lg border border-hairline-soft bg-canvas p-0 text-ink shadow-modal backdrop:bg-ink/40"
      >
        <form
          key={round}
          action={async (fd) => {
            setError(null);
            const r = await createCategory(fd);
            if (!r.ok) return setError(r.error);
            close();
            router.push(`${base}?nhom=${r.id}`, { scroll: false });
          }}
          className="flex flex-col"
        >
          <div className="flex items-center justify-between gap-md border-b border-hairline-soft px-lg py-md">
            <h2 id="them-danh-muc" className="text-xl font-semibold">
              Thêm danh mục
            </h2>
            <button
              type="button"
              onClick={close}
              aria-label="Đóng"
              className="grid h-9 w-9 place-items-center rounded-md text-steel hover:bg-surface"
            >
              ✕
            </button>
          </div>
          <div className="px-lg py-md">
            <input type="hidden" name="slug" value={slug} />
            <label className="flex flex-col gap-xxs text-sm text-slate">
              Tên danh mục *
              <Input name="name" required autoFocus placeholder="Món nước" />
            </label>
            {error && (
              <p role="alert" className="mt-md rounded-md bg-cream-soft px-md py-sm text-sm text-status-late">
                {error}
              </p>
            )}
          </div>
          <div className="flex justify-end gap-sm border-t border-hairline-soft px-lg py-md">
            <button
              type="button"
              onClick={close}
              className="inline-flex h-11 items-center rounded-md border border-hairline-strong px-lg text-sm text-ink hover:bg-surface"
            >
              Bỏ qua
            </button>
            <SubmitButton pendingLabel="Đang lưu…">Lưu</SubmitButton>
          </div>
        </form>
      </dialog>
    </>
  );
}
