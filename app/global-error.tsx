"use client";

import { useEffect } from "react";

/**
 * Lưới cuối cùng của App Router: lỗi mà không `error.tsx` nào bắt (kể cả lỗi ở layout gốc). Thay cả
 * `<html>`, nên không dùng được font/theme của app — giữ tối giản.
 *
 * KHÔNG gắn Sentry phía trình duyệt (OPS-10): SDK client thêm ~67 kB JS cho MỌI trang, kể cả thực đơn
 * khách quét QR trên điện thoại (đo 26/09/2026: 102 → 169 kB). Lỗi tiền/DB/server action đã được bắt ở
 * server qua `instrumentation.ts`.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="vi">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: 24, textAlign: "center" }}>
        <h1 style={{ fontSize: 20 }}>Đã có lỗi xảy ra</h1>
        <p>Bấm thử lại, hoặc tải lại trang.</p>
        <button
          type="button"
          onClick={reset}
          style={{ marginTop: 16, minHeight: 44, padding: "0 20px", fontSize: 16 }}
        >
          Thử lại
        </button>
      </body>
    </html>
  );
}
