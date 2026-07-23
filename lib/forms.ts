/**
 * State chuẩn cho server action cập nhật TẠI CHỖ (dùng với useActionState).
 * Không redirect → URL giữ nguyên; phản hồi hiện inline qua <ActionForm>.
 */
export type FormState = { ok?: string; error?: string };

export const EMPTY_FORM_STATE: FormState = {};
