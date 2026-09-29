/**
 * Cỡ chữ + khổ giấy của HÓA ĐƠN và PHIẾU KHÁCH — MỘT nguồn cho cả bản in trình duyệt (`ReceiptDoc`,
 * `CustomerTicketDoc`) lẫn ảnh phiếu cầu in (`lib/print/anh-phieu`). Hai đường in phải ra y hệt nhau
 * (chủ dự án, 30/09/2026: "dùng y hệt"); để hai bảng riêng là sớm muộn lệch nhau.
 *
 * Đơn vị: px CSS (bản trình duyệt). Ảnh cầu in nhân với `CHAM_MOI_PX`.
 */
export const CO_PHIEU_KHACH = {
  "58": { w: 240, base: 14, name: 15, no: 26, tenant: 16, lh: 1.4, page: "58mm auto", margin: "3mm", label: "58mm" },
  "80": { w: 320, base: 15, name: 17, no: 29, tenant: 19, lh: 1.4, page: "80mm auto", margin: "3mm", label: "80mm" },
  "a5": { w: 560, base: 20, name: 24, no: 40, tenant: 26, lh: 1.5, page: "A5", margin: "8mm", label: "A5 (to)" },
} as const;

export const CO_HOA_DON = {
  "58": { w: 240, base: 12, name: 13, total: 18, tenant: 15, lh: 1.45, page: "58mm auto", margin: "3mm", label: "58mm" },
  "80": { w: 320, base: 13, name: 14, total: 20, tenant: 17, lh: 1.45, page: "80mm auto", margin: "3mm", label: "80mm" },
} as const;

/**
 * Số chấm máy in nhiệt (203 dpi) cho 1 px CSS. Đo trên tờ phiếu khách in từ trình duyệt ở qt-food
 * (30/09/2026): mỗi ký tự JetBrains Mono rộng ~2,27 mm ⇒ cỡ chữ 15 px ra ~30 chấm — tức ~2 chấm/px
 * (lý thuyết 203/96 = 2,11; trình duyệt thu nhỏ nhẹ cho vừa vùng in).
 */
export const CHAM_MOI_PX = 2;
