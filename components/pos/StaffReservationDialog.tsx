"use client";

import { useEffect, useState, useTransition } from "react";
import { X, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, type SelectGroup } from "@/components/ui/select";
import { QtyStepper } from "@/components/customer/QtyStepper";
import { createReservationAction } from "@/app/r/[slug]/pos/actions";

/** Gom bàn theo khu vực thành nhóm cho Select (bàn không có khu vực → "Khác"). */
export function buildTableGroups(
  areas: { id: string; name: string }[],
  tables: { id: string; name: string; area_id: string | null }[]
): SelectGroup[] {
  const grouped = areas
    .map((a) => ({
      label: a.name,
      items: tables.filter((t) => t.area_id === a.id).map((t) => ({ value: t.id, label: `Bàn ${t.name}` })),
    }))
    .filter((g) => g.items.length > 0);
  const orphan = tables.filter((t) => !t.area_id);
  if (orphan.length > 0) {
    grouped.push({ label: "Khác", items: orphan.map((t) => ({ value: t.id, label: `Bàn ${t.name}` })) });
  }
  return grouped;
}

/** datetime-local (giờ VN, không tz) → ISO có offset +07:00. */
function toVnIso(raw: string): string {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw) ? `${raw}:00+07:00` : raw;
}

/**
 * Đặt bàn hộ khách trên POS (thu ngân/phục vụ nghe điện thoại). Tạo thẳng 'confirmed'
 * (createReservationAction). KHÔNG giữ bàn — chỉ ghi lịch; xếp bàn thủ công khi khách tới.
 */
export function StaffReservationDialog({
  slug,
  areas,
  tables,
  onClose,
}: {
  slug: string;
  areas: { id: string; name: string }[];
  tables: { id: string; name: string; area_id: string | null }[];
  onClose: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [partySize, setPartySize] = useState(2);
  const [reservedAt, setReservedAt] = useState("");
  const [tableId, setTableId] = useState("");
  const [note, setNote] = useState("");
  const [minDateTime, setMinDateTime] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const now = new Date(Date.now() - new Date().getTimezoneOffset() * 60000);
    setMinDateTime(now.toISOString().slice(0, 16));
  }, []);

  const ready = !!name.trim() && !!phone.trim() && !!reservedAt && partySize >= 1;

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const res = await createReservationAction(slug, {
        customerName: name,
        customerPhone: phone,
        partySize,
        reservedAt: toVnIso(reservedAt),
        note,
        tableId: tableId || null,
      });
      if (!res.ok) setError(res.error);
      else setDone(true);
    });
  };

  const fieldClass =
    "h-11 w-full rounded-md border border-hairline-strong bg-canvas px-md py-sm text-sm text-ink focus-visible:border-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary";
  const labelClass = "flex flex-col gap-xxs text-sm text-slate";

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-ink/50 p-md" role="dialog" aria-modal="true" aria-label="Đặt bàn cho khách">
      <div className="flex max-h-[88vh] w-full max-w-md flex-col overflow-hidden rounded-xl bg-canvas shadow-modal">
        <div className="flex items-center justify-between border-b border-hairline-soft px-lg py-md">
          <h3 className="font-display text-lg text-ink">Đặt bàn cho khách</h3>
          <button type="button" onClick={onClose} aria-label="Đóng" className="grid h-9 w-9 place-items-center rounded-md text-steel hover:bg-surface">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-lg py-md">
          {done ? (
            <div className="rounded-md bg-surface p-lg text-center">
              <Check className="mx-auto h-8 w-8 text-status-ready" />
              <p className="mt-sm text-sm text-ink">Đã ghi đặt bàn (đã xác nhận).</p>
              <p className="mt-xxs text-xs text-steel">Xem ở khu Quản trị · Đặt bàn theo ngày.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-md">
              {error && (
                <p role="alert" className="rounded-md border border-status-late bg-cream-soft px-md py-sm text-sm text-status-late">
                  {error}
                </p>
              )}
              <label className={labelClass}>
                Tên khách
                <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Anh Nam" autoFocus />
              </label>
              <label className={labelClass}>
                Số điện thoại
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" inputMode="tel" maxLength={20} placeholder="09xx xxx xxx" />
              </label>
              <div className="flex flex-wrap items-end gap-md">
                <div className={labelClass}>
                  Số người
                  <QtyStepper value={partySize} onChange={setPartySize} min={1} max={50} />
                </div>
                {tables.length > 0 && (
                  <div className={`${labelClass} min-w-[10rem] flex-1`}>
                    Bàn (tùy chọn)
                    <Select
                      value={tableId}
                      onValueChange={setTableId}
                      placeholder="Chưa gán"
                      clearLabel="Chưa gán"
                      groups={buildTableGroups(areas, tables)}
                      ariaLabel="Chọn bàn"
                    />
                  </div>
                )}
              </div>
              <label className={labelClass}>
                Ngày giờ
                <input type="datetime-local" value={reservedAt} min={minDateTime} onChange={(e) => setReservedAt(e.target.value)} className={fieldClass} />
              </label>
              <label className={labelClass}>
                Ghi chú
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={500}
                  rows={2}
                  placeholder="VD: cần ghế em bé, gần cửa sổ…"
                  className="rounded-md border border-hairline-strong bg-canvas px-md py-sm text-sm text-ink placeholder:text-muted focus-visible:border-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                />
              </label>
            </div>
          )}
        </div>

        <div className="border-t border-hairline-soft px-lg py-md">
          {done ? (
            <Button variant="primary" size="md" className="w-full" onClick={onClose}>
              Xong
            </Button>
          ) : (
            <Button variant="primary" size="md" className="w-full" disabled={!ready || isPending} onClick={submit}>
              {isPending ? "Đang lưu…" : "Xác nhận đặt bàn"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
