"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { Select } from "@/components/ui/select";
import { QtyStepper } from "@/components/customer/QtyStepper";

/**
 * Form đặt bàn khách (RESV-01) — editorial, mobile-first (≤360px). Validate nhẹ ở client
 * (ngày giờ tương lai, SĐT), server re-validate qua createReservation. datetime-local là
 * giờ VN; action gắn offset +07:00. Khu vực tùy chọn (chỉ hiện khi nhà hàng có khai báo).
 */
export function ReservationForm({
  slug,
  areas,
  action,
}: {
  slug: string;
  areas: { id: string; name: string }[];
  action: (formData: FormData) => void | Promise<void>;
}) {
  // min cho datetime-local = thời điểm hiện tại (giờ trình duyệt) — set sau mount để tránh
  // lệch hydrate SSR/CSR. Format 'YYYY-MM-DDTHH:MM'.
  const [minDateTime, setMinDateTime] = useState<string | undefined>(undefined);
  const [partySize, setPartySize] = useState(2);
  const [areaId, setAreaId] = useState("");
  useEffect(() => {
    const now = new Date(Date.now() - new Date().getTimezoneOffset() * 60000);
    setMinDateTime(now.toISOString().slice(0, 16));
  }, []);

  const labelClass = "flex flex-col gap-xxs text-sm text-slate";
  const fieldClass =
    "h-11 w-full rounded-md border border-hairline-strong bg-canvas px-md py-sm text-base text-ink focus-visible:border-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary sm:text-sm";

  return (
    <form action={action} className="flex flex-col gap-md">
      <input type="hidden" name="slug" value={slug} />

      <label className={labelClass}>
        Tên người đặt
        <Input name="customer_name" required autoComplete="name" maxLength={80} placeholder="Nguyễn Văn A" />
      </label>

      <label className={labelClass}>
        Số điện thoại
        <Input
          name="customer_phone"
          type="tel"
          required
          inputMode="tel"
          autoComplete="tel"
          maxLength={20}
          placeholder="09xx xxx xxx"
        />
      </label>

      <div className="flex flex-wrap items-end justify-between gap-md">
        <div className={labelClass}>
          Số người
          <input type="hidden" name="party_size" value={partySize} />
          <QtyStepper value={partySize} onChange={setPartySize} min={1} max={50} />
        </div>

        {areas.length > 0 && (
          <div className={`${labelClass} min-w-[9rem] flex-1`}>
            Khu vực (tùy chọn)
            <input type="hidden" name="area_id" value={areaId} />
            <Select
              value={areaId}
              onValueChange={setAreaId}
              placeholder="Không yêu cầu"
              clearLabel="Không yêu cầu"
              items={areas.map((a) => ({ value: a.id, label: a.name }))}
              ariaLabel="Chọn khu vực"
            />
          </div>
        )}
      </div>

      <label className={labelClass}>
        Ngày giờ mong muốn
        <input name="reserved_at" type="datetime-local" required min={minDateTime} className={fieldClass} />
      </label>

      <label className={labelClass}>
        Ghi chú (tùy chọn)
        <textarea
          name="note"
          rows={2}
          maxLength={500}
          placeholder="Ví dụ: cần ghế em bé, gần cửa sổ…"
          className="rounded-md border border-hairline-strong bg-canvas px-md py-sm text-base text-ink placeholder:text-muted focus-visible:border-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary sm:text-sm"
        />
      </label>

      <SubmitButton pendingLabel="Đang gửi…" className="mt-xs">
        Gửi yêu cầu đặt bàn
      </SubmitButton>
    </form>
  );
}
