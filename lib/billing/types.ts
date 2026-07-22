/**
 * Kiểu dữ liệu bill/thanh toán (P4, §3.5). Giá integer VND. Snapshot từ order_items.
 * compute (tính tổng) tách sang compute.ts — thuần, có test.
 */

export type BillStatus = "open" | "paid" | "void";
export type DiscountType = "none" | "amount" | "percent";
export type PaymentMethod = "cash" | "transfer";

export type Bill = {
  id: string;
  bill_no: number | null;
  table_session_id: string | null;
  status: BillStatus;
  subtotal: number;
  discount_type: DiscountType;
  discount_value: number;
  discount_amount: number;
  service_charge_pct: number;
  service_charge_amount: number;
  vat_pct: number;
  vat_amount: number;
  total: number;
  note: string | null;
  created_at: string;
  paid_at: string | null;
};

export type BillItem = {
  id: string;
  bill_id: string;
  order_item_id: string;
  qty_allocated: number;
  unit_price_snapshot: number;
  amount: number;
};

export type Payment = {
  id: string;
  bill_id: string;
  method: PaymentMethod;
  amount: number;
  received_at: string;
  note: string | null;
};

/** 1 dòng hiển thị trên màn bill/hóa đơn (resolve tên từ order_items). */
export type BillLineView = {
  billItemId: string;
  orderItemId: string;
  name: string;
  qty: number;
  unitPrice: number;
  amount: number;
  modifiers: string[];
};

/** Kết quả tính tổng (integer VND). */
export type BillTotals = {
  subtotal: number;
  discountAmount: number;
  serviceChargeAmount: number;
  vatAmount: number;
  total: number;
};

/** Gói dữ liệu 1 bill cho POS panel + in hóa đơn. */
export type BillView = {
  id: string;
  billNo: number | null;
  status: BillStatus;
  tableSessionId: string | null;
  discountType: DiscountType;
  discountValue: number;
  serviceChargePct: number;
  vatPct: number;
  note: string | null;
  paidAt: string | null;
  /** ≠ null ⇒ hóa đơn "vỏ chứa" đã chia đều (không thu trực tiếp, không tính doanh thu). */
  splitCount: number | null;
  /** ≠ null ⇒ hóa đơn con của một lần chia đều. */
  splitParentId: string | null;
  lines: BillLineView[];
  totals: BillTotals;
  payments: Payment[];
};

/** Đầu vào tính tổng — chỉ số liệu cần cho công thức (không I/O). */
export type ComputeBillInput = {
  lines: { amount: number }[];
  discountType: DiscountType;
  discountValue: number;
  serviceChargePct: number;
  vatPct: number;
};
