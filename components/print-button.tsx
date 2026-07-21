"use client";

export function PrintButton({ className }: { className?: string }) {
  return (
    <button
      onClick={() => window.print()}
      className={
        className ??
        "inline-flex min-h-11 cursor-pointer items-center justify-center rounded-full bg-primary px-6 text-sm font-semibold text-on-primary transition-opacity duration-200 hover:opacity-85"
      }
    >
      In / Lưu PDF
    </button>
  );
}
