/**
 * Thông báo kết quả in cho người đang cầm máy (PRINT-16). Adapter in chạy ngoài cây React (hàm thường),
 * nên báo qua sự kiện `window`; `PrintModeProvider` hiển thị. Không có ai nghe thì im lặng.
 */
export type ThongBaoIn = { loai: "ok" | "loi"; noiDung: string };

export const SU_KIEN_THONG_BAO_IN = "thong-bao-in";

export function baoIn(loai: ThongBaoIn["loai"], noiDung: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ThongBaoIn>(SU_KIEN_THONG_BAO_IN, { detail: { loai, noiDung } }));
}
