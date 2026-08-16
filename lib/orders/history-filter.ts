/**
 * Chip lọc của màn lịch sử POS (ORDER-18) → danh sách `orders.status` cần truy vấn.
 *
 * Lọc phải chạy Ở SERVER. Lọc trong mảng đã tải thì đơn hủy nằm ngoài trang 20 hiện tại sẽ biến
 * mất khỏi kết quả — đúng cái lỗi mà phần tìm kiếm đã từng mắc và đã phải sửa.
 */

export type HistoryStatusFilter = "all" | "paid" | "cancelled";

/** Trạng thái đơn ĐÃ KẾT THÚC mà màn lịch sử quan tâm. */
export type FinishedOrderStatus = "completed" | "cancelled";

export function historyStatuses(f: HistoryStatusFilter): FinishedOrderStatus[] {
  if (f === "paid") return ["completed"];
  if (f === "cancelled") return ["cancelled"];
  return ["completed", "cancelled"];
}

/** Server action nhận chuỗi từ client — không tin, phải kiểm. */
export function isHistoryStatusFilter(v: unknown): v is HistoryStatusFilter {
  return v === "all" || v === "paid" || v === "cancelled";
}
