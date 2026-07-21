/** Kiểu dữ liệu khu vực + bàn (khớp cột DB migration 0007). */

export type Area = {
  id: string;
  tenant_id: string;
  name: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type TableStatus = "available" | "occupied" | "reserved" | "cleaning";

export type Table = {
  id: string;
  tenant_id: string;
  area_id: string | null;
  name: string;
  seats: number;
  qr_token: string;
  status: TableStatus;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

/** Khu vực kèm các bàn thuộc khu (dùng khi render AreaTableManager). */
export type AreaWithTables = Area & { tables: Table[] };
