/**
 * Kiểu dữ liệu menu (khớp cột DB migration 0004 + 0006).
 * Giá lưu integer VND (không phần lẻ). image_url là ĐƯỜNG DẪN TƯƠNG ĐỐI trong bucket Storage;
 * host ghép ở biên đọc bằng `urlAnh` (QD-014) — đừng đưa thẳng vào `<Image src>`.
 */

export type Category = {
  id: string;
  tenant_id: string;
  name: string;
  sort_order: number;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type Item = {
  id: string;
  tenant_id: string;
  category_id: string;
  name: string;
  description: string | null;
  base_price: number; // VND integer
  image_url: string | null;
  is_available: boolean;
  sort_order: number;
  active: boolean;
  created_at: string;
  updated_at: string;
  /** Chuỗi (P15, 0063): id món ở chi nhánh gốc; rỗng = món riêng của quán. */
  source_id?: string | null;
  /** Chi nhánh đã tự sửa giá → đồng bộ thực đơn không ghi đè giá. */
  price_locked?: boolean;
};

/** Món kèm các nhóm tùy chọn đã gắn (dùng khi render ItemDialog). */
export type ItemWithGroups = Item & { group_ids: string[] };

export type ModifierGroup = {
  id: string;
  tenant_id: string;
  name: string;
  min_select: number;
  max_select: number;
  required: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type ModifierOption = {
  id: string;
  tenant_id: string;
  group_id: string;
  name: string;
  price_delta: number; // VND integer, >= 0 (V1)
  is_available: boolean;
  sort_order: number;
  created_at: string;
};

export type ModifierGroupWithOptions = ModifierGroup & {
  options: ModifierOption[];
};
