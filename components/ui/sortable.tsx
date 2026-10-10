"use client";

import { createContext, useContext, useEffect, useId, useRef, useState, useTransition } from "react";
import type { ReactNode } from "react";
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DraggableAttributes,
  type DraggableSyntheticListeners,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Danh sách kéo thả dùng chung (P38 — món, khu vực, bàn; chủ dự án chốt 10/10/2026): giữ tay nắm ⠿ (`DragHandle`, đặt ở
 * đâu trong ô cũng được) rồi kéo; thả ra gọi `onSave` với CẢ thứ tự mới. Hiện thứ tự mới ngay, lưu lỗi → về thứ tự cũ
 * (toast lỗi do server action ghi). Bàn phím: Tab tới tay nắm, Space nhấc, mũi tên, Space thả, Esc hủy.
 * `activation="press"`: không có tay nắm, kéo cả ô — chuột kéo > 6px, điện thoại chạm giữ 250ms (vuốt vẫn cuộn), Space;
 * bấm thường vẫn là bấm (dùng cho chip khu vực trên điện thoại).
 */
type Handle = {
  attributes: DraggableAttributes;
  listeners: DraggableSyntheticListeners;
  setActivatorNodeRef: (el: HTMLElement | null) => void;
};
const HandleCtx = createContext<Handle | null>(null);

