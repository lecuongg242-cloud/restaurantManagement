"use client";

import { useActionState } from "react";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/forms";

/**
 * Form gọi server action theo kiểu useActionState: cập nhật TẠI CHỖ (URL không đổi),
 * phản hồi ok/error hiện inline ngay dưới form. Thay cho <form action={serverAction}>
 * kiểu cũ (redirect ?ok=/?error= làm đổi link).
 *
 * Dùng: <ActionForm action={updateSettings} className="...">...children (inputs + SubmitButton)...</ActionForm>
 * Action phải có chữ ký (prev: FormState, formData: FormData) => Promise<FormState>.
 */
export function ActionForm({
  action,
  children,
  className,
  hideOk = false,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  children: React.ReactNode;
  className?: string;
  /** Ẩn thông báo thành công (khi thay đổi đã hiển thị rõ trên danh sách). */
  hideOk?: boolean;
}) {
  const [state, dispatch] = useActionState(action, EMPTY_FORM_STATE);
  return (
    <form action={dispatch} className={className}>
      {children}
      {!hideOk && state.ok && (
        <p role="status" className="mt-xs w-full text-xs text-status-ready">
          {state.ok}
        </p>
      )}
      {state.error && (
        <p role="alert" className="mt-xs w-full text-xs text-status-late">
          {state.error}
        </p>
      )}
    </form>
  );
}
