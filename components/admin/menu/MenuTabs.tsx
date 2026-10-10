"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { createCategory, reorderCategories } from "@/app/r/[slug]/admin/(protected)/menu/actions";

const PILL =
  "inline-flex min-h-10 shrink-0 items-center gap-xxs rounded-full border px-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1";

/**
 * Hàng tab danh mục của Thực đơn admin (chủ dự án chốt 04/10/2026): viên thuốc như tab Kho hàng / POS. Bấm tab = lọc (như
 * KiotViet "Nhóm hàng", Sapo "Lọc mặt hàng → Danh mục"). Tab giữ trong `?nhom=` nên sửa / thêm / bật tắt món (revalidate tại
 * chỗ) không nhảy về "Tất cả". Cuối hàng: "+ Danh mục" mở hộp thoại, thêm xong chuyển sang tab danh mục mới.
 * P38 (chốt 10/10/2026): kéo tab danh mục để đổi thứ tự — chuột kéo > 6px, điện thoại chạm giữ, bàn phím Space; bấm vẫn là
 * chọn tab. "Tất cả" và "+ Danh mục" đứng yên.
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
  const idsKey = tabs.map((t) => t.id).join(",");
  const [order, setOrder] = useState(() => tabs.map((t) => t.id));
  const [, startTransition] = useTransition();
  // id cố định cho DndContext — không thì id "DndDescribedBy-N" ở server và trình duyệt lệch nhau (lỗi hydration).
  const dndId = useId();
  // Vừa kéo xong thì nuốt cú click rơi vào tab (không chuyển tab ngoài ý muốn).
  const vuaKeo = useRef(false);
  useEffect(() => setOrder(idsKey ? idsKey.split(",") : []), [idsKey]);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // Chạm giữ 250ms mới kéo — vuốt ngang bình thường vẫn cuộn hàng tab.
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      // Enter để mở tab như link thường; Space nhấc / thả.
      keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space"] },
    })
  );
  const byId = new Map(tabs.map((t) => [t.id, t]));

  function onDragEnd({ active, over }: DragEndEvent) {
    setTimeout(() => (vuaKeo.current = false), 0);
    if (!over || active.id === over.id) return;
    const truoc = order;
    const moi = arrayMove(order, order.indexOf(String(active.id)), order.indexOf(String(over.id)));
    setOrder(moi);
    startTransition(async () => {
      const r = await reorderCategories(slug, moi);
      if (!r.ok) setOrder(truoc);
    });
  }

  return (
    // overflow-x-auto: điện thoại vuốt ngang TRONG hàng tab, không cuộn trang.
    <nav
      aria-label="Danh mục"
      className="-mx-xs flex gap-sm overflow-x-auto px-xs py-xxs"
      onClickCapture={(e) => {
        if (vuaKeo.current) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
    >
      <Tab href={base} label="Tất cả" count={total} on={active === null} />
      <DndContext
        id={dndId}
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={() => (vuaKeo.current = true)}
        onDragEnd={onDragEnd}
        onDragCancel={() => setTimeout(() => (vuaKeo.current = false), 0)}
        accessibility={{
          announcements: {
            onDragStart: () => "Đã nhấc danh mục.",
            onDragOver: () => "Đang di chuyển.",
            onDragEnd: () => "Đã thả danh mục.",
            onDragCancel: () => "Đã hủy, danh mục về chỗ cũ.",
          },
          screenReaderInstructions: {
            draggable: "Nhấn Space để nhấc danh mục, mũi tên trái phải để di chuyển, Space để thả, Esc để hủy. Enter để mở.",
          },
        }}
      >
        <SortableContext items={order} strategy={horizontalListSortingStrategy}>
          {order.map((id) => {
            const t = byId.get(id);
            return t ? (
              <SortableTab key={id} id={id} href={`${base}?nhom=${id}`} label={t.name} count={t.count} on={active === id} />
            ) : null;
          })}
        </SortableContext>
      </DndContext>
      <NewCategoryButton slug={slug} base={base} />
    </nav>
  );
}

type TabProps = { href: string; label: string; count: number; on: boolean };

function Tab({ href, label, count, on }: TabProps) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={on ? "page" : undefined}
      className={cn(PILL, on ? "border-primary bg-primary text-primary-fg" : "border-hairline-strong bg-canvas text-ink hover:bg-surface")}
    >
      {label}
      <span className={cn("tabular-nums", on ? "text-primary-fg/80" : "text-steel")}>{count}</span>
    </Link>
  );
}

function SortableTab({ id, ...p }: TabProps & { id: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  // Bỏ role="button" dnd-kit gắn sẵn: tab vẫn là link.
  const { role: _role, ...attrs } = attributes;
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      // select-none + tắt callout: chạm giữ trên điện thoại là kéo, không bật menu "mở link".
      className={cn("shrink-0 select-none [-webkit-touch-callout:none]", isDragging && "relative z-10 opacity-80")}
      {...attrs}
      {...listeners}
      tabIndex={-1}
      // Trình duyệt tự kéo link (HTML5 drag) sẽ nuốt mất chuột — chặn để dnd-kit nhận.
      onDragStart={(e) => e.preventDefault()}
    >
      <Tab {...p} />
    </div>
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
