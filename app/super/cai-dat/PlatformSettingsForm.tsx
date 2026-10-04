"use client";

import { useActionState } from "react";
import { savePlatformSettings, type SuperActionState } from "../actions";
import { BANKS } from "@/lib/payments/banks";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";

const EMPTY: SuperActionState = {};
const SELECT =
  "w-full min-w-0 rounded-md border border-hairline-strong bg-canvas px-md py-sm text-base text-ink sm:text-sm focus-visible:border-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary";

export type GiaTriForm = {
  bank_bin: string;
  bank_account_no: string;
  bank_account_name: string;
  support_phone: string;
};

/** Form cài đặt nền tảng (0060). Lỗi/xong hiện ngay cạnh nút, không rời trang. */
export function PlatformSettingsForm({ giaTri }: { giaTri: GiaTriForm }) {
  const [state, action] = useActionState(savePlatformSettings, EMPTY);
  return (
    <form action={action} className="flex flex-col gap-lg">
      <fieldset className="flex flex-col gap-md">
        <legend className="font-semibold text-lg text-ink">Tài khoản nhận tiền gia hạn</legend>
        <p className="text-sm text-steel">Mã QR trên trang Gia hạn của mọi quán chuyển tiền về tài khoản này.</p>
        <label className="flex min-w-0 max-w-md flex-col gap-xxs text-sm text-slate">
          Ngân hàng
          <select name="bank_bin" defaultValue={giaTri.bank_bin} className={SELECT}>
            <option value="">— Chọn ngân hàng —</option>
            {BANKS.map((b) => (
              <option key={b.bin} value={b.bin}>
                {b.shortName} — {b.name}
              </option>
            ))}
          </select>
        </label>
        <div className="grid max-w-3xl gap-md sm:grid-cols-2">
          <label className="flex flex-col gap-xxs text-sm text-slate">
            Số tài khoản
            <Input
              name="bank_account_no"
              inputMode="numeric"
              autoComplete="off"
              defaultValue={giaTri.bank_account_no}
              placeholder="Chỉ chữ số, 6–19 số"
            />
          </label>
          <label className="flex flex-col gap-xxs text-sm text-slate">
            Tên chủ tài khoản
            <Input
              name="bank_account_name"
              autoComplete="off"
              defaultValue={giaTri.bank_account_name}
              placeholder="NGUYEN VAN A"
              className="uppercase"
            />
            <span className="text-xs text-steel">Tự chuyển thành IN HOA không dấu, đúng như ngân hàng in.</span>
          </label>
        </div>
        <p className="text-xs text-steel">Để trống số tài khoản rồi lưu = gỡ tài khoản.</p>
      </fieldset>

      <fieldset className="flex flex-col gap-md">
        <legend className="font-semibold text-lg text-ink">Hỗ trợ</legend>
        <label className="flex max-w-xs flex-col gap-xxs text-sm text-slate">
          Số điện thoại hỗ trợ
          <Input
            name="support_phone"
            type="tel"
            maxLength={30}
            defaultValue={giaTri.support_phone}
            placeholder="0900 000 000"
          />
          <span className="text-xs text-steel">Hiện trên trang Gia hạn và màn &ldquo;Hết hạn sử dụng&rdquo;.</span>
        </label>
      </fieldset>

      <div className="flex flex-wrap items-center gap-md">
        <SubmitButton pendingLabel="Đang lưu…">Lưu cài đặt</SubmitButton>
        {state.ok && <p className="text-sm text-status-ready">{state.ok}</p>}
        {state.error && <p className="text-sm text-status-late">{state.error}</p>}
      </div>
    </form>
  );
}