export function SortableList({
  ids,
  onSave,
  layout = "grid",
  activation = "handle",
  as: Box = "div",
  cellAs = "div",
  noun,
  className,
  cellClassName,
  children,
  tail,
  wrap,
}: {
  ids: string[];
  onSave: (ids: string[]) => Promise<{ ok: boolean }>;
  layout?: "grid" | "vertical" | "horizontal";
  activation?: "handle" | "press";
  /** Thẻ bọc danh sách / từng ô — `tbody`+`tr` cho bảng, `ul`+`li` cho danh sách. */
  as?: "div" | "ul" | "tbody";
  cellAs?: "div" | "li" | "tr";
  /** "món", "bàn", "khu vực" — cho lời đọc màn hình. */
  noun: string;
  className?: string;
  cellClassName?: string | ((id: string) => string | undefined);
  children: (id: string) => ReactNode;
  /** Ô đứng cuối danh sách, không kéo được (vd "+ Thêm món"). */
  tail?: ReactNode;
  /** Bọc danh sách mà vẫn để DndContext (có <div> thông báo) ở ngoài — vd `<table>` quanh `<tbody>`. */
  wrap?: (list: ReactNode) => ReactNode;
}) {
  const idsKey = ids.join(",");
  const [state, setOrder] = useState(ids);
  // Server vừa đổi danh sách (thêm / xóa) mà effect chưa chạy: thứ tự đang giữ có id đã mất → theo danh sách mới ngay,
  // không render id không còn (con sẽ không tìm thấy dữ liệu).
  const order = state.length === ids.length && ids.every((id) => state.includes(id)) ? state : ids;
  const [, startTransition] = useTransition();
  // id cố định cho DndContext — không thì id "DndDescribedBy-N" ở server và trình duyệt lệch nhau (lỗi hydration).
  const dndId = useId();
  // Server dựng lại (thêm / xóa, lưu xong) → theo danh sách mới.
  useEffect(() => setOrder(idsKey ? idsKey.split(",") : []), [idsKey]);

  const press = activation === "press";
  // Vừa kéo xong (chế độ press) thì nuốt cú click rơi vào ô — không bấm nhầm.
  const vuaKeo = useRef(false);
  const pointer = useSensor(PointerSensor, { activationConstraint: { distance: 4 } });
  const mouse = useSensor(MouseSensor, { activationConstraint: { distance: 6 } });
  const touch = useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } });
  const keyboard = useSensor(KeyboardSensor, {
    coordinateGetter: sortableKeyboardCoordinates,
    // press: Enter để bấm ô như thường, chỉ Space nhấc / thả.
    ...(press ? { keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space"] } } : {}),
  });
  const sensors = useSensors(...(press ? [mouse, touch, keyboard] : [pointer, keyboard]));

  const viTri = (id: string | number) => `vị trí ${order.indexOf(String(id)) + 1} trên ${order.length}`;

  function onDragEnd({ active, over }: DragEndEvent) {
    setTimeout(() => (vuaKeo.current = false), 0);
    if (!over || active.id === over.id) return;
    const truoc = order;
    const moi = arrayMove(order, order.indexOf(String(active.id)), order.indexOf(String(over.id)));
    setOrder(moi);
    startTransition(async () => {
      const r = await onSave(moi);
      if (!r.ok) setOrder(truoc);
    });
  }

  const list = (
    <SortableContext
      items={order}
      strategy={
        layout === "grid" ? rectSortingStrategy : layout === "vertical" ? verticalListSortingStrategy : horizontalListSortingStrategy
      }
    >
      <Box
        className={className}
        onClickCapture={(e) => {
          if (vuaKeo.current) {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
      >
        {order.map((id) => (
          <SortableCell
            key={id}
            id={id}
            as={cellAs}
            press={press}
            className={typeof cellClassName === "function" ? cellClassName(id) : cellClassName}
          >
            {children(id)}
          </SortableCell>
        ))}
        {tail}
      </Box>
    </SortableContext>
  );

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={() => (vuaKeo.current = true)}
      onDragEnd={onDragEnd}
      onDragCancel={() => setTimeout(() => (vuaKeo.current = false), 0)}
      accessibility={{
        announcements: {
          onDragStart: ({ active }) => `Đã nhấc ${noun}, ${viTri(active.id)}.`,
          onDragOver: ({ over }) => (over ? `Đang ở ${viTri(over.id)}.` : `Ngoài danh sách.`),
          onDragEnd: ({ over }) => (over ? `Đã thả ${noun} vào ${viTri(over.id)}.` : `Đã thả ${noun}.`),
          onDragCancel: () => `Đã hủy, ${noun} về chỗ cũ.`,
        },
        screenReaderInstructions: {
          draggable: `Nhấn Space để nhấc ${noun}, dùng phím mũi tên để di chuyển, Space để thả, Esc để hủy.`,
        },
      }}
    >
      {wrap ? wrap(list) : list}
    </DndContext>
  );
}

function SortableCell({
  id,
  as: Cell,
  press,
  className,
  children,
}: {
  id: string;
  as: "div" | "li" | "tr";
  press: boolean;
  className?: string;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });
  // Chế độ press: cả ô là chỗ nắm. Bỏ role="button" dnd-kit gắn sẵn — bên trong đã có nút thật.
  const { role: _role, ...attrs } = attributes;
  return (
    // empty:hidden — ô bị lọc mất nội dung (vd ô tìm món) thì không để lại lỗ trống trong lưới.
    <Cell
      ref={setNodeRef as (el: HTMLElement | null) => void}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        "empty:hidden",
        press && "select-none [-webkit-touch-callout:none]",
        className,
        isDragging && "relative z-10 opacity-90 shadow-modal"
      )}
      {...(press ? { ...attrs, ...listeners, tabIndex: -1, onDragStart: (e: React.DragEvent) => e.preventDefault() } : {})}
    >
      <HandleCtx.Provider value={{ attributes, listeners, setActivatorNodeRef }}>{children}</HandleCtx.Provider>
    </Cell>
  );
}

/** Tay nắm ⠿ — phải nằm trong một ô của `SortableList`. */
export function DragHandle({ label, className }: { label: string; className?: string }) {
  const h = useContext(HandleCtx);
  if (!h) return null;
  return (
    <button
      type="button"
      ref={h.setActivatorNodeRef}
      {...h.attributes}
      {...h.listeners}
      aria-label={`Kéo để sắp xếp: ${label}`}
      // touch-none: chạm giữ tay nắm là kéo, không cuộn trang; vuốt chỗ khác vẫn cuộn bình thường.
      className={cn(
        "grid w-6 shrink-0 cursor-grab touch-none place-items-center rounded-md text-muted hover:bg-surface hover:text-steel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary active:cursor-grabbing",
        className
      )}
    >
      <GripVertical className="h-4 w-4" aria-hidden />
    </button>
  );
}
