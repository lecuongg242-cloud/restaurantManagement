"use client";

import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Ô tìm kiếm dạng viên thuốc — dùng CHUNG cho mọi chỗ tìm trên POS (tìm bàn/số đơn ở thanh trên,
 * tìm trong lịch sử đơn ở panel). Viết riêng từng chỗ thì kích thước/bo góc trôi mỗi nơi một kiểu,
 * mà hai ô này thay phiên nhau xuất hiện đúng một vị trí nên lệch là thấy ngay.
 *
 * `children` để nhét bảng gợi ý kết quả — nó neo tuyệt đối vào chính khung này.
 */
export function SearchField({
  value,
  onChange,
  placeholder,
  ariaLabel,
  className,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  ariaLabel: string;
  /** Bề rộng / vị trí do nơi gọi quyết định. */
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("relative", className)}>
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-steel"
        aria-hidden
      />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && onChange("")}
        inputMode="search"
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="h-11 w-full rounded-full border border-hairline-strong bg-canvas pl-9 pr-9 text-base text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 lg:text-sm"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Xóa tìm kiếm"
          className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-steel hover:bg-surface"
        >
          <X className="h-4 w-4" />
        </button>
      )}
      {children}
    </div>
  );
}
