/**
 * Shape + đọc/ghi an toàn cho tenants.settings (jsonb). Không cần migration —
 * cột settings đã có từ 0001. Cấu hình bill (phí/VAT/footer) + cờ duyệt order QR.
 * parseSettings luôn trả object đủ field (merge default) + clamp pct trong [0,100].
 */

/** Chế độ phục vụ: 'table' = theo bàn (sơ đồ bàn), 'counter' = bán tại quầy (không bàn). */
export type ServiceMode = "table" | "counter";

/**
 * Đường in của quán (PRINT-10, QD-019 D5). `browser` = in qua hộp thoại trình duyệt ở máy có máy in;
 * `bridge` = phiếu bếp vào hàng đợi `print_jobs` cho cầu in cục bộ. Theo TỪNG quán — trước đây là
 * một biến môi trường nhúng lúc build, một công tắc cho mọi quán.
 */
export type PrintMode = "browser" | "bridge";

/**
 * Tài khoản nhận chuyển khoản của quán (PAY-02, QD-021 D3) — dựng VietQR in trên hóa đơn.
 * `bin` 6 số (NAPAS), `account_no` 6–19 chữ số, `account_name` IN HOA không dấu (đúng như ngân hàng in).
 */
export type BankAccount = { bin: string; account_no: string; account_name: string };

/**
 * Một dòng "Thuế nộp nhà nước" (P20 QD-027 C9) — quán tự khai, hệ thống không cài luật thuế cứng: "10% doanh thu",
 * "GTGT 3% + TNCN 1,5% doanh thu", "TNCN 17% lợi nhuận"… Chỉ dùng để ƯỚC TÍNH trong báo cáo Kết quả kinh doanh; KHÁC
 * `vat_pct` (VAT cộng vào hóa đơn, khách trả).
 */
export type TaxLine = { name: string; pct: number; base: "revenue" | "profit" };
export const MAX_TAX_LINES = 5;

export type TenantSettings = {
  currency: "VND";
  service_charge_pct: number; // [0,100]
  vat_pct: number; // [0,100]
  allow_discount: boolean;
  qr_order_auto_send: boolean;
  receipt_footer: string;
  service_mode: ServiceMode;
  print_mode: PrintMode;
  onboarding_done: boolean;
  /** Không có = quán chưa khai tài khoản ⇒ hóa đơn không có QR, chuyển khoản vẫn ghi nhận như cũ. */
  bank?: BankAccount;
  /** In QR chuyển khoản lên hóa đơn chưa thanh toán (QD-021 D5). Mặc định bật; chỉ có tác dụng khi có `bank`. */
  print_qr_on_receipt: boolean;
  /** Thông tin công khai của chi nhánh — hiện trên trang chuỗi /b/{brand} (P15 15-05). Rỗng = không hiện. */
  address: string;
  phone: string;
  /** Giờ mở / đóng cửa "HH:MM" (giờ VN). Đóng < mở = qua nửa đêm. Rỗng = không hiện trạng thái mở/đóng. */
  open_time: string;
  close_time: string;
  /** Thuế nộp nhà nước (ước tính trên báo cáo Kết quả kinh doanh). Rỗng = không hiện khối thuế. */
  taxes: TaxLine[];
};

export const DEFAULT_SETTINGS: TenantSettings = {
  currency: "VND",
  service_charge_pct: 0,
  vat_pct: 0,
  allow_discount: true,
  qr_order_auto_send: false,
  receipt_footer: "",
  service_mode: "table",
  print_mode: "browser",
  onboarding_done: false,
  print_qr_on_receipt: true,
  address: "",
  phone: "",
  open_time: "",
  close_time: "",
  taxes: [],
};

/** Ép số + clamp về [0,100]; giá trị không hợp lệ → 0. */
function clampPct(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n)));
}

function asBool(v: unknown, fallback: boolean): boolean {
  if (typeof v === "boolean") return v;
  if (v === "true") return true;
  if (v === "false") return false;
  return fallback;
}

