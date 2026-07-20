"use client";

export function PrintButton({ className }: { className?: string }) {
  return (
    <button
      onClick={() => window.print()}
      className={
        className ??
        "min-h-11 cursor-pointer rounded-full bg-primary px-5 font-medium text-on-primary"
      }
    >
      In / Lưu PDF
    </button>
  );
}
