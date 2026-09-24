/**
 * Sức khỏe cầu in bếp (09-03). Thuần hàm — dùng được ở server lẫn client, test được không cần DB.
 *
 * VÌ SAO: ngày 24/09/2026 cầu in qt-food chết khi xóa database Mỹ và không ai biết. Nút "Phiếu
 * bếp" ở chế độ cầu in chỉ XẾP phiếu vào hàng đợi; POS có sẵn đường lui sang in trình duyệt nhưng
 * chỉ bật khi xếp hàng THẤT BẠI. Cầu in chết thì xếp hàng vẫn thành công → phiếu nằm `pending` mãi.
 *
 * Mọi ngưỡng lấy từ dữ liệu thật của quán, không chọn cho đẹp — số liệu ở
 * docs/30-KeHoach/P9/09-03-PLAN.md. Các ngưỡng dính nhau; `tests/print/cau-in.test.ts` khẳng định
 * quan hệ giữa chúng để ai sửa một con mà quên con kia thì test đỏ.
 */

/**
 * Cầu in báo sống 30 giây/lần (`NHIP_TIM_MS` trong scripts/print-bridge.mjs). Mất 3 nhịp liên tiếp
 * mới coi là chết: một nhịp trễ vì mạng chập mà đã chuyển sang in trình duyệt thì khi cầu in bắt
 * kịp, bếp nhận HAI tờ.
 */
export const NGUONG_MAT_KET_NOI_MS = 90_000;

/**
 * Phiếu `pending` quá hạn. p99 thời gian in qua cầu in = 67 giây; chỉ 4/2.482 phiếu thành công
 * vượt 120 giây (0,16%). Thấp hơn là cướp phiếu của một cầu in khỏe mà chậm.
 */
export const NGUONG_QUA_HAN_MS = 120_000;

/**
 * Lỗi dồn dập. Phân bố thật: lỗi lẻ 73 lần, đôi 39 lần là phần thân; từ 3 trở lên là phần đuôi —
 * có đợt tới 16 lỗi liền, tức máy in hết giấy hoặc rút dây trong lúc bếp đang chờ.
 */
export const NGUONG_LOI_DON_DAP = 3;
export const CUA_SO_LOI_MS = 5 * 60_000;

/**
 * Chip "Đang gửi bếp…" tự hỏi lại trạng thái. Cửa sổ hỏi PHẢI dài hơn ngưỡng quá hạn — trước đây
 * nó dừng sau 100 giây, tức là không bao giờ kịp đổi sang đỏ.
 */
export const CHIP_HOI_LAI_MS = 2500;
export const CHIP_SO_LAN_HOI = 60;

function mocGio(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

/**
 * Cầu in còn sống không. Chưa từng có nhịp tim (quán chưa lắp cầu in) → KHÔNG: xếp phiếu vào hàng
 * đợi không ai lấy chính là lỗi ngày 24/09.
 *
 * Mốc giờ nhịp tim do database ghi (`now()`), `now` ở đây là đồng hồ máy chủ app — cả hai đều đồng
 * bộ NTP. Không bao giờ so với đồng hồ laptop ở quán.
 */
export function cauInConSong(seenAt: string | null | undefined, now: number): boolean {
  const t = mocGio(seenAt);
  if (t === null) return false;
  return now - t <= NGUONG_MAT_KET_NOI_MS;
}

/** Phiếu `pending` đã chờ quá hạn. Mốc giờ hỏng → không kết luận: chip đỏ giả còn tệ hơn không. */
export function phieuQuaHan(createdAt: string | null | undefined, now: number): boolean {
  const t = mocGio(createdAt);
  if (t === null) return false;
  return now - t > NGUONG_QUA_HAN_MS;
}

/**
 * Đếm lỗi in trong cửa sổ 5 phút, bỏ qua lỗi xảy ra TRƯỚC lúc nhân viên bấm "Đã xử lý" — nếu không
 * thì băng cảnh báo cứ hiện lại với đúng những lỗi họ vừa xử lý xong, và sau hai ngày không ai nhìn.
 */
export function loiDonDap(
  failedAts: (string | null | undefined)[],
  now: number,
  daXuLyLuc: string | null | undefined
): { canhBao: boolean; soLoi: number } {
  const moc = Math.max(now - CUA_SO_LOI_MS, mocGio(daXuLyLuc) ?? -Infinity);
  let soLoi = 0;
  for (const iso of failedAts) {
    const t = mocGio(iso);
    if (t !== null && t > moc && t <= now) soLoi += 1;
  }
  return { canhBao: soLoi >= NGUONG_LOI_DON_DAP, soLoi };
}
