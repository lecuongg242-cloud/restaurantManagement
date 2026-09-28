"use client";

import { useState, useTransition } from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import type { BatThuongGanDay, NhanXet } from "@/lib/forecast/read";
import { ghiPhanHoiNhanXet } from "@/app/r/[slug]/admin/(protected)/forecast-actions";
import { gioNgayVn } from "@/lib/time/vn";
import { cn } from "@/lib/utils";

const ngayThang = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/**
 * "Nhận xét tuần" + bất thường gần đây (P18 18-03, AI-04/05). Mọi con số trong đoạn văn đã được kiểm khớp dữ liệu
 * trước khi lưu. Nút "Hữu ích / Không hữu ích" ghi phản hồi để chấm chất lượng từng nguồn.
 */
export function InsightCard({ slug, nhanXet, batThuong }: { slug: string; nhanXet: NhanXet | null; batThuong: BatThuongGanDay[] }) {
  const [phanHoi, setPhanHoi] = useState<boolean | null>(nhanXet?.phanHoi ?? null);
  const [dangGhi, startTransition] = useTransition();
  const [loi, setLoi] = useState<string | null>(null);

  const ghi = (useful: boolean) => {
    if (!nhanXet) return;
    setLoi(null);
    startTransition(async () => {
      const r = await ghiPhanHoiNhanXet(slug, nhanXet.id, useful).catch(() => null);
      if (r?.ok) setPhanHoi(useful);
      else setLoi("Chưa ghi được — thử lại.");
    });
  };

  const [doan, goiY] = (nhanXet?.body ?? "").split(/\n\s*Gợi ý:\s*\n?/);

  return (
    <Card data-nhan-xet>
      <div className="flex flex-wrap items-baseline justify-between gap-sm">
        <CardTitle>Nhận xét tuần</CardTitle>
        {nhanXet && (
          <span className="text-xs text-steel">
            Tuần {ngayThang(nhanXet.tuan)} · {nhanXet.model === "mau-cau" ? "tóm tắt tự động" : "viết bởi AI, số đã kiểm"}
          </span>
        )}
      </div>
      {!nhanXet ? (
        <p className="mt-sm text-sm text-slate">Chưa có nhận xét — hệ thống viết vào đêm Chủ nhật sang thứ Hai.</p>
      ) : (
        <>
          <p className="mt-sm whitespace-pre-line text-sm leading-relaxed text-ink">{doan.trim()}</p>
          {goiY && (
            <div className="mt-sm rounded-md bg-cream-soft px-md py-sm">
              <p className="text-xs font-semibold text-steel">Gợi ý</p>
              <ul className="mt-xxs list-disc pl-lg text-sm text-ink">
                {goiY
                  .split("\n")
                  .map((l) => l.replace(/^\s*-\s*/, "").trim())
                  .filter(Boolean)
                  .map((l) => (
                    <li key={l}>{l}</li>
                  ))}
              </ul>
            </div>
          )}
          <div className="mt-sm flex flex-wrap items-center gap-xs text-sm">
            <span className="text-steel">Nhận xét này:</span>
            {([true, false] as const).map((v) => (
              <button
                key={String(v)}
                type="button"
                disabled={dangGhi}
                onClick={() => ghi(v)}
                aria-pressed={phanHoi === v}
                className={cn(
                  "inline-flex min-h-[36px] items-center gap-xxs rounded-md border px-sm",
                  phanHoi === v ? "border-primary bg-primary/10 text-ink" : "border-hairline-strong bg-canvas text-slate hover:bg-surface"
                )}
              >
                {v ? <ThumbsUp className="h-3.5 w-3.5" aria-hidden /> : <ThumbsDown className="h-3.5 w-3.5" aria-hidden />}
                {v ? "Hữu ích" : "Không hữu ích"}
              </button>
            ))}
            {loi && <span className="text-status-late">{loi}</span>}
          </div>
        </>
      )}
      {batThuong.length > 0 && (
        <div className="mt-md border-t border-hairline-soft pt-sm" data-bat-thuong>
          <p className="text-xs font-semibold text-steel">Bất thường gần đây</p>
          <ul className="mt-xxs text-sm text-ink">
            {batThuong.map((b) => (
              <li key={b.id} className="py-xxs">
                <span className="text-xs text-steel">{gioNgayVn(b.luc)} · </span>
                {b.body}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
