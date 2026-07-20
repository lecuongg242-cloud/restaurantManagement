"use client";

import { useState } from "react";

/** Hiện URL đầy đủ (origin + path) kèm nút copy. */
export function CopyLink({ path }: { path: string }) {
  const [copied, setCopied] = useState(false);
  const url =
    typeof window !== "undefined" ? `${window.location.origin}${path}` : path;

  return (
    <div className="flex items-center gap-2">
      <code className="flex-1 overflow-x-auto rounded-md bg-foreground/5 px-2 py-1.5 text-xs">
        {url}
      </code>
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
        className="min-h-9 shrink-0 rounded-md border border-foreground/20 px-3 text-sm font-medium"
      >
        {copied ? "Đã copy ✓" : "Copy"}
      </button>
    </div>
  );
}