/**
 * Khối `bank` hợp lệ trọn vẹn thì giữ, thiếu/sai bất kỳ trường nào thì bỏ cả khối — một QR dựng từ
 * nửa tài khoản là tiền khách chuyển đi lạc.
 */
export function parseBank(v: unknown): BankAccount | undefined {
  if (!v || typeof v !== "object") return undefined;
  const o = v as Record<string, unknown>;
  const { bin, account_no, account_name } = o;
  if (typeof bin !== "string" || !/^\d{6}$/.test(bin)) return undefined;
  if (typeof account_no !== "string" || !/^\d{6,19}$/.test(account_no)) return undefined;
  if (typeof account_name !== "string" || !/^[A-Z0-9 ]{1,50}$/.test(account_name)) return undefined;
  return { bin, account_no, account_name };
}

/** Danh sách thuế hợp lệ: tên 1–60 ký tự, % trong (0, 100] làm tròn 2 số lẻ, cơ sở doanh thu / lợi nhuận; tối đa 5 dòng. */
export function parseTaxes(v: unknown): TaxLine[] {
  if (!Array.isArray(v)) return [];
  const out: TaxLine[] = [];
  for (const x of v) {
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    const name = typeof o.name === "string" ? o.name.trim().slice(0, 60) : "";
    const pct = typeof o.pct === "number" ? o.pct : Number(o.pct);
    if (!name || !Number.isFinite(pct) || pct <= 0 || pct > 100) continue;
    if (o.base !== "revenue" && o.base !== "profit") continue;
    out.push({ name, pct: Math.round(pct * 100) / 100, base: o.base });
    if (out.length === MAX_TAX_LINES) break;
  }
  return out;
}

/** Merge jsonb (có thể thiếu field/sai kiểu) với default → TenantSettings đủ. */
export function parseSettings(raw: unknown): TenantSettings {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const bank = parseBank(o.bank);
  return {
    currency: "VND",
    service_charge_pct: clampPct(o.service_charge_pct ?? DEFAULT_SETTINGS.service_charge_pct),
    vat_pct: clampPct(o.vat_pct ?? DEFAULT_SETTINGS.vat_pct),
    allow_discount: asBool(o.allow_discount, DEFAULT_SETTINGS.allow_discount),
    qr_order_auto_send: asBool(o.qr_order_auto_send, DEFAULT_SETTINGS.qr_order_auto_send),
    receipt_footer:
      typeof o.receipt_footer === "string"
        ? o.receipt_footer.slice(0, 500)
        : DEFAULT_SETTINGS.receipt_footer,
    service_mode: o.service_mode === "counter" ? "counter" : "table",
    print_mode: o.print_mode === "bridge" ? "bridge" : "browser",
    onboarding_done: asBool(o.onboarding_done, DEFAULT_SETTINGS.onboarding_done),
    ...(bank ? { bank } : {}),
    print_qr_on_receipt: asBool(o.print_qr_on_receipt, DEFAULT_SETTINGS.print_qr_on_receipt),
    address: typeof o.address === "string" ? o.address.trim().slice(0, 200) : "",
    phone: typeof o.phone === "string" ? o.phone.trim().slice(0, 30) : "",
    open_time: gioHopLe(o.open_time),
    close_time: gioHopLe(o.close_time),
    taxes: parseTaxes(o.taxes),
  };
}

/** "7:05" / "07:05" → "07:05"; sai định dạng → "". */
function gioHopLe(v: unknown): string {
  if (typeof v !== "string") return "";
  const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
  if (!m) return "";
  const h = Number(m[1]);
  const p = Number(m[2]);
  return h <= 23 && p <= 59 ? `${String(h).padStart(2, "0")}:${m[2]}` : "";
}

/** Chuẩn hóa input người dùng thành object để ghi jsonb (đã clamp/validate). */
export function serializeSettings(input: Partial<TenantSettings>): TenantSettings {
  return parseSettings({ ...DEFAULT_SETTINGS, ...input });
}
