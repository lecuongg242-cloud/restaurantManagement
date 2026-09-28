/**
 * Chi nhánh đang mở cửa không (P15 15-05) — theo giờ VIỆT NAM, không theo giờ máy chủ (Vercel = UTC, bài học
 * BUG-GioLechMuiGio). Giờ đóng < giờ mở = mở qua nửa đêm (vd 17:00–02:00). Thiếu giờ → null (không hiện nhãn).
 */
export function dangMoCua(open: string, close: string, now: Date = new Date()): boolean | null {
  if (!open || !close) return null;
  const phut = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
  const vn = new Date(now.getTime() + 7 * 3600e3);
  const bayGio = vn.getUTCHours() * 60 + vn.getUTCMinutes();
  const mo = phut(open);
  const dong = phut(close);
  if (mo === dong) return true; // mở cả ngày
  return mo < dong ? bayGio >= mo && bayGio < dong : bayGio >= mo || bayGio < dong;
}
