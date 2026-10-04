"use client";

import { useActionState, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { quanLySignIn } from "./actions";
import { SubmitButton } from "@/components/ui/submit-button";
import { Input } from "@/components/ui/input";

/** Form đăng nhập app Quản lý (Giao diện B2): Email · Mật khẩu (nút hiện/ẩn) · "Đăng nhập". */
export function DangNhapForm() {
  const [state, action] = useActionState(quanLySignIn, {});
  const [hien, setHien] = useState(false);

  return (
    <form action={action} className="mt-lg flex flex-col gap-md">
      {state.error && (
        <p role="alert" className="rounded-md border border-status-late bg-cream-soft px-md py-sm text-sm text-status-late">
          {state.error}
        </p>
      )}
      <label className="flex flex-col gap-xxs text-sm text-slate">
        Email
        <Input name="email" type="email" required autoComplete="email" inputMode="email" />
      </label>
      <label className="flex flex-col gap-xxs text-sm text-slate">
        Mật khẩu
        <span className="relative">
          <Input name="password" type={hien ? "text" : "password"} required autoComplete="current-password" className="pr-xxl" />
          <button
            type="button"
            onClick={() => setHien((v) => !v)}
            aria-label={hien ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
            className="absolute inset-y-0 right-0 grid w-11 place-items-center text-steel"
          >
            {hien ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
          </button>
        </span>
      </label>
      <SubmitButton size="lg" pendingLabel="Đang đăng nhập…" className="mt-xs">
        Đăng nhập
      </SubmitButton>
    </form>
  );
}
