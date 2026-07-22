/**
 * Kiểu dữ liệu đặt bàn (khớp cột DB migration 0014). reserved_at lưu UTC — hiển thị/gom
 * nhóm theo NGÀY VIỆT NAM (UTC+7) ở tầng UI/query. Khách gửi qua service role (D15).
 */

export type ReservationStatus = "pending" | "confirmed" | "rejected" | "cancelled";

export type Reservation = {
  id: string;
  tenant_id: string;
  customer_name: string;
  customer_phone: string;
  party_size: number;
  reserved_at: string;
  note: string | null;
  status: ReservationStatus;
  area_id: string | null;
  table_id: string | null;
  decided_by: string | null;
  decided_at: string | null;
  reject_reason: string | null;
  created_at: string;
  updated_at: string;
};

/** Bản ghi đặt bàn kèm tên khu vực + bàn (join) cho danh sách. */
export type ReservationView = Reservation & {
  area_name: string | null;
  table_name: string | null;
};

/** Đếm theo trạng thái cho KPI đầu trang admin. */
export type ReservationCounts = {
  pending: number;
  confirmed: number;
  rejected: number;
  cancelled: number;
};
