/**
 * Nội dung chip "thiết bị in" trên thanh công cụ POS. Thuần hàm.
 *
 * Mỗi trạng thái nói MỘT điều nhân viên hiểu ngay. Cầu in chết thì nói về cầu in, không nói về máy
 * in: lúc đó không kiểm được máy in, và "máy in không rõ" không giúp nhân viên làm gì cả.
 */
import type { trangThaiMayIn } from "@/lib/print/cau-in";

export type ToneThietBi = "tot" | "xau" | "chua-ro";

export function nhanThietBiIn(tt: ReturnType<typeof trangThaiMayIn>): { tone: ToneThietBi; nhan: string } {
  if (tt.cauIn === "chua-co") return { tone: "chua-ro", nhan: "Chưa có cầu in" };
  if (tt.cauIn === "chet") return { tone: "xau", nhan: "Cầu in mất kết nối" };
  if (tt.mayIn === "ok") return { tone: "tot", nhan: "Máy in bếp sẵn sàng" };
  if (tt.mayIn === "loi") return { tone: "xau", nhan: "Máy in bếp không phản hồi" };
  return { tone: "chua-ro", nhan: "Máy in bếp: chưa rõ" };
}
