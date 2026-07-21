"use client";

/**
 * Nút tải QR của một bàn: PNG (từ data URL) + SVG (từ chuỗi svg → Blob).
 * Tên tệp theo tên bàn. Ẩn khi in (đặt trong .no-print).
 */
export function QrDownload({
  fileBase,
  svg,
  png,
}: {
  fileBase: string;
  svg: string;
  png: string;
}) {
  const safe = fileBase.replace(/[^\p{L}\p{N}_-]+/gu, "-").replace(/^-+|-+$/g, "") || "qr";

  function download(href: string, ext: string, revoke = false) {
    const a = document.createElement("a");
    a.href = href;
    a.download = `${safe}.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    if (revoke) URL.revokeObjectURL(href);
  }

  function downloadSvg() {
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    download(URL.createObjectURL(blob), "svg", true);
  }

  return (
    <div className="mt-xs flex items-center justify-center gap-xs">
      <button
        type="button"
        onClick={() => download(png, "png")}
        className="rounded border border-hairline-strong px-xs py-0.5 text-[11px] text-ink hover:bg-surface"
      >
        Tải PNG
      </button>
      <button
        type="button"
        onClick={downloadSvg}
        className="rounded border border-hairline-strong px-xs py-0.5 text-[11px] text-ink hover:bg-surface"
      >
        Tải SVG
      </button>
    </div>
  );
}
