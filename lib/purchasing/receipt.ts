/**
 * Tiền trên phiếu nhập (P20 / 20-01, QD-027 D3). Thuần — dùng cho form (hiện tổng ngay khi gõ) và kiểm ở server trước
 * khi gọi `save_purchase_receipt`. Số liệu CHỐT vẫn do hàm SQL tính; hai bên phải ra cùng một đồng.
 */

/** Số lượng làm tròn 3 chữ số lẻ — cột `qty numeric(14,3)`. Gửi đúng số này lên DB để thành tiền hai bên khớp. */
export function qty3(qty: number): number {
  return Math.round(qty * 1000) / 1000;
}

/**
 * Thành tiền = round(SL × đơn giá), làm tròn nửa lên như `round()` của Postgres với số dương. Tính bằng số nguyên
 * (phần nghìn) — 0,35 × 33.333 = 11.666,55 bằng số thực có thể ra 11.666,549999… và làm tròn sai một đồng.
 */
export function lineAmount(qty: number, unitPrice: number | null): number | null {
  if (unitPrice === null) return null;
  const n = Math.round(qty * 1000) * unitPrice;
  return Math.floor((n + 500) / 1000);
}

export type ReceiptLineInput = { qty: number; unit_price: number | null };

/** Tổng tiền hàng (chỉ dòng có giá) và "Cần trả NCC" = tổng − giảm giá. */
export function receiptTotals(lines: ReceiptLineInput[], discount: number): { subtotal: number; total: number } {
  const subtotal = lines.reduce((s, l) => s + (lineAmount(l.qty, l.unit_price) ?? 0), 0);
  return { subtotal, total: subtotal - discount };
}

/** Lỗi đọc được cho người dùng, hoặc null. Cùng luật với hàm SQL. */
export function validateReceipt(input: {
  lineCount: number;
  subtotal: number;
  discount: number;
  payNow: number;
  hasSupplier: boolean;
  complete: boolean;
}): string | null {
  if (input.lineCount === 0) return "Chưa nhập số lượng nào.";
  if (input.discount < 0 || input.discount > input.subtotal) return "Giảm giá không được lớn hơn tổng tiền hàng.";
  const total = input.subtotal - input.discount;
  if (input.payNow < 0 || input.payNow > total) return "Tiền trả nhà cung cấp không được lớn hơn số cần trả.";
  if (input.complete && !input.hasSupplier && input.payNow !== total) {
    return "Chưa chọn nhà cung cấp thì phải trả đủ — hoặc chọn nhà cung cấp để ghi nợ phần còn lại.";
  }
  return null;
}

/** Lỗi từ các hàm SQL phiếu nhập (mã trong `raise exception`) → câu tiếng Việt. */
export function purchaseErrorMessage(raw: string | undefined | null): string {
  const m = raw ?? "";
  const map: [string, string][] = [
    ["thieu_ncc_con_no", "Chưa chọn nhà cung cấp thì phải trả đủ số cần trả."],
    ["phieu_trong", "Chưa nhập số lượng nào."],
    ["dong_khong_hop_le", "Có dòng không hợp lệ (nguyên liệu đã ẩn hoặc không phải hàng mua vào, số lượng phải lớn hơn 0)."],
    ["giam_gia_khong_hop_le", "Giảm giá không được lớn hơn tổng tiền hàng."],
    ["tien_tra_khong_hop_le", "Tiền trả nhà cung cấp không được lớn hơn số cần trả."],
    ["ncc_khong_hop_le", "Nhà cung cấp không còn hoạt động."],
    ["khong_phai_phieu_tam", "Phiếu này đã hoàn thành hoặc đã hủy — không sửa được nữa."],
    ["da_huy", "Phiếu đã hủy trước đó."],
    ["da_co_ncc", "Phiếu đã có nhà cung cấp — không đổi được."],
    ["chi_sua_phieu_da_nhap", "Chỉ sửa được thông tin của phiếu đã nhập."],
    ["khong du quyen", "Không đủ quyền."],
  ];
  return map.find(([k]) => m.includes(k))?.[1] ?? `Lưu phiếu lỗi: ${m}`;
}

export const STATUS_LABEL: Record<"draft" | "done" | "cancelled", string> = {
  draft: "Phiếu tạm",
  done: "Đã nhập hàng",
  cancelled: "Đã hủy",
};

export const FUND_LABEL: Record<"cash" | "bank", string> = { cash: "Tiền mặt", bank: "Chuyển khoản" };

/** "2026-09-29" → "29/09/2026". Ngày chứng từ là ngày lịch, không có giờ ⇒ không qua múi giờ. */
export function ngayVn(day: string | null | undefined): string {
  if (!day) return "";
  const [y, m, d] = day.split("-");
  return `${d}/${m}/${y}`;
}
