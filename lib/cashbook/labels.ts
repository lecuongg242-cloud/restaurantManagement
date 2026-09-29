/**
 * Sổ quỹ (P20 / 20-02, QD-027 D7–D10). Thuần — nhãn và quy đổi dùng ở màn, form và file xuất.
 *
 * Mục chi phí theo mẫu S2c-HKD, Thông tư 152/2025/TT-BTC (ký 31/12/2025, hiệu lực 01/01/2026). Mẫu sổ đổi thì sửa MỘT
 * chỗ này. Khoản nào được tính do quán tự cấu hình ở loại thu/chi — hệ thống không phán xét chứng từ.
 */
export type CostGroup = "a" | "b" | "c" | "d" | "dd" | "e" | "none";
export type Fund = "cash" | "bank";

export const COST_GROUP_LABEL: Record<CostGroup, string> = {
  a: "a) Nguyên liệu, vật liệu, nhiên liệu, hàng hóa",
  b: "b) Tiền lương, tiền công, phụ cấp, bảo hiểm",
  c: "c) Khấu hao tài sản cố định",
  d: "d) Dịch vụ mua ngoài (điện, nước, internet, thuê nhà, sửa chữa…)",
  dd: "đ) Lãi vay",
  e: "e) Chi khác",
  none: "Không tính vào chi phí",
};

export const FUND_LABEL: Record<Fund, string> = { cash: "Tiền mặt", bank: "Ngân hàng" };

export const COUNTERPARTY_LABEL = { supplier: "Nhà cung cấp", staff: "Nhân viên", other: "Khác" } as const;
export type CounterpartyKind = keyof typeof COUNTERPARTY_LABEL;

export const SOURCE_DOC_LABEL = {
  vat_invoice: "Hóa đơn GTGT",
  sales_invoice: "Hóa đơn bán hàng",
  no_invoice: "Không có hóa đơn",
  other: "Chứng từ khác",
} as const;
export type SourceDocKind = keyof typeof SOURCE_DOC_LABEL;

/** Phương thức thanh toán của hóa đơn bán → quỹ (chuyển khoản vào tài khoản ngân hàng của quán, P13). */
export function fundOf(method: "cash" | "transfer"): Fund {
  return method === "cash" ? "cash" : "bank";
}

/**
 * Ô `<input type="datetime-local">` trả "2026-09-29T21:30" KHÔNG kèm múi giờ — người ở quán nghĩ theo giờ VN, nên đọc
 * là +07:00 ở server (máy chủ chạy UTC). Sai định dạng → null.
 */
export function vnLocalToIso(v: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return null;
  const t = Date.parse(`${v}:00+07:00`);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

/** Ngược lại: ISO → giá trị cho `datetime-local` theo giờ VN. */
export function isoToVnLocal(iso: string): string {
  return new Date(Date.parse(iso) + 7 * 3600e3).toISOString().slice(0, 16);
}

/** Lỗi từ các hàm SQL sổ quỹ → câu tiếng Việt. */
export function cashErrorMessage(raw: string | undefined | null): string {
  const m = raw ?? "";
  const map: [string, string][] = [
    ["so_tien_khong_hop_le", "Giá trị phải lớn hơn 0."],
    ["loai_khong_hop_le", "Chọn loại thu / chi."],
    ["ncc_khong_hop_le", "Nhà cung cấp không hợp lệ (chỉ chọn được trên phiếu chi)."],
    ["ngay_tuong_lai", "Thời gian không được ở tương lai."],
    ["huy_tu_phieu_nhap", "Phiếu này sinh từ phiếu nhập — hủy bằng nút Hủy bỏ trên phiếu nhập."],
    ["da_huy", "Phiếu đã hủy trước đó."],
    ["khong du quyen", "Không đủ quyền."],
  ];
  return map.find(([k]) => m.includes(k))?.[1] ?? `Lưu phiếu lỗi: ${m}`;
}
