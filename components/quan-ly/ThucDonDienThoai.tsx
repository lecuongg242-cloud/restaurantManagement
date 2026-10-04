"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { setItemAvailable, updateItem } from "@/app/r/[slug]/admin/(protected)/menu/actions";
import { formatVnd } from "@/lib/orders/cart";
import { MoneyInput } from "@/components/ui/money-input";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/lib/utils";

export type MonDT = { id: string; ten: string; moTa: string; gia: number; con: boolean; nhomId: string };

/**
 * Thực đơn trên điện thoại (Giao diện B8): ô tìm + chip nhóm; mỗi dòng tên · giá · công tắc Còn/Hết (đổi ngay, POS + QR
 * thấy "Hết"); chạm món → hộp "Sửa món" (Tên, Giá bán, Nhóm). Gọi server action của trang Thực đơn admin.
 */
export function ThucDonDienThoai({ slug, nhom, mon, suaDuoc }: { slug: string; nhom: { id: string; ten: string }[]; mon: MonDT[]; suaDuoc: boolean }) {
  const router = useRouter();
  const [tim, setTim] = useState("");
  const [nhomChon, setNhomChon] = useState<string | null>(null);
  const [con, setCon] = useState<Record<string, boolean>>({});
  const [loi, setLoi] = useState<string | null>(null);
  const [sua, setSua] = useState<MonDT | null>(null);
  const [, startTransition] = useTransition();

  const tenNhom = useMemo(() => new Map(nhom.map((n) => [n.id, n.ten])), [nhom]);
  const loc = useMemo(() => {
    const t = tim.trim().toLocaleLowerCase("vi");
    return mon.filter((m) => (!nhomChon || m.nhomId === nhomChon) && (!t || m.ten.toLocaleLowerCase("vi").includes(t)));
  }, [mon, tim, nhomChon]);

  function doiCon(m: MonDT) {
    const moi = !(con[m.id] ?? m.con);
    setCon((c) => ({ ...c, [m.id]: moi }));
    setLoi(null);
    startTransition(async () => {
      try {
        await setItemAvailable(slug, m.id, moi);
        router.refresh();
      } catch (e) {
        setCon((c) => ({ ...c, [m.id]: !moi }));
        setLoi(`Không đổi được “${m.ten}”: ${e instanceof Error ? e.message : "lỗi"}`);
      }
    });
  }

  return (
    <div className="flex flex-col gap-sm">
      <div className="relative">
        <Search className="pointer-events-none absolute left-sm top-1/2 size-4 -translate-y-1/2 text-steel" aria-hidden />
        <input
          value={tim}
          onChange={(e) => setTim(e.target.value)}
          type="search"
          placeholder="Tìm món"
          aria-label="Tìm món"
          className="h-11 w-full rounded-md border border-hairline-strong bg-canvas pl-[2.25rem] pr-sm text-base text-ink placeholder:text-steel"
        />
      </div>
      <div className="-mx-md flex gap-xs overflow-x-auto px-md pb-xxs [scrollbar-width:none]" role="group" aria-label="Nhóm món">
        {[{ id: null as string | null, ten: "Tất cả" }, ...nhom].map((n) => (
          <button
            key={n.id ?? "tat-ca"}
            type="button"
            onClick={() => setNhomChon(n.id)}
            aria-pressed={nhomChon === n.id}
            className={cn(
              "inline-flex min-h-9 shrink-0 items-center rounded-full border px-md text-sm",
              nhomChon === n.id ? "border-ink bg-ink text-canvas" : "border-hairline-strong bg-canvas text-slate"
            )}
          >
            {n.ten}
          </button>
        ))}
      </div>
      {loi && (
        <p role="alert" className="rounded-md border border-status-late bg-cream-soft px-md py-sm text-sm text-status-late">
          {loi}
        </p>
      )}

      {loc.length === 0 ? (
        <p className="py-lg text-center text-sm text-steel">Không có món khớp.</p>
      ) : (
        <ul className="divide-y divide-hairline-soft overflow-hidden rounded-lg border border-hairline-soft bg-canvas shadow-card">
          {loc.map((m) => {
            const dangCon = con[m.id] ?? m.con;
            return (
              <li key={m.id} className="flex min-h-14 items-center gap-sm pr-sm">
                <button
                  type="button"
                  disabled={!suaDuoc}
                  onClick={() => setSua(m)}
                  className="flex min-h-14 min-w-0 flex-1 flex-col justify-center px-md text-left active:bg-cream-soft disabled:active:bg-transparent"
                  aria-label={suaDuoc ? `Sửa món ${m.ten}` : m.ten}
                >
                  <span className={cn("truncate text-sm font-medium", dangCon ? "text-ink" : "text-steel line-through")}>{m.ten}</span>
                  <span className="truncate text-xs text-steel">
                    {formatVnd(m.gia)}
                    {!nhomChon && tenNhom.get(m.nhomId) ? ` · ${tenNhom.get(m.nhomId)}` : ""}
                  </span>
                </button>
                <button
                  type="button"
                  role="switch"
                  aria-checked={dangCon}
                  aria-label={`${m.ten}: ${dangCon ? "Còn" : "Hết"}`}
                  onClick={() => doiCon(m)}
                  className="flex min-h-11 shrink-0 items-center gap-xs"
                >
                  <span className={cn("w-8 text-right text-xs font-medium", dangCon ? "text-status-ready" : "text-status-late")}>{dangCon ? "Còn" : "Hết"}</span>
                  <span className={cn("relative h-6 w-11 rounded-full transition-colors", dangCon ? "bg-status-ready" : "bg-hairline-strong")}>
                    <span className={cn("absolute top-0.5 size-5 rounded-full bg-canvas shadow transition-all", dangCon ? "left-[22px]" : "left-0.5")} />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {sua && (
        <HopSuaMon
          slug={slug}
          mon={sua}
          nhom={nhom}
          dong={() => setSua(null)}
          daLuu={() => {
            setSua(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

/** Hộp "Sửa món" (Giao diện B8): Tên, Giá bán, Nhóm · "Lưu" / "Hủy". Mô tả giữ nguyên (gửi kèm, không xóa). */
function HopSuaMon({ slug, mon, nhom, dong, daLuu }: { slug: string; mon: MonDT; nhom: { id: string; ten: string }[]; dong: () => void; daLuu: () => void }) {
  const [gia, setGia] = useState(mon.gia);
  const hop = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    hop.current?.showModal();
  }, []);

  return (
    <dialog
      ref={hop}
      onClose={dong}
      aria-labelledby="sua-mon-tieu-de"
      className="m-0 mt-auto w-full max-w-none rounded-t-xl bg-canvas p-0 backdrop:bg-ink/40 sm:m-auto sm:max-w-[440px] sm:rounded-xl"
    >
      <form
        action={async (fd) => {
          await updateItem(fd);
          daLuu();
        }}
        className="flex flex-col gap-md p-lg pb-[calc(theme(spacing.lg)+env(safe-area-inset-bottom))]"
      >
        <h2 id="sua-mon-tieu-de" className="font-display text-lg text-ink">
          Sửa món
        </h2>
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="id" value={mon.id} />
        <input type="hidden" name="description" value={mon.moTa} />
        <input type="hidden" name="base_price" value={String(gia)} />
        <label className="flex flex-col gap-xxs text-sm text-slate">
          Tên
          <Input name="name" defaultValue={mon.ten} required maxLength={120} />
        </label>
        <label className="flex flex-col gap-xxs text-sm text-slate">
          Giá bán
          <MoneyInput value={gia} onChange={setGia} aria-label="Giá bán" />
        </label>
        <label className="flex flex-col gap-xxs text-sm text-slate">
          Nhóm
          <select
            name="category_id"
            defaultValue={mon.nhomId}
            className="h-11 rounded-md border border-hairline-strong bg-canvas px-sm text-base text-ink"
          >
            {nhom.map((n) => (
              <option key={n.id} value={n.id}>
                {n.ten}
              </option>
            ))}
          </select>
        </label>
        <div className="mt-xs grid grid-cols-2 gap-sm">
          <Button type="button" variant="secondary" size="lg" onClick={() => hop.current?.close()}>
            Hủy
          </Button>
          <SubmitButton size="lg" pendingLabel="Đang lưu…">
            Lưu
          </SubmitButton>
        </div>
      </form>
    </dialog>
  );
}
