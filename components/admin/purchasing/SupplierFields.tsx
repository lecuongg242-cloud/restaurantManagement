import { Input } from "@/components/ui/input";
import type { Supplier } from "@/lib/purchasing/data";

const label = "flex min-w-0 flex-col gap-xxs text-sm text-slate";

/** Các ô của form nhà cung cấp — dùng chung cho "+ Nhà cung cấp" và màn sửa. Trường như KiotViet / POS365. */
export function SupplierFields({ s }: { s?: Supplier }) {
  return (
    <div className="grid gap-md sm:grid-cols-2 xl:grid-cols-3">
      <label className={label}>
        Tên nhà cung cấp *
        <Input name="name" required maxLength={120} defaultValue={s?.name ?? ""} placeholder="Mối thịt chị Lan" />
      </label>
      <label className={label}>
        Số điện thoại
        <Input name="phone" type="tel" maxLength={20} defaultValue={s?.phone ?? ""} placeholder="0912 345 678" />
      </label>
      <label className={label}>
        Mã số thuế
        <Input name="tax_code" maxLength={14} defaultValue={s?.tax_code ?? ""} />
      </label>
      <label className={label}>
        Email
        <Input name="email" type="email" maxLength={120} defaultValue={s?.email ?? ""} />
      </label>
      <label className={`${label} xl:col-span-2`}>
        Địa chỉ
        <Input name="address" maxLength={200} defaultValue={s?.address ?? ""} />
      </label>
      <label className={`${label} sm:col-span-2 xl:col-span-3`}>
        Ghi chú
        <Input name="note" maxLength={500} defaultValue={s?.note ?? ""} placeholder="Giao 6h sáng, trả tiền cuối tuần" />
      </label>
    </div>
  );
}
