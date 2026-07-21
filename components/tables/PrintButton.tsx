"use client";

import { Button } from "@/components/ui/button";

/** Nút in trang QR (window.print). Ẩn khi in qua class no-print ở phần tử cha. */
export function PrintButton() {
  return (
    <Button type="button" variant="primary" size="sm" onClick={() => window.print()}>
      In (khổ A4)
    </Button>
  );
}
