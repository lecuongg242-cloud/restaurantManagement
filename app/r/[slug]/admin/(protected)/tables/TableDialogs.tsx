"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Input } from "@/components/ui/input";
import type { Area, Table } from "@/lib/tables/types";
import { MAX_BULK, DEFAULT_SEATS, bulkNames, nextName } from "@/lib/tables/bulk";
import { createTable, updateTable, createTablesBulk, importTables } from "./actions";

export const selectCls =
  "h-9 min-w-0 rounded-md border border-hairline-strong bg-canvas px-md text-base text-ink sm:text-sm focus-visible:border-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary";

const labelCls = "flex flex-col gap-xxs text-sm text-slate";

/**
 * Submit tự xử lý (không dùng `<form action>`): React 19 tự reset form sau action, làm ô chọn khu / ô số (controlled)
 * nhảy về giá trị đầu trong DOM — lượt "Lưu & thêm tiếp" kế tiếp sẽ gửi sai khu. Gửi kèm nút đã bấm (intent).
 */
function useSubmit(run: (fd: FormData) => Promise<void>) {
  const [pending, start] = useTransition();
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
    start(async () => {
      await run(fd);
    });
  };
  return { pending, onSubmit };
}

/** Hộp thoại giữa màn (admin). Điện thoại: gần trọn bề ngang. */
function Modal({
  open,
  onClose,
  title,
  description,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/50 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[calc(100%-32px)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col overflow-y-auto rounded-xl bg-canvas p-lg shadow-modal outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95">
          <Dialog.Close
            aria-label="Đóng"
            className="absolute right-sm top-sm grid h-9 w-9 place-items-center rounded-full text-steel hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <X className="h-4 w-4" />
          </Dialog.Close>
          <Dialog.Title className="pr-xl text-lg font-semibold text-ink">{title}</Dialog.Title>
          {description ? (
            <Dialog.Description className="mt-xxs text-sm text-steel">{description}</Dialog.Description>
          ) : (
            <Dialog.Description className="sr-only">{title}</Dialog.Description>
          )}
          <div className="mt-md">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function AreaSelect({ areas, value, onChange, name = "area_id" }: {
  areas: Area[];
  value: string;
  onChange: (v: string) => void;
  name?: string;
}) {
  return (
    <select name={name} value={value} onChange={(e) => onChange(e.target.value)} className={`${selectCls} w-full`}>
      <option value="">Chưa xếp khu</option>
      {areas.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name}
        </option>
      ))}
    </select>
  );
}

