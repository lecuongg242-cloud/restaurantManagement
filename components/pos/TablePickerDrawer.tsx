"use client";

import { useState, type ComponentProps } from "react";
import { Drawer } from "vaul";
import { ChevronDown, LayoutGrid, X } from "lucide-react";
import { TableMap } from "@/components/pos/TableMap";

/**
 * Sơ đồ bàn cho khổ DƯỚI 1024 px (ORDER-19) — iPad/tablet dọc không đủ chỗ cho cột bàn cố định, nên cột
 * đó ẩn đi và thay bằng nút "Bàn: B5 ▾" mở ngăn kéo trái chứa ĐÚNG `TableMap` của khổ lớn (một nguồn sự
 * thật). Chọn bàn / "Khách không bàn" xong ngăn kéo tự đóng. Từ 1024 px trở lên nút này ẩn (`lg:hidden`).
 */
export function TablePickerDrawer({
  label,
  onSelect,
  onSelectTakeaway,
  ...mapProps
}: ComponentProps<typeof TableMap> & { label: string }) {
  const [open, setOpen] = useState(false);

  return (
    <Drawer.Root open={open} onOpenChange={setOpen} direction="left" repositionInputs={false}>
      <Drawer.Trigger asChild>
        <button
          type="button"
          className="inline-flex h-11 shrink-0 items-center gap-xs rounded-md border border-hairline-strong bg-canvas px-md text-sm font-medium text-ink hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary max-sm:hidden lg:hidden"
        >
          <LayoutGrid className="h-4 w-4" aria-hidden />
          <span className="max-w-[9rem] truncate">{label}</span>
          <ChevronDown className="h-4 w-4 text-steel" aria-hidden />
        </button>
      </Drawer.Trigger>

      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-ink/40" />
        <Drawer.Content className="fixed inset-y-0 left-0 z-50 flex w-[88vw] max-w-sm flex-col bg-canvas shadow-modal outline-none">
          <div className="flex items-center justify-between border-b border-hairline-soft px-md py-sm">
            <Drawer.Title className="font-semibold text-lg text-ink">Sơ đồ bàn</Drawer.Title>
            <Drawer.Description className="sr-only">Chọn bàn để gọi món hoặc xem đơn</Drawer.Description>
            <Drawer.Close asChild>
              <button
                type="button"
                aria-label="Đóng sơ đồ bàn"
                className="grid h-11 w-11 place-items-center rounded-md text-steel hover:bg-surface"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </Drawer.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-md">
            <TableMap
              {...mapProps}
              onSelect={(id) => {
                onSelect(id);
                setOpen(false);
              }}
              onSelectTakeaway={
                onSelectTakeaway
                  ? () => {
                      onSelectTakeaway();
                      setOpen(false);
                    }
                  : undefined
              }
            />
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
