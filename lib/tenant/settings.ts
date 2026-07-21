/**
 * Shape + đọc/ghi an toàn cho tenants.settings (jsonb). Không cần migration —
 * cột settings đã có từ 0001. Cấu hình bill (phí/VAT/footer) + cờ duyệt order QR.
 * parseSettings luôn trả object đủ field (merge default) + clamp pct trong [0,100].
 */

export type TenantSettings = {
  currency: "VND";
  service_charge_pct: number; // [0,100]
  vat_pct: number; // [0,100]
  allow_discount: boolean;
  qr_order_auto_send: boolean;
  receipt_footer: string;
  onboarding_done: boolean;
};

export const DEFAULT_SETTINGS: TenantSettings = {
  currency: "VND",
  service_charge_pct: 0,
  vat_pct: 0,
  allow_discount: true,
  qr_order_auto_send: false,
  receipt_footer: "",
  onboarding_done: false,
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

/** Merge jsonb (có thể thiếu field/sai kiểu) với default → TenantSettings đủ. */
export function parseSettings(raw: unknown): TenantSettings {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
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
    onboarding_done: asBool(o.onboarding_done, DEFAULT_SETTINGS.onboarding_done),
  };
}

/** Chuẩn hóa input người dùng thành object để ghi jsonb (đã clamp/validate). */
export function serializeSettings(input: Partial<TenantSettings>): TenantSettings {
  return parseSettings({ ...DEFAULT_SETTINGS, ...input });
}
