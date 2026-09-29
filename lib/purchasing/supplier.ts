/**
 * Form nhà cung cấp (P20 / 20-01, PURCH-01). Thuần: chuẩn hóa trước khi ghi, cùng ràng buộc với bảng `suppliers` (0076).
 */
export type SupplierFields = {
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  tax_code: string | null;
  note: string | null;
};

const text = (v: FormDataEntryValue | null, max: number): string | null => {
  const s = String(v ?? "").trim();
  return s ? s.slice(0, max) : null;
};

/** "0912 345.678" → "0912345678"; bỏ +84 → 0. Rỗng = null. */
export function normalizePhone(raw: string): string | null {
  let d = raw.replace(/[^\d+]/g, "");
  if (d.startsWith("+84")) d = "0" + d.slice(3);
  else if (d.startsWith("84") && d.length >= 11) d = "0" + d.slice(2);
  d = d.replace(/\D/g, "");
  return d ? d : null;
}

export function parseSupplierForm(fd: FormData): { ok: true; value: SupplierFields } | { ok: false; error: string } {
  const name = text(fd.get("name"), 120);
  if (!name) return { ok: false, error: "Nhập tên nhà cung cấp." };
  const phone = normalizePhone(String(fd.get("phone") ?? ""));
  if (phone && !/^\d{8,15}$/.test(phone)) return { ok: false, error: "Số điện thoại không hợp lệ." };
  const tax = text(fd.get("tax_code"), 14);
  if (tax && !/^[0-9-]{10,14}$/.test(tax)) return { ok: false, error: "Mã số thuế gồm 10–14 chữ số (có thể có dấu -)." };
  const email = text(fd.get("email"), 120);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "Email không hợp lệ." };
  return {
    ok: true,
    value: { name, phone, email, address: text(fd.get("address"), 200), tax_code: tax, note: text(fd.get("note"), 500) },
  };
}
