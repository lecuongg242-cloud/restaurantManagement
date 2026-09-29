// desktop/lib/cap-nhat.mjs — luật "được cài bản cập nhật lúc này chưa" (DESK-10). Hàm thuần, không import electron.
//
// Bản mới đã tải xong chỉ được cài khi KHÔNG làm gián đoạn bán hàng: không ai đang thao tác trên máy (thu ngân đang
// bấm dở hóa đơn mà app tắt là mất thao tác), và cầu in thoát được ở điểm an toàn (main.mjs xin cầu in thoát trước,
// cầu in chỉ thoát giữa hai lượt poll — không bỏ dở phiếu đang gửi).

/** Máy để yên chừng này giây mới tự cài. */
export const YEN_TOI_THIEU_GIAY = 5 * 60;

/** Kiểm bản mới mỗi giờ (và lúc mở app). */
export const KIEM_MOI_MS = 60 * 60_000;

/** @param {{ daTaiXong: boolean, giayKhongThaoTac: number, dangTatApp: boolean }} s */
export function duocCaiBanMoi({ daTaiXong, giayKhongThaoTac, dangTatApp }) {
  if (!daTaiXong) return false;
  if (dangTatApp) return true;
  return giayKhongThaoTac >= YEN_TOI_THIEU_GIAY;
}
