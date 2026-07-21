"use client";

/**
 * Nút submit có bước xác nhận (confirm) — chặn thao tác phá hủy 1-click
 * (UX rule: Confirmation Dialogs, severity High). Dùng được bên trong <form>
 * render từ Server Component (chỉ nhận props serializable).
 */
export function ConfirmSubmit({
  message,
  children,
  className,
}: {
  message: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="submit"
      onClick={(e) => {
        if (!confirm(message)) e.preventDefault();
      }}
      className={className}
    >
      {children}
    </button>
  );
}
