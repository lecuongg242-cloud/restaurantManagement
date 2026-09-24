"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Printer } from "lucide-react";
import { getCauInStatus, type CauInStatus } from "@/app/r/[slug]/print/actions";
import { gioVn } from "@/lib/time/vn";

/**
 * Băng sức khỏe cầu in bếp trên POS (PRINT-07/08).
 *
 * VÌ SAO: 24/09/2026 cầu in qt-food chết khi xóa database Mỹ và không ai biết — POS không có chỗ
 * nào nói ra điều đó. Các hệ thống POS thương mại đều hiện "máy in bếp mất kết nối" ngay trên màn
 * thu ngân; đây là bản tương đương.
 *
 * Chỉ hiện ở chế độ cầu in. Hỏi lại 30 giây/lần — khớp nhịp tim, hỏi dày hơn không biết thêm gì.
 */
const BRIDGE = process.env.NEXT_PUBLIC_PRINT_MODE === "bridge";
const HOI_LAI_MS = 30_000;

function docMoc(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null; // trình duyệt chặn lưu trữ → coi như chưa bấm "Đã xử lý"
  }
}

export function CauInBanner({ slug }: { slug: string }) {
  const [st, setSt] = useState<CauInStatus | null>(null);
  const key = `cau-in-da-xu-ly:${slug}`;

  const refresh = useCallback(async () => {
    const r = await getCauInStatus(slug, docMoc(key)).catch(() => null);
    if (r) setSt(r);
  }, [slug, key]);

  useEffect(() => {
    if (!BRIDGE) return;
    refresh();
    const id = setInterval(refresh, HOI_LAI_MS);
    return () => clearInterval(id);
  }, [refresh]);

  if (!BRIDGE || !st) return null;

  /**
   * "Đã xử lý" lưu mốc của LỖI MỚI NHẤT (giờ database), không phải giờ máy POS — để chỉ lỗi xảy ra
   * sau đó mới làm băng hiện lại. Lưu theo từng máy: máy khác chưa ai xử lý thì vẫn phải thấy.
   */
  const daXuLy = () => {
    if (st.loiMoiNhat) {
      try {
        localStorage.setItem(key, st.loiMoiNhat);
      } catch {
        /* không lưu được thì băng hiện lại ở lần hỏi sau — chấp nhận, còn hơn im lặng */
      }
    }
    setSt({ ...st, canhBao: false });
    refresh();
  };

  return (
    <>
      {/* Mất kết nối: server đã tự chuyển phiếu bếp sang in trình duyệt. Nói rõ phiếu RA Ở ĐÂU —
          in trình duyệt đi ra máy in cài trên chính máy này, thường là máy in hóa đơn ở quầy. */}
      {!st.conSong && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-sm border-b-2 border-status-late bg-cream-soft px-lg py-sm"
        >
          <Printer className="h-4 w-4 shrink-0 text-status-late" aria-hidden />
          <span className="text-sm font-bold text-ink">
            {st.seenAt
              ? `Cầu in bếp mất kết nối từ ${gioVn(st.seenAt)}.`
              : "Chưa có cầu in bếp nào kết nối."}
          </span>
          <span className="text-sm text-slate">
            Phiếu bếp đang in ra máy in của máy này — mang phiếu vào bếp.
          </span>
        </div>
      )}

      {/* Lỗi dồn dập: cầu in sống nhưng máy in không nhận (hết giấy, rút dây, tắt nguồn). */}
      {st.canhBao && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-sm border-b-2 border-status-late bg-status-late/10 px-lg py-sm"
        >
          <AlertTriangle className="h-4 w-4 shrink-0 text-status-late" aria-hidden />
          <span className="text-sm font-bold text-ink">
            Máy in bếp lỗi {st.soLoi} phiếu trong 5 phút
          </span>
          <span className="text-sm text-slate">— kiểm tra giấy, dây mạng, nguồn máy in bếp.</span>
          <button
            type="button"
            onClick={daXuLy}
            className="ml-auto inline-flex min-h-[44px] items-center rounded-md border border-hairline-strong bg-canvas px-lg text-sm font-semibold text-ink hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            Đã xử lý
          </button>
        </div>
      )}
    </>
  );
}
