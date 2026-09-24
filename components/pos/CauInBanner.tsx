"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Printer } from "lucide-react";
import { getCauInStatus, type CauInStatus } from "@/app/r/[slug]/print/actions";
import { gioVn } from "@/lib/time/vn";
import { nhanThietBiIn, type ToneThietBi } from "@/lib/print/nhan-thiet-bi";

/**
 * Sức khỏe cầu in + máy in bếp trên POS (PRINT-07/08/09).
 *
 * VÌ SAO: 24/09/2026 cầu in qt-food chết khi xóa database Mỹ và không ai biết — POS không có chỗ
 * nào nói ra điều đó. Các hệ thống POS thương mại đều hiện trạng thái máy in bếp ngay trên màn thu
 * ngân; đây là bản tương đương.
 *
 * Ba phần dùng chung MỘT lần hỏi server (`useCauIn`): chip thường trực trên thanh công cụ, băng khi
 * có sự cố, và nút "Đã xử lý". Chỉ chạy ở chế độ cầu in. Hỏi lại 30 giây/lần — khớp nhịp tim, hỏi
 * dày hơn không biết thêm gì.
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

export function useCauIn(slug: string): { st: CauInStatus | null; daXuLy: () => void } {
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

  /**
   * "Đã xử lý" lưu mốc của LỖI MỚI NHẤT (giờ database), không phải giờ máy POS — để chỉ lỗi xảy ra
   * sau đó mới làm băng hiện lại. Lưu theo từng máy: máy khác chưa ai xử lý thì vẫn phải thấy.
   */
  const daXuLy = () => {
    if (!st) return;
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

  return { st: BRIDGE ? st : null, daXuLy };
}

const CHIP: Record<ToneThietBi, string> = {
  tot: "border-status-ready/30 bg-status-ready-bg text-status-ready",
  xau: "border-status-late/40 bg-status-late/10 text-status-late",
  "chua-ro": "border-hairline-strong bg-surface text-steel",
};
const CHAM: Record<ToneThietBi, string> = {
  tot: "bg-status-ready",
  xau: "bg-status-late",
  "chua-ro": "bg-steel",
};

/**
 * Chip thường trực trên thanh công cụ POS. Màn hẹp chỉ còn biểu tượng + chấm màu; chữ đầy đủ nằm
 * trong `aria-label` và `title` (rê chuột thấy IP + lần kiểm).
 */
export function ThietBiInChip({ st }: { st: CauInStatus | null }) {
  if (!st) return null;
  const { tone, nhan } = nhanThietBiIn(st.thietBi);
  const chiTiet = [
    nhan,
    st.printerHost ? `Máy in ${st.printerHost}` : null,
    st.printerCheckedAt && st.thietBi.mayIn !== "khong-biet" ? `kiểm lúc ${gioVn(st.printerCheckedAt)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <span
      role="status"
      aria-label={chiTiet}
      title={chiTiet}
      className={`inline-flex h-11 shrink-0 items-center gap-xs rounded-md border px-md text-sm font-medium ${CHIP[tone]}`}
    >
      <Printer className="h-4 w-4" aria-hidden />
      <span className={`h-2 w-2 rounded-full ${CHAM[tone]}`} aria-hidden />
      <span className="hidden lg:inline">{nhan}</span>
    </span>
  );
}

export function CauInBanner({ st, onDaXuLy }: { st: CauInStatus | null; onDaXuLy: () => void }) {
  if (!st) return null;
  const mayInChet = st.conSong && st.thietBi.mayIn === "loi";

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

      {/* Cầu in sống nhưng máy in không nhận (PRINT-09): phiếu vẫn vào hàng đợi rồi sẽ lỗi. Báo
          TRƯỚC khi có phiếu lỗi, thay vì đợi chip đỏ ở từng đơn. */}
      {mayInChet && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-sm border-b-2 border-status-late bg-status-late/10 px-lg py-sm"
        >
          <AlertTriangle className="h-4 w-4 shrink-0 text-status-late" aria-hidden />
          <span className="text-sm font-bold text-ink">
            Máy in bếp không phản hồi{st.printerHost ? ` (${st.printerHost})` : ""}
          </span>
          <span className="text-sm text-slate">
            — kiểm tra nguồn, dây mạng, giấy. Phiếu bếp gửi lúc này sẽ báo lỗi.
          </span>
        </div>
      )}

      {/* Lỗi dồn dập (PRINT-07). Không hiện chồng lên băng "máy in không phản hồi" — cùng một sự
          cố, hai băng đỏ chỉ làm nhân viên đọc hai lần. */}
      {st.canhBao && !mayInChet && (
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
            onClick={onDaXuLy}
            className="ml-auto inline-flex min-h-[44px] items-center rounded-md border border-hairline-strong bg-canvas px-lg text-sm font-semibold text-ink hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            Đã xử lý
          </button>
        </div>
      )}
    </>
  );
}
