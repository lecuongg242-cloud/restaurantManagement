"use client";

import { useState } from "react";
import { Drawer } from "vaul";
import { Menu, X } from "lucide-react";
import { AdminNav } from "@/components/admin/AdminNav";
import { Button } from "@/components/ui/button";
import type { TenantInfo, Role } from "@/lib/auth/session";

/**
 * Điều hướng admin trên mobile/tablet dọc: nút hamburger mở drawer trái chứa ĐÚNG nội dung
 * sidebar desktop (thương hiệu + AdminNav + đăng xuất) — một nguồn sự thật cho danh sách mục.
 *
 * direction="left" khớp vị trí sidebar desktop nên khi xoay ngang/đổi thiết bị người dùng
 * không phải học lại chỗ. Chọn mục xong drawer tự đóng (`onNavigate`).
 */
export function AdminMobileNav({
  tenant,
  role,
  base,
  signOut,
  planCard,
}: {
  tenant: TenantInfo;
  role: Role;
  base: string;
  signOut: () => Promise<void>;
  planCard?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Drawer.Root
      open={open}
      onOpenChange={setOpen}
      direction="left"
      repositionInputs={false}
    >
      <Drawer.Trigger asChild>
        <button
          type="button"
          aria-label="Mở menu quản trị"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-md text-ink hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Menu className="h-5 w-5" aria-hidden />
        </button>
      </Drawer.Trigger>

      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-ink/40" />
        <Drawer.Content className="fixed inset-y-0 left-0 z-50 flex w-[82vw] max-w-xs flex-col bg-canvas shadow-modal outline-none">
          <div className="flex items-center gap-sm border-b border-hairline-soft px-lg py-md">
            {tenant.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={tenant.logo_url}
                alt=""
                className="h-9 w-9 shrink-0 rounded-md object-cover"
              />
            ) : (
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-primary text-base font-semibold text-primary-fg">
                {tenant.name.charAt(0).toUpperCase()}
              </span>
            )}
            <div className="flex min-w-0 flex-1 flex-col leading-tight">
              <Drawer.Title className="truncate text-sm font-medium text-ink">
                {tenant.name}
              </Drawer.Title>
              <Drawer.Description className="text-xs text-steel">{role}</Drawer.Description>
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

          <AdminNav base={base} role={role} onNavigate={() => setOpen(false)} />

          {planCard}

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
