"use client";

import { useActionState } from "react";
import { luuGhiChu, type KetQuaGhiChu } from "../actions";
import { SubmitButton } from "@/components/ui/submit-button";

export function NoteForm({ slug, phone, note }: { slug: string; phone: string; note: string }) {
  const [s, action] = useActionState(luuGhiChu, {} as KetQuaGhiChu);
  return (
    <form action={action} className="flex flex-col gap-sm">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="phone" value={phone} />
      <textarea
        name="note"
        rows={3}
        maxLength={500}
        defaultValue={note}
        placeholder="Dị ứng tôm, thích ngồi tầng 2, khách quen…"
        className="rounded-md border border-hairline-strong bg-canvas px-md py-sm text-base text-ink sm:text-sm"
      />
      <div className="flex items-center gap-sm">
        <SubmitButton size="sm" pendingLabel="Đang lưu…">
          Lưu ghi chú
        </SubmitButton>
        {s.ok && <span className="text-sm text-status-ready">{s.ok}</span>}
        {s.error && <span className="text-sm text-status-late">{s.error}</span>}
      </div>
    </form>
  );
}
