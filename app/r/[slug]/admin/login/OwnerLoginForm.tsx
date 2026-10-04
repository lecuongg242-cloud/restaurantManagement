"use client";

import { useActionState } from "react";
import { ownerSignIn } from "../actions";
import { SubmitButton } from "@/components/ui/submit-button";
import { Input } from "@/components/ui/input";

/**
 * Form đăng nhập owner: lỗi hiện inline (useActionState), không đổi link.
 * `chiQuanTri`: mở từ cửa sổ Quản trị của app (QD-033) — thu ngân đăng nhập thì báo không có quyền, không sang POS.
 */
export function OwnerLoginForm({ slug, chiQuanTri = false }: { slug: string; chiQuanTri?: boolean }) {
  const [state, action] = useActionState(ownerSignIn, {});

  return (
    <form action={action} className="mt-lg flex flex-col gap-md">
      <input type="hidden" name="slug" value={slug} />
      {chiQuanTri && <input type="hidden" name="chiQuanTri" value="1" />}

      {state.error && (
        <p
          role="alert"
          className="rounded-md border border-status-late bg-cream-soft px-md py-sm text-sm text-status-late"
        >
          {state.error}
        </p>
      )}

      <label className="flex flex-col gap-xxs text-sm text-slate">
        Email
        <Input name="email" type="email" required autoComplete="email" autoFocus />
      </label>
      <label className="flex flex-col gap-xxs text-sm text-slate">
        Mật khẩu
        <Input name="password" type="password" required autoComplete="current-password" />
      </label>
      <SubmitButton pendingLabel="Đang đăng nhập…" className="mt-xs">
        Đăng nhập
      </SubmitButton>
    </form>
  );
}