/** "+ Thêm bàn" / "Sửa bàn". Thêm có "Lưu & thêm tiếp": giữ hộp thoại, tên tăng số cuối (Bàn 7 → Bàn 8). */
export function TableFormDialog({
  slug,
  areas,
  open,
  onClose,
  table,
  defaultAreaId,
}: {
  slug: string;
  areas: Area[];
  open: boolean;
  onClose: () => void;
  table: Table | null;
  defaultAreaId: string;
}) {
  const [name, setName] = useState("");
  const [areaId, setAreaId] = useState("");
  const [seats, setSeats] = useState(String(DEFAULT_SEATS));
  const nameRef = useRef<HTMLInputElement>(null);
  const { pending, onSubmit } = useSubmit(async (fd) => {
    if (table) {
      await updateTable(fd);
      onClose();
      return;
    }
    await createTable(fd);
    if (fd.get("intent") === "more") {
      setName(nextName(String(fd.get("name") ?? "")));
      nameRef.current?.focus();
    } else onClose();
  });

  useEffect(() => {
    if (!open) return;
    setName(table?.name ?? "");
    setAreaId(table ? (table.area_id ?? "") : defaultAreaId);
    setSeats(String(table?.seats ?? DEFAULT_SEATS));
  }, [open, table, defaultAreaId]);

  return (
    <Modal open={open} onClose={onClose} title={table ? `Sửa bàn ${table.name}` : "Thêm bàn"}>
      <form onSubmit={onSubmit} className="flex flex-col gap-md">
        <input type="hidden" name="slug" value={slug} />
        {table && <input type="hidden" name="id" value={table.id} />}
        <label className={labelCls}>
          Tên bàn
          <Input
            ref={nameRef}
            name="name"
            required
            maxLength={40}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Bàn 1"
            autoFocus
          />
        </label>
        <div className="grid grid-cols-[1fr_6rem] gap-sm">
          <label className={labelCls}>
            Khu vực
            <AreaSelect areas={areas} value={areaId} onChange={setAreaId} />
          </label>
          <label className={labelCls}>
            Số ghế
            <Input name="seats" type="number" min={1} max={999} value={seats} onChange={(e) => setSeats(e.target.value)} />
          </label>
        </div>
        <div className="flex flex-wrap justify-end gap-sm">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            Hủy
          </Button>
          {!table && (
            <Button type="submit" name="intent" value="more" variant="secondary" size="sm" disabled={pending}>
              Lưu & thêm tiếp
            </Button>
          )}
          <Button type="submit" name="intent" value="close" size="sm" disabled={pending} aria-busy={pending}>
            {pending ? "Đang lưu…" : "Lưu"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** "Thêm hàng loạt" (TABLE-07) — theo KiotViet: Tên, Số bắt đầu, Số lượng, Số ghế; xem trước tên sẽ tạo. */
export function BulkAddDialog({
  slug,
  areas,
  open,
  onClose,
  defaultAreaId,
  onDone,
}: {
  slug: string;
  areas: Area[];
  open: boolean;
  onClose: () => void;
  defaultAreaId: string;
  onDone: (areaId: string) => void;
}) {
  const [areaId, setAreaId] = useState("");
  const [prefix, setPrefix] = useState("Bàn");
  const [start, setStart] = useState("1");
  const [count, setCount] = useState("10");
  const [seats, setSeats] = useState(String(DEFAULT_SEATS));
  const { pending, onSubmit } = useSubmit(async (fd) => {
    await createTablesBulk(fd);
    onDone(areaId);
  });

  useEffect(() => {
    if (open) setAreaId(defaultAreaId);
  }, [open, defaultAreaId]);

  const n = parseInt(count, 10) || 0;
  const s = Math.max(0, parseInt(start, 10) || 0);
  const valid = n >= 1 && n <= MAX_BULK;
  const preview = valid
    ? (n <= 4 ? bulkNames(prefix, s, n) : [...bulkNames(prefix, s, 3), "…", ...bulkNames(prefix, s + n - 1, 1)]).join(", ")
    : "";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Thêm hàng loạt"
      description="Tạo nhiều bàn đánh số liên tiếp trong một khu. Bàn trùng tên với bàn đã có sẽ được bỏ qua."
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-md">
        <input type="hidden" name="slug" value={slug} />
        <label className={labelCls}>
          Khu vực
          <AreaSelect areas={areas} value={areaId} onChange={setAreaId} />
        </label>
        <div className="grid grid-cols-2 gap-sm sm:grid-cols-[1fr_5.5rem_5.5rem_5rem]">
          <label className={`${labelCls} col-span-2 sm:col-span-1`}>
            Tên bàn
            <Input name="prefix" maxLength={30} value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="Bàn" />
          </label>
          <label className={labelCls}>
            Số bắt đầu
            <Input name="start" type="number" min={0} value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label className={labelCls}>
            Số lượng
            <Input name="count" type="number" min={1} max={MAX_BULK} required value={count} onChange={(e) => setCount(e.target.value)} />
          </label>
          <label className={labelCls}>
            Số ghế
            <Input name="seats" type="number" min={1} max={999} value={seats} onChange={(e) => setSeats(e.target.value)} />
          </label>
        </div>
        <p className="rounded-md bg-surface px-md py-sm text-sm text-slate" aria-live="polite">
          {valid ? (
            <>
              Sẽ tạo: <span className="text-ink">{preview}</span> ({n} bàn)
            </>
          ) : (
            <span className="text-status-late">Số lượng từ 1 đến {MAX_BULK}.</span>
          )}
        </p>
        <div className="flex justify-end gap-sm">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            Hủy
          </Button>
          <Button type="submit" size="sm" disabled={!valid || pending} aria-busy={pending}>
            {pending ? "Đang tạo…" : valid ? `Tạo ${n} bàn` : "Tạo bàn"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** "Nhập Excel" (TABLE-08): tải file mẫu → điền → chọn file → Nhập. */
export function ImportDialog({ slug, open, onClose }: { slug: string; open: boolean; onClose: () => void }) {
  const [file, setFile] = useState<string>("");
  useEffect(() => {
    if (open) setFile("");
  }, [open]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nhập bàn từ Excel"
      description="Mỗi dòng một bàn. Khu vực chưa có sẽ được tạo mới; bàn trùng tên trong khu sẽ được bỏ qua."
    >
      <form
        action={async (fd) => {
          await importTables(fd);
          onClose();
        }}
        className="flex flex-col gap-md"
      >
        <input type="hidden" name="slug" value={slug} />
        <ol className="flex list-decimal flex-col gap-sm pl-lg text-sm text-slate">
          <li>
            <a href={`/r/${slug}/admin/tables/mau-nhap`} className="text-primary underline-offset-4 hover:underline">
              Tải file mẫu
            </a>{" "}
            rồi điền các cột <b className="font-medium text-ink">Tên bàn</b>, <b className="font-medium text-ink">Khu vực</b>,{" "}
            <b className="font-medium text-ink">Số ghế</b> (tối đa 500 dòng).
          </li>
          <li>
            Chọn file đã điền:
            <input
              name="file"
              type="file"
              required
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => setFile(e.target.files?.[0]?.name ?? "")}
              className="mt-xs block w-full text-sm text-ink file:mr-sm file:h-9 file:rounded-md file:border file:border-hairline-strong file:bg-canvas file:px-md file:text-sm file:text-ink hover:file:bg-surface"
            />
          </li>
        </ol>
        <div className="flex justify-end gap-sm">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            Hủy
          </Button>
          <SubmitButton size="sm" disabled={!file} pendingLabel="Đang nhập…">
            Nhập
          </SubmitButton>
        </div>
      </form>
    </Modal>
  );
}
