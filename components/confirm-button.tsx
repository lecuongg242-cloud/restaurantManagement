"use client";

/**
 * Nút submit có hỏi xác nhận (dùng cho thao tác xóa — thiết kế P2 §4).
 * Đặt bên trong <form action={...}>.
 */
export function ConfirmButton({
  message,
  className,
  children,
}: {
  message: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
