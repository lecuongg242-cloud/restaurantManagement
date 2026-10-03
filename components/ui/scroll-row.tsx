"use client";

import { useEffect, useRef, useState, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * Hàng tab cuộn ngang (P27): ẩn thanh cuộn (trên Windows nó hiện như một thanh xám dưới mỗi hàng tab), lăn chuột DỌC thì
 * cuộn NGANG — chuột thường không có trackpad vẫn tới được tab cuối. Còn tab khuất bên phải thì mép phải mờ dần để báo.
 */
export function ScrollRow({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement>(null);
  const [conPhai, setConPhai] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const tinh = () => setConPhai(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
    const lan = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    tinh();
    el.addEventListener("scroll", tinh, { passive: true });
    el.addEventListener("wheel", lan, { passive: false });
    const ro = new ResizeObserver(tinh);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", tinh);
      el.removeEventListener("wheel", lan);
      ro.disconnect();
    };
  }, []);

  return (
    <div
      ref={ref}
      {...rest}
      className={cn(
        "flex overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        conPhai && "[mask-image:linear-gradient(to_right,black_calc(100%-32px),transparent)]",
        className
      )}
    >
      {children}
    </div>
  );
}
