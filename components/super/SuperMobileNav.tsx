"use client";

import { useState } from "react";
import { Drawer } from "vaul";
import { Menu, X } from "lucide-react";
import { SuperNav } from "@/components/super/SuperNav";
import { Button } from "@/components/ui/button";

/** Menu super-admin trên điện thoại / tablet dọc: drawer trái, cùng danh sách mục với sidebar desktop. */
export function SuperMobileNav({
  badges,
  signOut,
}: {
  badges: Record<string, number>;
  signOut: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Drawer.Root open={open} onOpenChange={setOpen} direction="left" repositionInputs={false}>
      <Drawer.Trigger asChild>
        <button
          type="button"
          aria-label="Mở menu quản trị hệ thống"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-md text-ink hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Menu className="h-5 w-5" aria-hidden />
        </button>
      </Drawer.Trigger>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-ink/40" />
        <Drawer.Content className="fixed inset-y-0 left-0 z-50 flex w-[82vw] max-w-xs flex-col bg-canvas shadow-modal outline-none">
          <div className="flex items-center gap-sm border-b border-hairline-soft px-lg py-md">
            <div className="flex min-w-0 flex-1 flex-col leading-tight">
              <Drawer.Title className="text-sm font-medium text-ink">Super Admin</Drawer.Title>
              <Drawer.Description className="text-xs text-steel">Quản trị hệ thống</Drawer.Description>
            </div>
            <Drawer.Close asChild>
              <button
                type="button"
                aria-label="Đóng menu"
                className="grid h-11 w-11 shrink-0 place-items-center rounded-md text-steel hover:bg-surface"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </Drawer.Close>
          </div>
          <SuperNav badges={badges} onNavigate={() => setOpen(false)} />
          <form action={signOut} className="border-t border-hairline-soft p-sm">
            <Button type="submit" variant="secondary" size="md" className="w-full">
              Đăng xuất
            </Button>
          </form>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
