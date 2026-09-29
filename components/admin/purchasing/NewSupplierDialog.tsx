"use client";

import { useRef } from "react";
import { SubmitButton } from "@/components/ui/submit-button";
import { SupplierFields } from "@/components/admin/purchasing/SupplierFields";
import { createSupplier } from "@/app/r/[slug]/admin/(protected)/nha-cung-cap/actions";

/**
 * "+ Nhà cung cấp" mở HỘP THOẠI (chủ dự án chốt G4, 30/09/2026 — như KiotViet). Lưu được thì đóng + xóa form; lỗi thì giữ
 * hộp thoại mở để sửa (lời báo lỗi hiện ở thông báo góc màn hình như mọi form khác).
 */
export function NewSupplierDialog({ slug }: { slug: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const close = () => dialog.current?.close();

  return (
    <>
      <button
        type="button"
        onClick={() => dialog.current?.showModal()}
        className="inline-flex h-9 items-center rounded-md bg-primary px-md text-sm font-medium text-primary-fg hover:bg-primary-deep"
      >
        + Nhà cung cấp
      </button>
      <dialog
        ref={dialog}
        aria-labelledby="them-ncc"
        className="m-auto w-[calc(100%-2rem)] max-w-3xl rounded-lg border border-hairline-soft bg-canvas p-0 text-ink shadow-modal backdrop:bg-ink/40"
      >
        <form
          ref={form}
          action={async (fd) => {
            const r = await createSupplier(fd);
            if (r.ok) {
              form.current?.reset();
              close();
            }
          }}
          className="flex flex-col gap-md p-lg"
        >
          <div className="flex items-center justify-between gap-md">
            <h2 id="them-ncc" className="font-display text-xl">
              Thêm nhà cung cấp
            </h2>
            <button type="button" onClick={close} aria-label="Đóng" className="grid h-9 w-9 place-items-center rounded-md text-steel hover:bg-surface">
              ✕
            </button>
          </div>
          <input type="hidden" name="slug" value={slug} />
          <SupplierFields />
          <div className="flex justify-end gap-sm">
            <button type="button" onClick={close} className="inline-flex h-11 items-center rounded-md border border-hairline-strong px-lg text-sm text-ink hover:bg-surface">
              Bỏ qua
            </button>
            <SubmitButton pendingLabel="Đang lưu…">Lưu</SubmitButton>
          </div>
        </form>
      </dialog>
    </>
  );
}
