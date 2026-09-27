import { trangThaiMayIn, type NhipTim } from "@/lib/print/cau-in";
import type { PrintMode } from "@/lib/tenant/settings";

/**
 * Một dòng của bảng cầu in mọi quán ở /super (PRINT-13). Thuần hàm để test được.
 *
 * Sống/chết và máy in dùng lại `trangThaiMayIn` của màn "Máy in" (09-05): hai màn không bao giờ nói
 * hai điều khác nhau về cùng một cầu in.
 */
export type HangCauIn = {
  printMode: PrintMode;
  cauIn: "song" | "chet" | "chua-co";
  mayIn: "ok" | "loi" | "khong-biet";
  /** Phiên bản cầu in báo qua nhịp tim; null = chưa có cầu in hoặc bản trước 11-06. */
  version: number | null;
  /** Thấp hơn bản server đang công bố — tự cập nhật chưa tới hoặc hỏng. */
  banCu: boolean;
  /** Quán dùng cầu in mà cầu in chết / máy in lỗi / bản cũ. Quán in trình duyệt thì không. */
  canChuY: boolean;
};

export function hangCauIn(args: {
  printMode: PrintMode;
  nhip: (NhipTim & { version: number | null }) | null;
  banMoiNhat: number;
  now: number;
}): HangCauIn {
  const { printMode, nhip, banMoiNhat, now } = args;
  const { cauIn, mayIn } = trangThaiMayIn(nhip, now);
  const version = nhip?.version ?? null;
  const coCauIn = cauIn !== "chua-co";
  const banCu = coCauIn && (version === null || version < banMoiNhat);
  const canChuY = printMode === "bridge" && (cauIn !== "song" || mayIn === "loi" || banCu);
  return { printMode, cauIn, mayIn, version, banCu, canChuY };
}
